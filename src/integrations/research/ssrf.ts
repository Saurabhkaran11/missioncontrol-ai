import dns from "node:dns/promises";
import net from "node:net";

/**
 * SSRF guard for outbound research fetches.
 * Rejects non-http(s) schemes, embedded credentials, non-standard ports,
 * localhost names and any hostname resolving to a private, loopback,
 * link-local, CGNAT or cloud-metadata address.
 * Examples:
 *   "http://169.254.169.254/latest/meta-data" -> blocked (metadata)
 *   "file:///etc/passwd"                     -> blocked (scheme)
 *   "https://example.com/about"              -> allowed (public)
 */
export class UnsafeUrlError extends Error {
  constructor(reason: string) {
    super(`Blocked URL: ${reason}`);
    this.name = "UnsafeUrlError";
  }
}

export function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) || // CGNAT
      (a === 169 && b === 254) || // link-local + metadata
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  const v6 = ip.toLowerCase();
  if (v6.startsWith("::ffff:")) return isPrivateIp(v6.slice(7));
  return (
    v6 === "::" ||
    v6 === "::1" ||
    v6.startsWith("fc") ||
    v6.startsWith("fd") ||
    v6.startsWith("fe80") ||
    v6.startsWith("ff")
  );
}

export function assertSafeUrlSyntax(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UnsafeUrlError("not a valid URL");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:")
    throw new UnsafeUrlError(`scheme ${url.protocol} not allowed`);
  if (url.username || url.password)
    throw new UnsafeUrlError("credentials in URL");
  if (url.port && !["80", "443"].includes(url.port))
    throw new UnsafeUrlError("non-standard port");
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host === "metadata.google.internal"
  )
    throw new UnsafeUrlError("internal hostname");
  if (net.isIP(host) && isPrivateIp(host))
    throw new UnsafeUrlError("private address");
  return url;
}

export async function assertSafeUrl(
  raw: string,
  lookup = dns.lookup,
): Promise<URL> {
  const url = assertSafeUrlSyntax(raw);
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (!net.isIP(host)) {
    const addrs = await lookup(host, { all: true });
    if (!addrs.length || addrs.some((a) => isPrivateIp(a.address)))
      throw new UnsafeUrlError("resolves to a private address");
  }
  return url;
}

/**
 * Fetch with SSRF checks on every redirect hop, a timeout and a body cap.
 * Residual risk (documented): DNS could change between our lookup and the
 * socket connect (rebinding). Production should route through an egress
 * proxy that enforces the same denylist.
 */
export async function safeFetchText(
  raw: string,
  opts: { timeoutMs?: number; maxBytes?: number; maxRedirects?: number } = {},
) {
  let current = raw;
  for (let hop = 0; hop <= (opts.maxRedirects ?? 3); hop++) {
    const url = await assertSafeUrl(current);
    const res = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(opts.timeoutMs ?? 8000),
      headers: {
        "user-agent": "MissionControlResearchBot/0.1 (+public pages only)",
        accept: "text/html,text/plain",
      },
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      current = new URL(res.headers.get("location")!, url).toString();
      continue;
    }
    const reader = res.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    const cap = opts.maxBytes ?? 1_000_000;
    while (reader) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > cap) {
        await reader.cancel();
        break;
      }
      chunks.push(value);
    }
    return {
      url: url.toString(),
      status: res.status,
      text: Buffer.concat(chunks).toString("utf8"),
    };
  }
  throw new UnsafeUrlError("too many redirects");
}
