// Minimal stand-in for Supabase's API gateway (Kong) so supabase-js works against the local stack:
//   /auth/v1/*  -> GoTrue      /rest/v1/* -> PostgREST      /storage/v1/* -> Storage API (if running)
// Development only. Listens on 127.0.0.1.
import http from "node:http";

const PORT = Number(process.env.GATEWAY_PORT || 54321);
const ROUTES = [
  ["/auth/v1", 54329],
  ["/rest/v1", 54330],
  ["/storage/v1", 54331],
];
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type, prefer, range, accept-profile, content-profile, x-upsert, x-supabase-api-version",
  "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD",
  "access-control-expose-headers": "content-range, x-total-count",
};

http
  .createServer((req, res) => {
    if (req.method === "OPTIONS") {
      res.writeHead(204, CORS);
      return res.end();
    }
    const route = ROUTES.find(([prefix]) => req.url === prefix || req.url.startsWith(prefix + "/") || req.url.startsWith(prefix + "?"));
    if (!route) {
      res.writeHead(404, { "content-type": "application/json", ...CORS });
      return res.end(JSON.stringify({ message: "no route" }));
    }
    const [prefix, port] = route;
    const upstream = http.request(
      { host: "127.0.0.1", port, method: req.method, path: req.url.slice(prefix.length) || "/", headers: { ...req.headers, host: `127.0.0.1:${port}` } },
      (up) => {
        res.writeHead(up.statusCode || 502, { ...up.headers, ...CORS });
        up.pipe(res);
      },
    );
    upstream.on("error", (e) => {
      res.writeHead(502, { "content-type": "application/json", ...CORS });
      res.end(JSON.stringify({ message: "upstream unavailable", detail: String(e.code || e) }));
    });
    req.pipe(upstream);
  })
  .listen(PORT, "127.0.0.1", () => console.log(`[gateway] http://127.0.0.1:${PORT}`));
