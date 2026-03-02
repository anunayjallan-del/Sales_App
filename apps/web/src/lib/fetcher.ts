export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    }
  });

  if (!response.ok) {
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    let message = `Request failed: ${response.status}`;

    if (contentType.includes("application/json")) {
      const payload = await response.json().catch(() => ({} as Record<string, unknown>));
      const errorText =
        (typeof payload.error === "string" && payload.error) ||
        (typeof payload.message === "string" && payload.message) ||
        (typeof payload.hint === "string" && payload.hint) ||
        "";
      if (errorText) message = errorText;
    } else {
      const text = await response.text().catch(() => "");
      const normalized = text.toLowerCase();
      if (normalized.includes("ssl handshake failed") || normalized.includes("error code 525")) {
        message = "Supabase is temporarily unreachable (SSL handshake failed). Please retry in a minute.";
      } else if (normalized.includes("cloudflare") && normalized.includes("5xx")) {
        message = "Supabase is temporarily unavailable via Cloudflare. Please retry shortly.";
      }
    }

    throw new Error(message);
  }

  return response.json() as Promise<T>;
}
