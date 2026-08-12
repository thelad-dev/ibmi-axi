import type { AxiRenderable } from "../types.js";
import { AxiError } from "axi-sdk-js";
import type { AppContext } from "../context.js";
import {
  getPositional,
  parseLimit,
  rejectUnknownFlags,
  takeBoolFlag,
  takeFlag,
} from "../args.js";
import { DEFAULT_IFS_LIMIT, MAX_LIMIT } from "../config.js";
import { assertSafePath, shSingleQuote } from "../parse.js";
import { sshExec } from "../ssh.js";

export async function ifsCommand(args: string[], ctx: AppContext | undefined): Promise<AxiRenderable> {
  if (!ctx) throw new Error("missing context");
  const local = [...args];
  takeBoolFlag(local, "--help");

  const sub = local[0];
  if (!sub || sub.startsWith("-")) {
    throw new AxiError("ifs requires a subcommand", "VALIDATION_ERROR", [
      "Run `ibmi-axi ifs ls /home/LADWEIN`",
    ]);
  }
  if (sub !== "ls") {
    throw new AxiError(`unknown ifs subcommand ${sub}`, "VALIDATION_ERROR", [
      "valid subcommands: ls",
    ]);
  }
  local.shift();

  const limit = parseLimit(takeFlag(local, "--limit"), DEFAULT_IFS_LIMIT, MAX_LIMIT);
  rejectUnknownFlags(local, "ifs ls", ["--limit", "--host"]);
  const positionals = getPositional(local);
  if (positionals.length !== 1) {
    throw new AxiError("ifs ls requires exactly one absolute path", "VALIDATION_ERROR", [
      "Run `ibmi-axi ifs ls /home/LADWEIN`",
    ]);
  }
  const path = assertSafePath(positionals[0]!);

  // Bounded non-recursive listing. Use ls -la; parse locally.
  // head -n limit+1 accounts for "total" line when present.
  const remote =
    `ls -la ${shSingleQuote(path)} 2>&1 | head -n ${limit + 5}`;
  const result = await sshExec(ctx.config, remote, { allowNonZero: true });
  if (result.code !== 0 && !result.stdout.trim()) {
    throw new AxiError(`failed to list ${path}`, "REMOTE_ERROR", [
      (result.stderr || result.stdout || "").trim().slice(0, 200) || "path not found or not authorized",
    ]);
  }

  const lines = result.stdout.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.some((l) => /not found|No such file|nicht gefunden/i.test(l)) && lines.length <= 2) {
    return {
      path,
      entries: 0,
      message: `path not found: ${path}`,
      help: ["Check the absolute IFS path", "Run `ibmi-axi ifs ls /home`"],
    };
  }

  const entries: {
    name: string;
    type: string;
    size: number | string;
    modified: string;
    mode: string;
  }[] = [];

  for (const line of lines) {
    if (/^total\s+/i.test(line)) continue;
    const parsed = parseLsLine(line);
    if (!parsed) continue;
    if (parsed.name === "." || parsed.name === "..") continue;
    entries.push(parsed);
    if (entries.length >= limit) break;
  }

  const truncated = entries.length >= limit;

  const out: Record<string, unknown> = {
    path,
    count: entries.length,
    limit,
    truncated,
    entries,
  };
  if (truncated) {
    out.help = [
      `Listing capped at ${limit}. Raise with \`ibmi-axi ifs ls ${path} --limit <n>\` (max ${MAX_LIMIT})`,
    ];
  } else if (entries.length === 0) {
    out.message = `0 entries in ${path}`;
  }
  return out;
}

function parseLsLine(line: string): {
  name: string;
  type: string;
  size: number | string;
  modified: string;
  mode: string;
} | null {
  // Classic `ls -la`: mode links owner group size mon day time/year name
  const m = line.match(
    /^([bcdlps-][rwxSsTt-]{9}[+@.]?)\s+\d+\s+\S+\s+\S+\s+(\d+)\s+(\S+\s+\d+\s+[\d:]+|\S+\s+\d+\s+\d+)\s+(.*)$/,
  );
  if (!m) return null;
  const mode = m[1]!;
  const sizeRaw = m[2]!;
  const modified = m[3]!;
  const name = m[4]!;
  const type =
    mode[0] === "d" ? "dir" : mode[0] === "l" ? "link" : mode[0] === "-" ? "file" : mode[0] ?? "other";
  const sizeNum = Number(sizeRaw);
  return {
    name,
    type,
    size: Number.isFinite(sizeNum) ? sizeNum : sizeRaw,
    modified,
    mode,
  };
}
