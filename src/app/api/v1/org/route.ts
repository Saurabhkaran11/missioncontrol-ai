import { z } from "zod";
import { body, route } from "@/server/api";
import { destroySession } from "@/server/auth";
import { deleteOrganization } from "@/server/services/org";

export const DELETE = route(
  async ({ req, db, auth }) => {
    const { confirmName } = await body(
      req,
      z.object({ confirmName: z.string().max(200) }),
    );
    await deleteOrganization(db, auth, confirmName);
    await destroySession();
    return { redirect: "/" };
  },
  { perm: "data.delete" },
);
