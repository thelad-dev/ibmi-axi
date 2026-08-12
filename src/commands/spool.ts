import type { AxiRenderable } from "../types.js";
import type { AppContext } from "../context.js";
import {
  parseLimit,
  rejectUnknownFlags,
  takeBoolFlag,
  takeFlag,
} from "../args.js";
import { DEFAULT_SPOOL_LIMIT, MAX_LIMIT } from "../config.js";
import { assertSafeName, sqlString } from "../parse.js";
import { parseDb2Table, runDb2 } from "../ssh.js";

export async function spoolCommand(args: string[], ctx: AppContext | undefined): Promise<AxiRenderable> {
  if (!ctx) throw new Error("missing context");
  const local = [...args];
  takeBoolFlag(local, "--help");
  const userRaw = takeFlag(local, "--user");
  const limit = parseLimit(takeFlag(local, "--limit"), DEFAULT_SPOOL_LIMIT, MAX_LIMIT);
  rejectUnknownFlags(local, "spool", ["--user", "--limit", "--host"]);

  const user = userRaw ? assertSafeName(userRaw, "user") : undefined;

  const where = user ? `WHERE USER_NAME = ${sqlString(user)} ` : "";
  const sql =
    `SELECT JOB_NAME, SPOOLED_FILE_NAME, FILE_NUMBER, USER_NAME, STATUS, TOTAL_PAGES, CREATE_TIMESTAMP ` +
    `FROM QSYS2.OUTPUT_QUEUE_ENTRIES_BASIC ${where}` +
    `ORDER BY CREATE_TIMESTAMP DESC ` +
    `FETCH FIRST ${limit} ROWS ONLY`;

  const stdout = await runDb2(ctx.config, sql);
  const table = parseDb2Table(stdout);

  if (table.rows.length === 0) {
    return {
      user: user ?? "*",
      spooled_files: 0,
      message: user
        ? `0 spooled files found for user ${user}`
        : "0 spooled files found",
      help: ["Run `ibmi-axi spool --user QSECOFR --limit 20` to filter by user"],
    };
  }

  const files = table.rows.map((row) => ({
    job: row.JOB_NAME ?? "",
    file: row.SPOOLED_FILE_NAME ?? "",
    number: numberOrEmpty(row.FILE_NUMBER),
    user: row.USER_NAME ?? "",
    status: row.STATUS ?? "",
    pages: numberOrEmpty(row.TOTAL_PAGES),
    created: row.CREATE_TIMESTAMP ?? "",
  }));

  return {
    user: user ?? "*",
    count: files.length,
    limit,
    spooled_files: files,
    help: [
      "Run `ibmi-axi joblog --job <NUMBER/USER/NAME>` for a related job log",
    ],
  };
}

function numberOrEmpty(value: string | undefined): number | string {
  if (value === undefined || value === "") return "";
  const n = Number(value);
  return Number.isFinite(n) ? n : value;
}
