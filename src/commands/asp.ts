import type { AxiRenderable } from "../types.js";
import type { AppContext } from "../context.js";
import { rejectUnknownFlags, takeBoolFlag } from "../args.js";
import { parseDb2Table, runDb2 } from "../ssh.js";

export async function aspCommand(args: string[], ctx: AppContext | undefined): Promise<AxiRenderable> {
  if (!ctx) throw new Error("missing context");
  const local = [...args];
  takeBoolFlag(local, "--help");
  rejectUnknownFlags(local, "asp", ["--host"]);

  const sql =
    `SELECT ASP_NUMBER, ASP_STATE, ASP_TYPE, TOTAL_CAPACITY, TOTAL_CAPACITY_AVAILABLE, ` +
    `STORAGE_THRESHOLD_PERCENTAGE, DEVICE_DESCRIPTION_NAME ` +
    `FROM QSYS2.ASP_INFO ORDER BY ASP_NUMBER`;

  const stdout = await runDb2(ctx.config, sql);
  const table = parseDb2Table(stdout);

  if (table.rows.length === 0) {
    return {
      asps: 0,
      message: "0 ASPs found",
      units: { capacity: "MB", available: "MB", used: "MB", used_pct: "percent" },
      help: ["Run `ibmi-axi doctor` if SQL probes fail"],
    };
  }

  const asps = table.rows.map((row) => {
    const capacityMb = numberOrEmpty(row.TOTAL_CAPACITY);
    const availableMb = numberOrEmpty(row.TOTAL_CAPACITY_AVAILABLE);
    const usedMb =
      typeof capacityMb === "number" && typeof availableMb === "number" && capacityMb >= 0 && availableMb >= 0
        ? Math.max(0, capacityMb - availableMb)
        : "";
    const usedPct =
      typeof capacityMb === "number" && capacityMb > 0 && typeof usedMb === "number"
        ? Math.round((usedMb / capacityMb) * 10_000) / 100
        : "";
    return {
      asp: numberOrEmpty(row.ASP_NUMBER),
      state: row.ASP_STATE ?? "",
      type: row.ASP_TYPE ?? "",
      capacity_mb: capacityMb,
      available_mb: availableMb,
      used_mb: usedMb,
      used_pct: usedPct,
      threshold_pct: numberOrEmpty(row.STORAGE_THRESHOLD_PERCENTAGE),
      device: row.DEVICE_DESCRIPTION_NAME ?? "",
    };
  });

  return {
    count: asps.length,
    units: { capacity_mb: "MB", available_mb: "MB", used_mb: "MB", used_pct: "percent" },
    asps,
    help: [
      "Run `ibmi-axi cpu` for live CPU utilization",
      "Run `ibmi-axi msgw` for QSYSOPR inquiry messages waiting for reply",
    ],
  };
}

function numberOrEmpty(value: string | undefined): number | string {
  if (value === undefined || value === "") return "";
  const n = Number(value.replace(/,/g, ""));
  return Number.isFinite(n) ? n : value;
}
