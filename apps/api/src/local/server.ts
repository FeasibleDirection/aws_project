/**
 * Tiny local HTTP adapter: maps incoming requests into synthetic API Gateway
 * HTTP API (payload v2) events and dispatches to the real route handlers, so
 * the exact deployed code runs locally against DynamoDB Local. ~$0, no Docker
 * for the API itself (only DynamoDB Local needs Docker).
 *
 * Run:  IS_LOCAL=1 pnpm --filter @app/api dev
 */
import { createServer, type IncomingMessage } from "node:http";
import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
  Context,
} from "aws-lambda";

process.env.IS_LOCAL = "1";
process.env.TABLE_NAME ??= "Orders";

const { handler: createH } = await import("../routes/create");
const { handler: getH } = await import("../routes/get");
const { handler: listH } = await import("../routes/list");
const { handler: updateH } = await import("../routes/update");
const { handler: deleteH } = await import("../routes/delete");
const { handler: attachUploadH } = await import("../routes/attachment-upload");
const { handler: attachDownloadH } = await import("../routes/attachment-download");

type RouteHandler = typeof createH;

const PORT = Number(process.env.PORT ?? 3000);

function route(
  method: string,
  path: string,
): { handler: RouteHandler; params: Record<string, string> } | undefined {
  const clean = (path.split("?")[0] ?? "/").replace(/\/+$/, "") || "/";
  if (clean === "/orders") {
    if (method === "GET") return { handler: listH, params: {} };
    if (method === "POST") return { handler: createH, params: {} };
  }
  const att = clean.match(/^\/orders\/([^/]+)\/attachment$/);
  if (att) {
    const id = decodeURIComponent(att[1]!);
    if (method === "POST") return { handler: attachUploadH, params: { id } };
    if (method === "GET") return { handler: attachDownloadH, params: { id } };
  }
  const m = clean.match(/^\/orders\/([^/]+)$/);
  if (m) {
    const id = decodeURIComponent(m[1]!);
    if (method === "GET") return { handler: getH, params: { id } };
    if (method === "PATCH" || method === "PUT")
      return { handler: updateH, params: { id } };
    if (method === "DELETE") return { handler: deleteH, params: { id } };
  }
  return undefined;
}

const readBody = (req: IncomingMessage): Promise<string> =>
  new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => resolve(data));
  });

const server = createServer(async (req, res) => {
  const method = req.method ?? "GET";
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);

  // CORS for local browser use
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-headers", "content-type,authorization");
  res.setHeader("access-control-allow-methods", "GET,POST,PATCH,PUT,DELETE,OPTIONS");
  if (method === "OPTIONS") {
    res.writeHead(204).end();
    return;
  }

  const matched = route(method, url.pathname);
  if (!matched) {
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: { code: "NOT_FOUND", message: "Route not found" } }));
    return;
  }

  const body = await readBody(req);
  const query: Record<string, string> = {};
  url.searchParams.forEach((v, k) => (query[k] = v));

  const event = {
    version: "2.0",
    routeKey: `${method} ${url.pathname}`,
    rawPath: url.pathname,
    rawQueryString: url.search.replace(/^\?/, ""),
    headers: Object.fromEntries(
      Object.entries(req.headers).map(([k, v]) => [k, Array.isArray(v) ? v.join(",") : (v ?? "")]),
    ),
    queryStringParameters: Object.keys(query).length ? query : undefined,
    pathParameters: Object.keys(matched.params).length ? matched.params : undefined,
    body: body || undefined,
    isBase64Encoded: false,
    requestContext: {
      http: { method, path: url.pathname, sourceIp: "127.0.0.1" },
      // Locally we fake the JWT authorizer claims so the same handler code runs.
      // Pass header `x-user: <id>` to simulate different authenticated users.
      authorizer: {
        jwt: {
          claims: {
            sub: (req.headers["x-user"] as string | undefined) ?? "local-user",
          },
          scopes: [],
        },
      },
    },
  } as unknown as APIGatewayProxyEventV2;

  const result = (await matched.handler(
    event,
    {} as Context,
  )) as APIGatewayProxyStructuredResultV2;

  res.writeHead(result.statusCode ?? 200, {
    "content-type": "application/json",
    ...(result.headers as Record<string, string>),
  });
  res.end(result.body ?? "");
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`orders-api local shim → http://localhost:${PORT}/orders (IS_LOCAL=1)`);
});
