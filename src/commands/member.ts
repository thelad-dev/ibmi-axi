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
import { DEFAULT_MEMBER_PREVIEW, MAX_MEMBER_BYTES, MAX_MEMBER_PREVIEW } from "../config.js";
import type { IbmiConfig } from "../config.js";
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
  const allowLarge = takeBoolFlag(local, "--allow-large");
  const limit = parseLimit(
    takeFlag(local, "--limit"),
    DEFAULT_MEMBER_PREVIEW,
    MAX_MEMBER_PREVIEW,
    "--limit",
  );
  rejectUnknownFlags(local, "member read", ["--full", "--limit", "--host", "--allow-large"]);
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
  const label = `${target.library}/${target.file}(${target.member})`;

  // Pre-flight size guard: refuse oversized members before CPYTOSTMF unless overridden.
  const probed = await probeRemoteBytes(ctx.config, qsysPath);
  assertMemberSizeAllowed({
    bytes: probed,
    allowLarge,
    label,
    phase: "source",
  });

  const copy = await runSystem(
    ctx.config,
    `CPYTOSTMF FROMMBR('${qsysPath}') TOSTMF('${tmp}') STMFOPT(*REPLACE) ENDLINFMT(*LF) STMFCCSID(*PCASCII)`,
    { allowNonZero: true },
  );
  const copyOut = `${copy.stdout}\n${copy.stderr}`;
  if (copy.code !== 0 && !/CPCA082/.test(copyOut)) {
    await sshExec(ctx.config, `rm -f ${shSingleQuote(tmp)}`, { allowNonZero: true });
    const detail = copyOut
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(0, 3)
      .join(" | ")
      .slice(0, 300);
    throw new AxiError(
      `failed to read member ${label}`,
      "REMOTE_ERROR",
      [detail || "Check library/file/member names and authority"],
    );
  }

  try {
    // Second guard on the exported stream before cat'ing into the agent process.
    const exported = await probeRemoteBytes(ctx.config, tmp);
    assertMemberSizeAllowed({
      bytes: exported,
      allowLarge,
      label,
      phase: "export",
    });

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

    // Final local guard (cat already happened; still refuse to return unbounded payload).
    if (total > MAX_MEMBER_BYTES && !allowLarge) {
      throw memberTooLargeError({ bytes: total, label, phase: "content" });
    }

    const shown = full ? body : truncate(body, limit).text;
    const truncated = !full && total > limit;

    const out: Record<string, unknown> = {
      member: {
        library: target.library,
        file: target.file,
        name: target.member,
        path: qsysPath,
        bytes: total,
        max_bytes: MAX_MEMBER_BYTES,
        allow_large: allowLarge,
        truncated,
      },
      content: shown,
    };
    if (truncated) {
      out.help = [
        `Run \`ibmi-axi member read ${target.library}/${target.file} ${target.member} --full\` for complete content`,
      ];
    }
    if (allowLarge && total > MAX_MEMBER_BYTES) {
      out.help = [
        ...((out.help as string[] | undefined) ?? []),
        `Member exceeded default max ${MAX_MEMBER_BYTES} bytes; returned because --allow-large was set (risk: large SSH/temp/agent payload)`,
      ];
    }
    return out;
  } finally {
    await sshExec(ctx.config, `rm -f ${shSingleQuote(tmp)}`, { allowNonZero: true });
  }
}

export function parseLsSizeBytes(stdout: string): number | undefined {
  const line = stdout
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l.length > 0 && !/^total\b/i.test(l));
  if (!line) return undefined;
  // Classic `ls -l` / `ls -ln`: mode links owner group size month ...
  const parts = line.split(/\s+/);
  if (parts.length < 5) return undefined;
  const size = Number(parts[4]);
  if (!Number.isFinite(size) || size < 0 || !Number.isInteger(size)) return undefined;
  return size;
}

export function parseWcBytes(stdout: string): number | undefined {
  const m = stdout.trim().match(/^(\d+)\b/);
  if (!m) return undefined;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return n;
}

/** Remote size via ls -ln, then wc -c fallback. */
export async function probeRemoteBytes(
  config: IbmiConfig,
  remotePath: string,
): Promise<number | undefined> {
  const quoted = shSingleQuote(remotePath);
  const ls = await sshExec(config, `ls -ln ${quoted} 2>/dev/null || ls -l ${quoted} 2>/dev/null`, {
    allowNonZero: true,
  });
  const fromLs = parseLsSizeBytes(ls.stdout);
  if (fromLs !== undefined) return fromLs;

  const wc = await sshExec(config, `wc -c < ${quoted} 2>/dev/null`, { allowNonZero: true });
  if (wc.code === 0) return parseWcBytes(wc.stdout);
  return undefined;
}

function assertMemberSizeAllowed(input: {
  bytes: number | undefined;
  allowLarge: boolean;
  label: string;
  phase: "source" | "export" | "content";
}): void {
  if (input.allowLarge) return;
  if (input.bytes === undefined) {
    // Unknown size: block before we risk an unbounded CPYTOSTMF/cat without an explicit override.
    if (input.phase === "source" || input.phase === "export") {
      throw new AxiError(
        `member ${input.label} size could not be determined before transfer`,
        "MEMBER_SIZE_UNKNOWN",
        [
          `Default max is ${MAX_MEMBER_BYTES} bytes; refusing unbounded export`,
          `Re-run with --allow-large to override (risk: large SSH/temp/agent payload)`,
          `Example: ibmi-axi member read LIB/FILE MBR --full --allow-large`,
        ],
      );
    }
    return;
  }
  if (input.bytes > MAX_MEMBER_BYTES) {
    throw memberTooLargeError({ bytes: input.bytes, label: input.label, phase: input.phase });
  }
}

function memberTooLargeError(input: {
  bytes: number;
  label: string;
  phase: string;
}): AxiError {
  return new AxiError(
    `member ${input.label} is ${input.bytes} bytes (max ${MAX_MEMBER_BYTES} without --allow-large)`,
    "MEMBER_TOO_LARGE",
    [
      `Size guard phase: ${input.phase}`,
      `Re-run with --allow-large to override (risk: large SSH/temp/agent payload)`,
      `Example: ibmi-axi member read LIB/FILE MBR --full --allow-large`,
    ],
  );
}
