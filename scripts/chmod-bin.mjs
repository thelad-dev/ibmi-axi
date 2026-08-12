import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bin = path.join(root, "dist/bin/ibmi-axi.js");
if (fs.existsSync(bin)) {
  const body = fs.readFileSync(bin, "utf8");
  if (!body.startsWith("#!")) {
    fs.writeFileSync(bin, `#!/usr/bin/env node\n${body}`);
  }
  fs.chmodSync(bin, 0o755);
}
