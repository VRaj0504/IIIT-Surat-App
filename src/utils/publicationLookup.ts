

export type PublicationCandidate = {
  source: "semanticScholar" | "dblp";
  name: string;
  affiliation?: string;
  paperCount?: number;
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

    const scholarMsg = scholarResult.reason?.message ?? String(scholarResult.reason);
    const dblpMsg = dblpResult.reason?.message ?? String(dblpResult.reason);
    throw new Error(`Semantic Scholar: ${scholarMsg} | DBLP: ${dblpMsg}`);
  }
  return results;
}
