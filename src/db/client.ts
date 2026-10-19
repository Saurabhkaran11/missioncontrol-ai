import { PGlite } from "@electric-sql/pglite";
import {
  drizzle as drizzlePglite,
  type PgliteDatabase,
} from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { migrate as migratePg } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import path from "node:path";
import fs from "node:fs";
import * as schema from "./schema";
import { env } from "@/shared/env";

/**
 * Database access.
 *
 * - DATABASE_URL set  -> real PostgreSQL via node-postgres (staging/production,
 *   docker-compose). Web and worker run as separate processes.
 * - DATABASE_URL unset -> embedded PGlite (real Postgres compiled to WASM) in
 *   .data/pglite, so `npm run dev` works with zero setup. PGlite is
 *   single-process, so the worker runs embedded in the web process.
 *
 * Both drivers expose the same Drizzle query builder; we type the handle with
 * the PGlite flavour and the node-postgres instance is structurally identical
 * for every call this codebase makes.
 */
export type DB = PgliteDatabase<typeof schema>;
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
export type DbOrTx = DB | Tx;

type Handle = {
  db: DB;
  kind: "postgres" | "pglite";
  close: () => Promise<void>;
  ready: Promise<void>;
};

const MIGRATIONS = path.join(process.cwd(), "drizzle");

// Survives Next.js hot reloads and is shared by route handlers, the embedded
// worker and instrumentation in the same Node process.
const g = globalThis as unknown as { __mcDb?: Handle };

export function createDb(
  opts: { url?: string; dataDir?: string; memory?: boolean } = {},
): Handle {
  if (opts.url) {
    const pool = new Pool({ connectionString: opts.url, max: 10 });
    const db = drizzlePg(pool, { schema }) as unknown as DB;
    const ready = migratePg(drizzlePg(pool), { migrationsFolder: MIGRATIONS });
    return { db, kind: "postgres", close: () => pool.end(), ready };
  }
  let client: PGlite;
  if (opts.memory) {
    client = new PGlite();
  } else {
    const dir = path.resolve(opts.dataDir ?? ".data/pglite");
    fs.mkdirSync(dir, { recursive: true });
    client = new PGlite(dir);
  }
  const db = drizzlePglite(client, { schema });
  const ready = migratePglite(db, { migrationsFolder: MIGRATIONS });
  return { db, kind: "pglite", close: () => client.close(), ready };
}

export function dbHandle(): Handle {
  if (!g.__mcDb) {
    const e = env();
    g.__mcDb = createDb({ url: e.DATABASE_URL, dataDir: e.PGLITE_DATA_DIR });
  }
  return g.__mcDb;
}

/** Ready-to-use database (migrations applied). */
export async function getDb(): Promise<DB> {
  const h = dbHandle();
  await h.ready;
  return h.db;
}

/** Tests inject an in-memory database here. */
export function setDbForTests(handle: Handle) {
  g.__mcDb = handle;
}

export { schema };
