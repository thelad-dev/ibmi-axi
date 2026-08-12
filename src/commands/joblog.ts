import type { AxiRenderable } from "../types.js";
import type { AppContext } from "../context.js";
import {
  parseLimit,
  rejectUnknownFlags,
  takeBoolFlag,
  takeFlag,
} from "../args.js";
import {
  DEFAULT_JOBLOG_LIMIT,
  MAX_LIMIT,
} from "../config.js";
import { assertSafeName, sqlString } from "../parse.js";
import { redact, truncate } from "../redact.js";
import { parseDb2Table, runDb2 } from "../ssh.js";

const PREVIEW = 160;

export async function joblogCommand(args: string[], ctx: AppContext | undefined): Promise<AxiRenderable> {
  if (!ctx) throw new Error("missing context");
  const local = [...args];
  takeBoolFlag(local, "--help");
  const full = takeBoolFlag(local, "--full");
  const jobRaw = takeFlag(local, "--job");
  const limit = parseLimit(takeFlag(local, "--limit"), DEFAULT_JOBLOG_LIMIT, MAX_LIMIT);
  rejectUnknownFlags(local, "joblog", ["--job", "--limit", "--full", "--host"]);

  const job = jobRaw ? assertSafeName(jobRaw, "job") : "*";

  // VARCHAR caps huge MESSAGE_TEXT columns so the db2 CLI stays usable over SSH.
  const sql =
    `SELECT MESSAGE_ID, MESSAGE_TYPE, SEVERITY, VARCHAR(MESSAGE_TEXT, 500) AS MESSAGE_TEXT, MESSAGE_TIMESTAMP ` +
    `FROM TABLE(QSYS2.JOBLOG_INFO(${sqlString(job)})) X ` +
    `FETCH FIRST ${limit} ROWS ONLY`;

  const stdout = await runDb2(ctx.config, sql);
  const table = parseDb2Table(stdout);

  if (table.rows.length === 0) {
    return {
      job,
      messages: 0,
      message: `0 job log messages found for ${job}`,
      help: [
        "Pass --job NUMBER/USER/NAME for a specific job",
        "Run `ibmi-axi spool --limit 10` for recent spooled files",
      ],
    };
  }

  const messages = table.rows.map((row) => {
    const textRaw = redact(row.MESSAGE_TEXT ?? "");
    const text = full
      ? textRaw
      : truncate(textRaw, PREVIEW).text.replace(/\n\.\.\. \(truncated.*$/, "…");
    return {
      id: row.MESSAGE_ID ?? "",
      type: row.MESSAGE_TYPE ?? "",
      severity: numberOrEmpty(row.SEVERITY),
      text,
      at: row.MESSAGE_TIMESTAMP ?? "",
    };
  });

  const out: AxiRenderable = {
    job,
    count: messages.length,
    limit,
    messages,
  };
  if (!full) {
    (out as Record<string, unknown>).help = [
      `Run \`ibmi-axi joblog --job ${job} --limit ${limit} --full\` for untruncated message text`,
    ];
  }
  return out;
}

function numberOrEmpty(value: string | undefined): number | string {
  if (value === undefined || value === "") return "";
  const n = Number(value);
  return Number.isFinite(n) ? n : value;
}
