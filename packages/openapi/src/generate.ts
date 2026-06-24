import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildDocument } from "./document";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");

const doc = JSON.stringify(buildDocument(), null, 2);

const targets = [
  resolve(here, "../dist/openapi.json"),
  resolve(repoRoot, "apps/web/public/openapi.json"),
];

for (const target of targets) {
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, doc, "utf8");
  // eslint-disable-next-line no-console
  console.log(`wrote ${target}`);
}
