import { route } from "@/server/api";
import { destroySession } from "@/server/auth";

export const POST = route(
  async () => {
    await destroySession();
    return { redirect: "/" };
  },
  { public: true },
);
