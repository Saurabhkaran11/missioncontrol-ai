/**
 * De-duplication keys. Two records describe the same company when their
 * normalised domains match; without a domain we fall back to a normalised
 * name.
 * Examples:
 *   dedupeKey("Acme, Inc.", "https://WWW.Acme.example/pricing") -> "domain:acme.example"
 *   dedupeKey("Acme Inc", null)                                  -> "name:acme"
 */
const COMPANY_SUFFIXES =
  /\b(inc|llc|ltd|limited|gmbh|corp|corporation|co|plc|sa|bv)\b\.?/g;

export function normalizeDomain(
  input: string | null | undefined,
): string | null {
  if (!input) return null;
  let host = input.trim().toLowerCase();
  try {
    host = new URL(host.includes("://") ? host : `https://${host}`).hostname;
  } catch {
    return null;
  }
  host = host.replace(/^www\./, "").replace(/\.$/, "");
  return /^[a-z0-9.-]+\.[a-z0-9-]+$/.test(host) ? host : null;
}

export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(COMPANY_SUFFIXES, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, "-");
}

export function dedupeKey(
  name: string,
  domain: string | null | undefined,
): string {
  const d = normalizeDomain(domain);
  return d ? `domain:${d}` : `name:${normalizeName(name)}`;
}

/** Splits a batch into first occurrences and in-batch duplicates. */
export function partitionDuplicates<
  T extends { name: string; domain: string | null },
>(items: T[], existingKeys: Set<string>) {
  const seen = new Set(existingKeys);
  const unique: T[] = [];
  const duplicates: { item: T; key: string; reason: "existing" | "batch" }[] =
    [];
  for (const item of items) {
    const key = dedupeKey(item.name, item.domain);
    if (seen.has(key)) {
      duplicates.push({
        item,
        key,
        reason: existingKeys.has(key) ? "existing" : "batch",
      });
    } else {
      seen.add(key);
      unique.push(item);
    }
  }
  return { unique, duplicates };
}
