import os from "node:os";
import path from "node:path";
import { AxiError } from "axi-sdk-js";

export const DEFAULT_HOST = "as400";
export const DEFAULT_CONNECT_TIMEOUT_SEC = 10;
export const DEFAULT_MEMBER_PREVIEW = 1500;
export const DEFAULT_JOBLOG_LIMIT = 30;
export const DEFAULT_SPOOL_LIMIT = 20;
export const DEFAULT_IFS_LIMIT = 100;
/** Default top-job rows for `cpu --jobs` (0 = system metrics only; ACTIVE_JOB_INFO is slower). */
export const DEFAULT_CPU_JOBS = 0;
export const DEFAULT_MSGW_LIMIT = 20;
export const MAX_LIMIT = 500;
/** Max chars for member read --limit preview (non --full). */
export const MAX_MEMBER_PREVIEW = 200_000;
/** Hard cap for member export (CPYTOSTMF + cat). Override with --allow-large. */
export const MAX_MEMBER_BYTES = 1_048_576;

export interface IbmiConfig {
  host: string;
  sshBin: string;
  connectTimeoutSec: number;
  /** Injected runner for tests. When set, real SSH is never spawned. */
  runner?: SshRunner;
  transport: Transport;
  mcp?: McpConfig;
}

export interface SshResult {
  code: number;
  stdout: string;
  stderr: string;
}

export interface SshRunner {
  run(remoteCommand: string, options?: { timeoutMs?: number }): Promise<SshResult>;
}

export type Transport = "ssh" | "mcp";

export interface McpConfig {
  host: string;
  user?: string;
  pass?: string;
  port: number;
  /** Command to spawn the MCP server (e.g. ["npx", "-y", "ibmi-mcp-server"]). */
  serverCmd: string[];
}

export interface ResolveConfigInput {
  args: string[];
  env?: NodeJS.ProcessEnv;
  runner?: SshRunner;
}

/**
 * Resolve host/ssh + optional MCP transport settings.
 * Mutates `args` by consuming global `--host` / `--transport`.
 * MCP uses DB2i_* or IBMI_AXI_MCP_* envs (separate from SSH). Credentials never echoed.
 */
export function resolveConfig(input: ResolveConfigInput): IbmiConfig {
  const env = input.env ?? process.env;
  const args = input.args;

  let hostFromFlag: string | undefined;
  let transportFromFlag: Transport | undefined;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--host") {
      const val = args[i + 1];
      if (!val || val.startsWith("-")) {
        throw new AxiError("--host requires a value", "VALIDATION_ERROR", [
          "Run `ibmi-axi <command> --host as400`",
        ]);
      }
      hostFromFlag = val;
      args.splice(i, 2);
      i--;
      continue;
    }
    if (arg !== undefined && arg.startsWith("--host=")) {
      hostFromFlag = arg.slice("--host=".length);
      args.splice(i, 1);
      i--;
      continue;
    }
    if (arg === "--transport") {
      const val = args[i + 1];
      if (!val || val.startsWith("-")) {
        throw new AxiError("--transport requires ssh|mcp", "VALIDATION_ERROR");
      }
      if (val !== "ssh" && val !== "mcp") {
        throw new AxiError(`invalid --transport '${val}' (use ssh|mcp)`, "VALIDATION_ERROR");
      }
      transportFromFlag = val;
      args.splice(i, 2);
      i--;
      continue;
    }
    if (arg !== undefined && arg.startsWith("--transport=")) {
      const val = arg.slice("--transport=".length);
      if (val !== "ssh" && val !== "mcp") {
        throw new AxiError(`invalid --transport '${val}' (use ssh|mcp)`, "VALIDATION_ERROR");
      }
      transportFromFlag = val;
      args.splice(i, 1);
      i--;
    }
  }

  const transport = (transportFromFlag ?? (env.IBMI_AXI_TRANSPORT as Transport) ?? "ssh");
  if (transport !== "ssh" && transport !== "mcp") {
    throw new AxiError("invalid IBMI_AXI_TRANSPORT (use ssh|mcp)", "VALIDATION_ERROR");
  }

  const host = (hostFromFlag ?? env.IBMI_AXI_HOST ?? DEFAULT_HOST).trim();
  if (!host || /[\s;|&]/.test(host)) {
    throw new AxiError("invalid --host value", "VALIDATION_ERROR");
  }

  const timeoutRaw = env.IBMI_AXI_CONNECT_TIMEOUT;
  let connectTimeoutSec = DEFAULT_CONNECT_TIMEOUT_SEC;
  if (timeoutRaw && /^\d+$/.test(timeoutRaw)) {
    connectTimeoutSec = Math.min(120, Math.max(1, Number.parseInt(timeoutRaw, 10)));
  }

  // MCP config (DB2i_* preferred for ibmi-mcp-server compat; also IBMI_AXI_MCP_*)
  let mcp: McpConfig | undefined;
  if (transport === "mcp") {
    const mcpHost = env.DB2i_HOST ?? env.IBMI_AXI_MCP_HOST ?? host;
    const mcpUser = env.DB2i_USER ?? env.IBMI_AXI_MCP_USER;
    const mcpPass = env.DB2i_PASS ?? env.IBMI_AXI_MCP_PASS;
    const mcpPortRaw = env.DB2i_PORT ?? env.IBMI_AXI_MCP_PORT ?? "8076";
    const port = /^\d+$/.test(mcpPortRaw) ? Number.parseInt(mcpPortRaw, 10) : 8076;
    const serverCmd = (env.IBMI_AXI_MCP_SERVER_CMD ?? "npx -y ibmi-mcp-server").split(/\s+/).filter(Boolean);
    mcp = {
      host: mcpHost.trim(),
      user: mcpUser?.trim(),
      pass: mcpPass,
      port: port || 8076,
      serverCmd: serverCmd.length ? serverCmd : ["npx", "-y", "ibmi-mcp-server"],
    };
  }

  return {
    host,
    sshBin: env.IBMI_AXI_SSH?.trim() || "ssh",
    connectTimeoutSec,
    runner: input.runner,
    transport,
    mcp,
  };
}

export function collapseHome(filePath: string, homeDir = os.homedir()): string {
  if (filePath.startsWith(homeDir)) return `~${filePath.slice(homeDir.length)}`;
  return filePath;
}

export function displayBin(execPath = process.argv[1] ?? "ibmi-axi"): string {
  return collapseHome(path.resolve(execPath));
}
