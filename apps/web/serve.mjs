// Minimal static file server for previewing the built site locally.
// Usage: pnpm --filter @app/web build && pnpm --filter @app/web preview
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const ROOT = "dist";
const PORT = Number(process.env.PORT ?? 5173);
const TYPES = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".json": "application/json",
  ".map": "application/json",
  ".css": "text/css",
};

createServer(async (req, res) => {
  let path = decodeURIComponent((req.url ?? "/").split("?")[0]);
  if (path === "/") path = "/index.html";
  const file = join(ROOT, normalize(path).replace(/^(\.\.[/\\])+/, ""));
  try {
    const data = await readFile(file);
    res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404).end("Not found");
  }
}).listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`web preview → http://localhost:${PORT}  (docs at /docs.html)`);
});
