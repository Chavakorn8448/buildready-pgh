// Small fetch helper: retries twice (3 attempts total) with backoff, then throws.
export async function fetchJson<T = any>(url: string, opts: { retries?: number; timeoutMs?: number } = {}): Promise<T> {
  const retries = opts.retries ?? 2;
  const timeoutMs = opts.timeoutMs ?? 120_000;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(timeoutMs),
        headers: { 'User-Agent': 'buildready-pgh-hackathon/0.1 (data fetch)' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      const j = (await res.json()) as any;
      if (j && j.error) throw new Error(`API error: ${JSON.stringify(j.error)}`);
      return j as T;
    } catch (e) {
      lastErr = e;
      if (attempt < retries) await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }
  }
  throw new Error(`Failed after ${retries + 1} attempts: ${url.slice(0, 200)} :: ${(lastErr as Error)?.message}`);
}
