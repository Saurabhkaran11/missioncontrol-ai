import { route } from "@/server/api";
import { missionEvents, getOwnedMission } from "@/server/services/missions";

/**
 * Server-sent events backed by the persisted `agent_events` table. Clients
 * resume with Last-Event-ID (or ?after=seq), so a reconnect never loses or
 * duplicates events. Each stream lives ≤ 5 minutes; EventSource reconnects.
 */
export const GET = route(async ({ req, db, auth, params }) => {
  const missionId = params.missionId;
  await getOwnedMission(db, auth.orgId, missionId); // 404 before opening a stream
  let after =
    Number(
      req.headers.get("last-event-id") ??
        req.nextUrl.searchParams.get("after") ??
        0,
    ) || 0;
  const encoder = new TextEncoder();
  const deadline = Date.now() + 5 * 60_000;
  const stream = new ReadableStream({
    async start(controller) {
      const send = (s: string) => controller.enqueue(encoder.encode(s));
      send("retry: 2000\n\n");
      while (!req.signal.aborted && Date.now() < deadline) {
        const events = await missionEvents(db, auth.orgId, missionId, after);
        for (const e of events) {
          send(`id: ${e.seq}\nevent: agent\ndata: ${JSON.stringify(e)}\n\n`);
          after = e.seq;
        }
        const [m] = [await getOwnedMission(db, auth.orgId, missionId)];
        send(
          `event: mission\ndata: ${JSON.stringify({ status: m.status, progress: m.progress })}\n\n`,
        );
        await new Promise((r) => setTimeout(r, 1000));
      }
      controller.close();
    },
  });
  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
});
