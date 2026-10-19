// Liveness: the process is up. Reveals nothing about configuration.
export function GET() {
  return Response.json({ status: "ok", time: new Date().toISOString() });
}
