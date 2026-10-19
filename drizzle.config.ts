import { defineConfig } from "drizzle-kit";

// `npm run db:generate` diffs src/db/schema.ts into SQL migrations under
// drizzle/. Migrations are applied at startup by src/db/client.ts and by
// `npm run db:migrate` for production deploys.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
});
