import { getDb, dbHandle } from "@/db/client";
import { seedOrganization } from "@/db/seed";
import { env } from "@/shared/env";

async function main() {
  // Idempotent demo seed: `npm run db:seed`. Creates the canonical sample
  // workspace "northwind-demo". Refuses to run when DEMO_MODE=false so sample
  // data never lands in a production tenant.

  if (!env().DEMO_MODE) {
    console.error("Refusing to seed: DEMO_MODE=false (production). Sample data is demo-only.");
    process.exit(1);
  }
  process.env.DEMO_STEP_DELAY_MS = "0";
  const db = await getDb();
  const res = await seedOrganization(db, { slug: "northwind-demo", orgName: "Northwind Assist — sample workspace", owner: { email: "riley@northwind-assist.example", name: "Riley Chen (fictional founder)" }, inProgressMission: false });
  console.log(res.created ? `Seeded sample workspace ${res.orgId}` : `Sample workspace already present (${res.orgId}) — nothing to do`);
  await dbHandle().close();

}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
