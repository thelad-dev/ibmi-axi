import os from "node:os";
import path from "node:path";
import { AxiError } from "axi-sdk-js";

export const DEFAULT_HOST = "as400";
export const DEFAULT_CONNECT_TIMEOUT_SEC = 10;
export const DEFAULT_MEMBER_PREVIEW = 1500;
export const DEFAULT_JOBLOG_LIMIT = 30;
export const DEFAULT_SPOOL_LIMIT = 20;
export const DEFAULT_IFS_LIMIT = 100;
export const MAX_LIMIT = 500;

export interface IbmiConfig {
  host: string;
  sshBin: string;
  connectTimeoutSec: number;
  /** Injected runner for tests. When set, real SSH is never spawned. */
  runner?: SshRunner;
}

export interface SshResult {
  code: number;
  stdout: string;
  stderr: string;
}

export interface SshRunner {
  run(remoteCommand: string, options?: { timeoutMs?: number }): Promise<SshResult>;
}

export interface ResolveConfigInput {
  args: string[];
  env?: NodeJS.ProcessEnv;
  runner?: SshRunner;
}

/**
 * Resolve host/ssh settings. Mutates `args` by consuming global `--host`.
 * Never reads or echoes credentials — SSH uses the local agent/keys via OpenSSH.
 */
export function resolveConfig(input: ResolveConfigInput): IbmiConfig {
  const env = input.env ?? process.env;
  const args = input.args;

  let hostFromFlag: string | undefined;
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
    }
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

  return {
    host,
    sshBin: env.IBMI_AXI_SSH?.trim() || "ssh",
    connectTimeoutSec,
    runner: input.runner,
  };
}

export function collapseHome(filePath: string, homeDir = os.homedir()): string {
  if (filePath.startsWith(homeDir)) return `~${filePath.slice(homeDir.length)}`;
  return filePath;
}

export function displayBin(execPath = process.argv[1] ?? "ibmi-axi"): string {
  return collapseHome(path.resolve(execPath));
}
