import { AxiError } from "axi-sdk-js";
import type { AxiRenderable } from "../types.js";
import type { AppContext } from "../context.js";
import {
  parseLimit,
  rejectUnknownFlags,
  takeBoolFlag,
  takeFlag,
} from "../args.js";
import { DEFAULT_MSGW_LIMIT, MAX_LIMIT } from "../config.js";
import { redact, truncate } from "../redact.js";
import { parseDb2Table, runDb2 } from "../ssh.js";

const PREVIEW = 160;
const QUEUE_LIBRARY = "QSYS";
const QUEUE_NAME = "QSYSOPR";

export async function msgwCommand(args: string[], ctx: AppContext | undefined): Promise<AxiRenderable> {
  if (!ctx) throw new Error("missing context");
  const local = [...args];
  takeBoolFlag(local, "--help");
  const full = takeBoolFlag(local, "--full");
  const filter = parseFilter(takeFlag(local, "--filter"));
  const limit = parseLimit(takeFlag(local, "--limit"), DEFAULT_MSGW_LIMIT, MAX_LIMIT);
  rejectUnknownFlags(local, "msgw", ["--filter", "--limit", "--full", "--host"]);

  const messageFilter = filter === "all" ? "ALL" : "INQUIRY";
  const sql =
    `SELECT MESSAGE_ID, MESSAGE_TYPE, SEVERITY, VARCHAR(MESSAGE_TEXT, 500) AS MESSAGE_TEXT, ` +
    `MESSAGE_TIMESTAMP, HEX(MESSAGE_KEY) AS MESSAGE_KEY, FROM_JOB, FROM_USER ` +
    `FROM TABLE(QSYS2.MESSAGE_QUEUE_INFO(` +
    `QUEUE_LIBRARY => '${QUEUE_LIBRARY}', ` +
    `QUEUE_NAME => '${QUEUE_NAME}', ` +
    `MESSAGE_FILTER => '${messageFilter}')) X ` +
    `ORDER BY MESSAGE_TIMESTAMP DESC ` +
    `FETCH FIRST ${limit} ROWS ONLY`;

  const jobsSql =
    `SELECT JOB_NAME, JOB_STATUS, AUTHORIZATION_NAME, SUBSYSTEM ` +
    `FROM TABLE(QSYS2.ACTIVE_JOB_INFO()) X ` +
    `WHERE JOB_STATUS = 'MSGW' ` +
    `FETCH FIRST ${limit} ROWS ONLY`;

  const [msgOut, jobsOut] = await Promise.all([
    runDb2(ctx.config, sql),
    runDb2(ctx.config, jobsSql),
  ]);

  const msgTable = parseDb2Table(msgOut);
  const jobsTable = parseDb2Table(jobsOut);

  const messages = msgTable.rows.map((row) => {
    const textRaw = redact(row.MESSAGE_TEXT ?? "");
    const text = full
      ? textRaw
      : truncate(textRaw, PREVIEW).text.replace(/\n\.\.\. \(truncated.*$/, "…");
    return {
      key: row.MESSAGE_KEY ?? "",
      id: row.MESSAGE_ID ?? "",
      type: row.MESSAGE_TYPE ?? "",
      severity: numberOrEmpty(row.SEVERITY),
      job: row.FROM_JOB ?? "",
      user: row.FROM_USER ?? "",
      text,
      at: row.MESSAGE_TIMESTAMP ?? "",
    };
  });

  const jobs = jobsTable.rows.map((row) => ({
    job: row.JOB_NAME ?? "",
    status: row.JOB_STATUS ?? "",
    user: row.AUTHORIZATION_NAME ?? "",
    subsystem: row.SUBSYSTEM ?? "",
  }));

  if (messages.length === 0 && jobs.length === 0) {
    return {
      queue: `${QUEUE_LIBRARY}/${QUEUE_NAME}`,
      filter,
      messages: 0,
      jobs_msgw: 0,
      message:
        filter === "inquiry"
          ? "0 inquiry messages waiting for reply in QSYSOPR; 0 jobs in MSGW"
          : "0 QSYSOPR messages in filter; 0 jobs in MSGW",
      help: [
        "Default filter is inquiry (MSGW wait-for-reply). Use --filter all for recent QSYSOPR traffic",
        "This command is read-only — it does not reply to MSGW",
      ],
    };
  }

  const out: Record<string, unknown> = {
    queue: `${QUEUE_LIBRARY}/${QUEUE_NAME}`,
    filter,
    count: messages.length,
    limit,
    messages,
    jobs_msgw_count: jobs.length,
    jobs_msgw: jobs,
  };

  const help: string[] = [
    "This command is read-only — it does not reply to MSGW",
    "Run `ibmi-axi joblog --job <NUMBER/USER/NAME>` to inspect a related job log",
  ];
  if (!full && messages.length > 0) {
    help.unshift(
      `Run \`ibmi-axi msgw --filter ${filter} --limit ${limit} --full\` for untruncated message text`,
    );
  }
  if (filter === "inquiry") {
    help.push("Run `ibmi-axi msgw --filter all --limit 20` for recent non-inquiry QSYSOPR messages");
  }
  out.help = help;
  return out;
}

function parseFilter(raw: string | undefined): "inquiry" | "all" {
  if (raw === undefined || raw.trim() === "") return "inquiry";
  const v = raw.trim().toLowerCase();
  if (v === "inquiry" || v === "msgw") return "inquiry";
  if (v === "all") return "all";
  throw new AxiError(`invalid --filter ${raw}`, "VALIDATION_ERROR", [
    "valid --filter values: inquiry (default), all",
  ]);
}

function numberOrEmpty(value: string | undefined): number | string {
  if (value === undefined || value === "") return "";
  const n = Number(value.replace(/,/g, ""));
  return Number.isFinite(n) ? n : value;
}
