export type DuplicateCandidate = {
  id?: string;
  name: string;
  vendor: string;
  productId?: string | null;
};

export type DuplicateMatch = { id: string; name: string; vendor: string; reason: string };

const STOP_WORDS = new Set(["inc", "ltd", "llc", "corp", "co", "the", "subscription", "license", "licenses", "plan"]);

function tokens(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .split(" ")
      .filter((t) => t && !STOP_WORDS.has(t)),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const t of a) if (b.has(t)) shared++;
  return shared / (a.size + b.size - shared);
}

/**
 * Flags existing subscriptions that look like the candidate: same vendor (by name tokens) with
 * a similar name. Advisory only; the database separately blocks exact duplicates.
 */
export function findPotentialDuplicates(
  candidate: DuplicateCandidate,
  existing: (DuplicateCandidate & { id: string })[],
): DuplicateMatch[] {
  const cVendor = tokens(candidate.vendor);
  const cName = tokens(candidate.name);
  const matches: DuplicateMatch[] = [];

  for (const e of existing) {
    if (e.id === candidate.id) continue;
    const vendorSim = jaccard(cVendor, tokens(e.vendor));
    const nameSim = jaccard(cName, tokens(e.name));
    if (vendorSim >= 0.5 && nameSim >= 0.5) {
      matches.push({ id: e.id, name: e.name, vendor: e.vendor, reason: "Same vendor and a very similar name" });
    } else if (nameSim === 1 && cName.size > 0) {
      matches.push({ id: e.id, name: e.name, vendor: e.vendor, reason: "Identical name under a different vendor" });
    }
  }
  return matches;
}
