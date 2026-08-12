import fs from "node:fs";
import path from "node:path";
import type { AxiRenderable } from "../types.js";
import { AxiError } from "axi-sdk-js";
import type { AppContext } from "../context.js";
import {
  rejectUnknownFlags,
  takeBoolFlag,
  takeFlag,
} from "../args.js";
import { skillMarkdown } from "../skill-content.js";

export async function skillCommand(args: string[], ctx: AppContext | undefined): Promise<AxiRenderable> {
  if (!ctx) throw new Error("missing context");
  const local = [...args];
  takeBoolFlag(local, "--help");
  const sub = local[0];
  if (sub !== "generate") {
    throw new AxiError("unknown skill command", "VALIDATION_ERROR", [
      "Run `ibmi-axi skill generate [--output path] [--check]`",
    ]);
  }
  local.shift();
  const check = takeBoolFlag(local, "--check");
  const output = takeFlag(local, "--output") ?? "skills/ibmi-axi/SKILL.md";
  rejectUnknownFlags(local, "skill generate", ["--output", "--check"]);

  const content = skillMarkdown();
  const resolved = path.resolve(output);

  if (check) {
    if (!fs.existsSync(resolved)) {
      throw new AxiError(`skill file missing: ${output}`, "SKILL_STALE", [
        "Run `ibmi-axi skill generate` to create it",
      ]);
    }
    const existing = fs.readFileSync(resolved, "utf8");
    if (existing !== content) {
      throw new AxiError(`skill file is stale: ${output}`, "SKILL_STALE", [
        "Run `ibmi-axi skill generate` to refresh SKILL.md",
      ]);
    }
    return { skill: "ok", path: output, check: true };
  }

  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, content, "utf8");
  return {
    skill: "written",
    path: output,
    bytes: content.length,
  };
}
