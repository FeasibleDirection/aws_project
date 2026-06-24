import { build } from "esbuild";
import { cpSync, mkdirSync, existsSync } from "node:fs";

mkdirSync("dist", { recursive: true });

await build({
  entryPoints: ["src/main.ts"],
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  outfile: "dist/main.js",
  sourcemap: true,
});

cpSync("index.html", "dist/index.html");
// public/ holds docs.html and the generated openapi.json
if (existsSync("public")) cpSync("public", "dist", { recursive: true });

// eslint-disable-next-line no-console
console.log("web built → apps/web/dist (index.html, docs.html, main.js, openapi.json)");
