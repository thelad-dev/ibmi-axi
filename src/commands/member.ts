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
import { DEFAULT_MEMBER_PREVIEW, MAX_LIMIT } from "../config.js";
import { parseMemberTarget, shSingleQuote } from "../parse.js";
import { redact, truncate } from "../redact.js";
import { runSystem, sshExec } from "../ssh.js";

export async function memberCommand(args: string[], ctx: AppContext | undefined): Promise<AxiRenderable> {
  if (!ctx) throw new Error("missing context");
  const local = [...args];
  takeBoolFlag(local, "--help");

  const sub = local[0];
  if (!sub || sub.startsWith("-")) {
    throw new AxiError("member requires a subcommand", "VALIDATION_ERROR", [
      "Run `ibmi-axi member read LIB/FILE MBR`",
    ]);
  }
  if (sub !== "read") {
    throw new AxiError(`unknown member subcommand ${sub}`, "VALIDATION_ERROR", [
      "valid subcommands: read",
      "Writes are out of MVP scope; never use silent member replace",
    ]);
  }
  local.shift();

  const full = takeBoolFlag(local, "--full");
  const limit = parseLimit(
    takeFlag(local, "--limit"),
    DEFAULT_MEMBER_PREVIEW,
    200_000,
    "--limit",
  );
  rejectUnknownFlags(local, "member read", ["--full", "--limit", "--host"]);
  const positionals = getPositional(local);
  if (positionals.length !== 2) {
    throw new AxiError(
      "member read requires LIB/FILE and member name",
      "VALIDATION_ERROR",
      ["Run `ibmi-axi member read DENSION/QS36SRC AERA01`"],
    );
  }

  const target = parseMemberTarget(positionals[0]!, positionals[1]);
  const qsysPath = `/QSYS.LIB/${target.library}.LIB/${target.file}.FILE/${target.member}.MBR`;
  const tmp = `/tmp/ibmi-axi-mbr-${process.pid}-${Date.now()}.txt`;

  const copy = await runSystem(
    ctx.config,
    `CPYTOSTMF FROMMBR('${qsysPath}') TOSTMF('${tmp}') STMFOPT(*REPLACE) ENDLINFMT(*LF) STMFCCSID(*PCASCII)`,
    { allowNonZero: true },
  );
  const copyOut = `${copy.stdout}\n${copy.stderr}`;
  if (copy.code !== 0 && !/CPCA082/.test(copyOut)) {
    // cleanup best-effort
    await sshExec(ctx.config, `rm -f ${shSingleQuote(tmp)}`, { allowNonZero: true });
    const detail = copyOut
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(0, 3)
      .join(" | ")
      .slice(0, 300);
    throw new AxiError(
      `failed to read member ${target.library}/${target.file}(${target.member})`,
      "REMOTE_ERROR",
      [detail || "Check library/file/member names and authority"],
    );
  }

  try {
    const cat = await sshExec(ctx.config, `cat ${shSingleQuote(tmp)}`, {
      allowNonZero: true,
      timeoutMs: 60_000,
    });
    if (cat.code !== 0) {
      throw new AxiError("failed to cat exported member stream", "REMOTE_ERROR", [
        (cat.stderr || cat.stdout || "").trim().slice(0, 200),
      ]);
    }
    const body = redact(cat.stdout.replace(/\r\n/g, "\n"));
    const total = body.length;
    const shown = full ? body : truncate(body, Math.min(limit, MAX_LIMIT * 20)).text;
    const truncated = !full && total > Math.min(limit, MAX_LIMIT * 20);

    const out: Record<string, unknown> = {
      member: {
        library: target.library,
        file: target.file,
        name: target.member,
        path: qsysPath,
        bytes: total,
        truncated,
      },
      content: shown,
    };
    if (truncated) {
      out.help = [
        `Run \`ibmi-axi member read ${target.library}/${target.file} ${target.member} --full\` for complete content`,
      ];
    }
    return out;
  } finally {
    await sshExec(ctx.config, `rm -f ${shSingleQuote(tmp)}`, { allowNonZero: true });
  }
}
