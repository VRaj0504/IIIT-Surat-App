// Looks up a real publication count for a name, so a faculty member
// doesn't have to know their own count off the top of their head when
// filling in Edit Profile. NOT Google Scholar — Scholar has no public
// API; every "Scholar API" out there is an unofficial scraper that
// breaks the moment Google changes a page or rate-limits the caller,
// which a Cloud Function's fixed IP gets hit with fast. These two are
// real, free, official, public APIs instead:
//
//   - Semantic Scholar's Graph API (primary): returns an actual
//     `paperCount` field per author — this is the number source.
//   - DBLP's author search (secondary): a computer-science-specific
//     bibliography, good corroboration for a CS/ECE faculty search,
//     and gives a profile link — but this file does NOT parse a count
//     out of DBLP's own profile pages, since that schema (unlike
//     Semantic Scholar's, which is unambiguous and well-documented)
//     isn't one I could verify here with confidence; getting a wrong
//     number from a guessed schema is worse than not showing one.
//
// Always returns MULTIPLE candidates for a human to pick from, never
// auto-picks "the first result" — common names collide across these
// databases, and silently attributing someone else's papers would be
// a real, embarrassing mistake to ship.
//
// NOT LIVE-TESTED against the real endpoints — I have no network
// access in the environment that wrote this. Verify by actually
// running a lookup before trusting it; if a response shape has
// drifted from what's coded here, this fails safe (shows "couldn't
// reach the lookup service") rather than showing a wrong number.

export type PublicationCandidate = {
  source: "semanticScholar" | "dblp";
  name: string;
  affiliation?: string;
  paperCount?: number; // present for Semantic Scholar hits; absent for DBLP-only ones
  profileUrl?: string;
};

const FETCH_TIMEOUT_MS = 8000;

async function fetchJson(url: string): Promise<any> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(url, { signal: controller.signal, headers: { Accept: "application/json" } });
  } catch (err: any) {
    clearTimeout(timeout);
    if (err?.name === "AbortError") throw new Error(`timed out after ${FETCH_TIMEOUT_MS / 1000}s`);
    throw new Error(err?.message ?? "network error");
  }
  clearTimeout(timeout);

  // Read as text first, not response.json() directly — whether it's an
  // HTTP error (a 429's body sometimes explains itself, e.g. a retry
  // time) or a 200 that isn't actually JSON (DBLP once sent back an
  // HTML block page here), a parse error alone gives zero evidence of
  // what the server actually said. Reading as text first means a
  // broken response can always show its own content in the error.
  const raw = await response.text();
  const snippet = () => raw.trim().slice(0, 140).replace(/\s+/g, " ") + (raw.length > 140 ? "…" : "");

  if (!response.ok) {
    const err: any = new Error(raw.trim() ? `HTTP ${response.status}: "${snippet()}"` : `HTTP ${response.status}`);
    err.status = response.status;
    throw err;
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`got non-JSON response: "${snippet()}"`);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function searchSemanticScholar(name: string): Promise<PublicationCandidate[]> {
  const url = `https://api.semanticscholar.org/graph/v1/author/search?query=${encodeURIComponent(
    name,
  )}&fields=name,affiliations,paperCount,url&limit=8`;
  // One retry on a 429 specifically — their anonymous-tier rate limit
  // is shared and easy to hit; a short wait often clears it. Anything
  // else (a real network error, a non-JSON body) isn't worth retrying
  // and fails straight through.
  let data: any;
  try {
    data = await fetchJson(url);
  } catch (err: any) {
    if (err?.status === 429) {
      await delay(1500);
      data = await fetchJson(url);
    } else {
      throw err;
    }
  }
  const hits: any[] = Array.isArray(data?.data) ? data.data : [];
  return hits.map((hit) => ({
    source: "semanticScholar" as const,
    name: hit.name ?? name,
    affiliation: Array.isArray(hit.affiliations) && hit.affiliations.length ? hit.affiliations.join(", ") : undefined,
    paperCount: typeof hit.paperCount === "number" ? hit.paperCount : undefined,
    profileUrl: hit.url,
  }));
}

async function searchDblp(name: string): Promise<PublicationCandidate[]> {
  const url = `https://dblp.org/search/author/api?q=${encodeURIComponent(name)}&format=json`;
  const data = await fetchJson(url);
  const hits: any[] = data?.result?.hits?.hit ?? [];
  return hits.map((hit) => ({
    source: "dblp" as const,
    name: hit.info?.author ?? name,
    profileUrl: hit.info?.url,
  }));
}

// Runs both lookups and combines whatever succeeds — one endpoint
// being down or renamed shouldn't take the other out with it.
export async function searchPublications(name: string): Promise<PublicationCandidate[]> {
  const trimmed = name.trim();
  if (!trimmed) return [];

  const [scholarResult, dblpResult] = await Promise.allSettled([
    searchSemanticScholar(trimmed),
    searchDblp(trimmed),
  ]);

  const results: PublicationCandidate[] = [];
  if (scholarResult.status === "fulfilled") results.push(...scholarResult.value);
  if (dblpResult.status === "fulfilled") results.push(...dblpResult.value);

  if (scholarResult.status === "rejected" && dblpResult.status === "rejected") {
    // Surfaces the ACTUAL reason from both endpoints instead of one
    // generic message — "both failed" could mean no internet at all,
    // a campus network blocking these specific domains, or something
    // wrong in this file's own request. Those look identical from a
    // plain "couldn't reach" message but need very different fixes.
    const scholarMsg = scholarResult.reason?.message ?? String(scholarResult.reason);
    const dblpMsg = dblpResult.reason?.message ?? String(dblpResult.reason);
    throw new Error(`Semantic Scholar: ${scholarMsg} | DBLP: ${dblpMsg}`);
  }
  return results;
}
