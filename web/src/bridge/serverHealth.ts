export type ServerStatus = "waking" | "online" | "offline";

export interface HealthCheckResult {
  ok: boolean;
  status: number;
  latencyMs: number;
  error?: string;
}

function normalizeHealthUrl(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/+$/, "");
  return `${trimmed}/health`;
}

export async function checkServerHealth(
  baseUrl: string,
  timeoutMs = 5000
): Promise<HealthCheckResult> {
  const url = normalizeHealthUrl(baseUrl);
  const start = typeof performance !== "undefined" ? performance.now() : Date.now();
  const controller = typeof AbortController !== "undefined" ? new AbortController() : undefined;
  const timer =
    controller !== undefined
      ? setTimeout(() => controller.abort(), timeoutMs)
      : undefined;

  try {
    const res = await fetch(url, {
      method: "GET",
      cache: "no-store",
      signal: controller?.signal,
    });
    const end = typeof performance !== "undefined" ? performance.now() : Date.now();
    return {
      ok: res.ok,
      status: res.status,
      latencyMs: Math.round(end - start),
    };
  } catch (err) {
    const end = typeof performance !== "undefined" ? performance.now() : Date.now();
    return {
      ok: false,
      status: 0,
      latencyMs: Math.round(end - start),
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}

export async function wakeServer(
  baseUrl: string,
  onStatus?: (status: ServerStatus) => void,
  maxAttempts = 8
): Promise<HealthCheckResult> {
  onStatus?.("waking");
  let lastResult: HealthCheckResult = {
    ok: false,
    status: 0,
    latencyMs: 0,
    error: "No attempts made",
  };

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    lastResult = await checkServerHealth(baseUrl, 8000);
    if (lastResult.ok) {
      onStatus?.("online");
      return lastResult;
    }
    if (attempt < maxAttempts) {
      const delayMs = Math.min(2000 * attempt, 6000);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  onStatus?.("offline");
  return lastResult;
}
