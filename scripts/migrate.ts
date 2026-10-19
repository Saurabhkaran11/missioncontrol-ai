import { dbHandle } from "@/db/client";

async function main() {
  // Applies drizzle/ migrations to DATABASE_URL (or the local PGlite dir) and exits.
  const h = dbHandle();
  await h.ready;
  console.log(`Migrations applied (${h.kind}).`);
  await h.close();

}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
