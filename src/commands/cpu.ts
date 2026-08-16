import { AxiError } from "axi-sdk-js";
import type { AxiRenderable } from "../types.js";
import type { AppContext } from "../context.js";
import {
  rejectUnknownFlags,
  takeBoolFlag,
  takeFlag,
} from "../args.js";
import { DEFAULT_CPU_JOBS, MAX_LIMIT } from "../config.js";
import { parseDb2Table, runDb2 } from "../ssh.js";

export async function cpuCommand(args: string[], ctx: AppContext | undefined): Promise<AxiRenderable> {
  if (!ctx) throw new Error("missing context");
  const local = [...args];
  takeBoolFlag(local, "--help");
  const jobsLimit = parseJobsFlag(takeFlag(local, "--jobs"), DEFAULT_CPU_JOBS);
  rejectUnknownFlags(local, "cpu", ["--jobs", "--host"]);

  const activitySql =
    `SELECT AVERAGE_CPU_RATE, AVERAGE_CPU_UTILIZATION, MINIMUM_CPU_UTILIZATION, MAXIMUM_CPU_UTILIZATION ` +
    `FROM TABLE(QSYS2.SYSTEM_ACTIVITY_INFO()) X`;
  const statusSql =
    `SELECT ELAPSED_CPU_USED, CURRENT_CPU_CAPACITY, ACTIVE_JOBS_IN_SYSTEM, TOTAL_JOBS_IN_SYSTEM ` +
    `FROM QSYS2.SYSTEM_STATUS_INFO`;

  const [activityOut, statusOut] = await Promise.all([
    runDb2(ctx.config, activitySql),
    runDb2(ctx.config, statusSql),
  ]);
  const activity = parseDb2Table(activityOut).rows[0] ?? {};
  const status = parseDb2Table(statusOut).rows[0] ?? {};

  const out: Record<string, unknown> = {
    units: {
      average_pct: "percent",
      min_pct: "percent",
      max_pct: "percent",
      rate_pct: "percent of nominal frequency",
      elapsed_pct: "percent over elapsed statistics window",
      capacity: "processing units",
      job_cpu_ms: "milliseconds CPU time since job start",
    },
    average_pct: numberOrEmpty(activity.AVERAGE_CPU_UTILIZATION),
    min_pct: numberOrEmpty(activity.MINIMUM_CPU_UTILIZATION),
    max_pct: numberOrEmpty(activity.MAXIMUM_CPU_UTILIZATION),
    rate_pct: numberOrEmpty(activity.AVERAGE_CPU_RATE),
    elapsed_pct: numberOrEmpty(status.ELAPSED_CPU_USED),
    capacity: numberOrEmpty(status.CURRENT_CPU_CAPACITY),
    active_jobs: numberOrEmpty(status.ACTIVE_JOBS_IN_SYSTEM),
    total_jobs: numberOrEmpty(status.TOTAL_JOBS_IN_SYSTEM),
    source: "SYSTEM_ACTIVITY_INFO + SYSTEM_STATUS_INFO",
  };

  if (jobsLimit > 0) {
    const jobsSql =
      `SELECT JOB_NAME, AUTHORIZATION_NAME, JOB_STATUS, CPU_TIME ` +
      `FROM TABLE(QSYS2.ACTIVE_JOB_INFO(DETAILED_INFO => 'ALL')) X ` +
      `WHERE CPU_TIME IS NOT NULL ` +
      `ORDER BY CPU_TIME DESC ` +
      `FETCH FIRST ${jobsLimit} ROWS ONLY`;
    const jobsOut = await runDb2(ctx.config, jobsSql);
    const jobsTable = parseDb2Table(jobsOut);
    out.jobs_limit = jobsLimit;
    out.top_jobs = jobsTable.rows.map((row) => ({
      job: row.JOB_NAME ?? "",
      user: row.AUTHORIZATION_NAME ?? "",
      status: row.JOB_STATUS ?? "",
      cpu_ms: numberOrEmpty(row.CPU_TIME),
    }));
  }

  const help: string[] = [
    "Run `ibmi-axi asp` for ASP capacity / used percent",
    "Run `ibmi-axi msgw` for QSYSOPR inquiry messages waiting for reply",
  ];
  if (jobsLimit === 0) {
    help.unshift("Run `ibmi-axi cpu --jobs 5` for top jobs by cumulative CPU_TIME (ms)");
  }
  out.help = help;
  return out;
}

/** `--jobs 0` disables the slower ACTIVE_JOB_INFO pass; omit flag → default. */
function parseJobsFlag(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  if (!/^\d+$/.test(value)) {
    throw new AxiError("--jobs must be a non-negative integer", "VALIDATION_ERROR", [
      `Run with --jobs <n> where 0 <= n <= ${MAX_LIMIT}`,
    ]);
  }
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n < 0) {
    throw new AxiError("--jobs must be a non-negative integer", "VALIDATION_ERROR");
  }
  return Math.min(n, MAX_LIMIT);
}

function numberOrEmpty(value: string | undefined): number | string {
  if (value === undefined || value === "") return "";
  const n = Number(value.replace(/,/g, ""));
  return Number.isFinite(n) ? n : value;
}
