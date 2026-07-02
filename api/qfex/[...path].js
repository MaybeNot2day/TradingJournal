// QFEX proxy. api.qfex.com sits behind Cloudflare, which 403s (error 1010)
// requests that lack browser-like headers — including Vercel's static
// rewrites. This function forwards auth headers and a browser UA.

const FORWARD_HEADERS = [
  "x-qfex-public-key",
  "x-qfex-hmac-signature",
  "x-qfex-nonce",
  "x-qfex-timestamp",
  "x-qfex-requested-account-id",
];

export default async function handler(req, res) {
  const segments = req.query.path || [];
  const path = Array.isArray(segments) ? segments.join("/") : segments;
  const qs = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
  // Strip Vercel's injected `path` param from the query string
  const params = new URLSearchParams(qs.slice(1));
  params.delete("path");
  const search = params.toString();

  const headers = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
    "Accept": "application/json",
  };
  for (const h of FORWARD_HEADERS) {
    if (req.headers[h]) headers[h] = req.headers[h];
  }

  try {
    const upstream = await fetch(`https://api.qfex.com/${path}${search ? `?${search}` : ""}`, {
      method: req.method,
      headers,
    });
    const body = await upstream.text();
    res.status(upstream.status)
      .setHeader("content-type", upstream.headers.get("content-type") || "text/plain")
      .send(body);
  } catch (err) {
    res.status(502).json({ detail: `QFEX proxy error: ${err.message}` });
  }
}
