import type { IbmiConfig } from "./config.js";
import { runDb2 as runDb2Ssh } from "./ssh.js";
import { runDb2Mcp, closeMcpClient } from "./mcp.js";
import { AxiError } from "axi-sdk-js";

/** Guard for B-category ops (member/ifs etc): throws friendly error if transport=mcp. */
export function requireSsh(config: IbmiConfig, op: string): void {
  if (config.transport === "mcp") {
    throw new AxiError(
      `${op} requires SSH backend (use --transport ssh or unset IBMI_AXI_TRANSPORT)`,
      "TRANSPORT_UNSUPPORTED",
      ["MCP backend supports only category-A ops: doctor,asp,cpu,msgw,obj,joblog,spool"],
    );
  }
}

/** Run Db2 SQL via the selected transport (ssh default, or mcp). */
export async function runDb2(config: IbmiConfig, sql: string): Promise<string> {
  if (config.transport === "mcp") {
    return runDb2Mcp(config, sql);
  }
  return runDb2Ssh(config, sql);
}

/** Cleanup MCP connection (call after CLI or in tests). */
export async function closeBackend(config: IbmiConfig): Promise<void> {
  if (config.transport === "mcp") {
    await closeMcpClient();
  }
}
