import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { skillMarkdown } from "../src/skill-content.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "skills/ibmi-axi/SKILL.md");
const content = skillMarkdown();
const check = process.argv.includes("--check");

if (check) {
  if (!fs.existsSync(out)) {
    console.error(`missing ${out}`);
    process.exit(1);
  }
  const existing = fs.readFileSync(out, "utf8");
  if (existing !== content) {
    console.error(`stale skill: ${out}`);
    process.exit(1);
  }
  console.log("skill ok");
  process.exit(0);
}

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, content);
console.log(`wrote ${out}`);
