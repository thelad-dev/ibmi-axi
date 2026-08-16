import { spawn } from "node:child_process";
import { AxiError } from "axi-sdk-js";
import type { IbmiConfig, SshResult, SshRunner } from "./config.js";
import { redact } from "./redact.js";
import { buildDb2Remote, shSingleQuote } from "./parse.js";

export function createSshRunner(config: IbmiConfig): SshRunner {
  if (config.runner) return config.runner;

  return {
    async run(remoteCommand, options = {}): Promise<SshResult> {
      const timeoutMs = options.timeoutMs ?? config.connectTimeoutSec * 1000 + 30_000;
      const args = [
        "-o",
        "BatchMode=yes",
        "-o",
        `ConnectTimeout=${config.connectTimeoutSec}`,
        "-o",
        "StrictHostKeyChecking=accept-new",
        config.host,
        remoteCommand,
      ];

      return await new Promise<SshResult>((resolve, reject) => {
        const child = spawn(config.sshBin, args, {
          stdio: ["ignore", "pipe", "pipe"],
          env: process.env,
        });
        let stdout = "";
        let stderr = "";
        let settled = false;

        const timer = setTimeout(() => {
          if (settled) return;
          settled = true;
          child.kill("SIGKILL");
          reject(
            new AxiError(
              `SSH to ${config.host} timed out after ${Math.round(timeoutMs / 1000)}s`,
              "SSH_TIMEOUT",
              [
                "Check network reachability and `ssh <host>` manually",
                "Raise IBMI_AXI_CONNECT_TIMEOUT (seconds) if the host is slow",
              ],
            ),
          );
        }, timeoutMs);

        child.stdout.setEncoding("utf8");
        child.stderr.setEncoding("utf8");
        child.stdout.on("data", (chunk: string) => {
          stdout += chunk;
        });
        child.stderr.on("data", (chunk: string) => {
          stderr += chunk;
        });
        child.on("error", (err) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          reject(
            new AxiError(
              `failed to spawn SSH (${config.sshBin}): ${err.message}`,
              "SSH_SPAWN",
              ["Install OpenSSH client and ensure it is on PATH", "Or set IBMI_AXI_SSH to the ssh binary"],
            ),
          );
        });
        child.on("close", (code) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve({
            code: code ?? 1,
            stdout,
            stderr,
          });
        });
      });
    },
  };
}

export async function sshExec(
  config: IbmiConfig,
  remoteCommand: string,
  options?: { timeoutMs?: number; allowNonZero?: boolean; redactOutput?: boolean },
): Promise<SshResult> {
  const runner = createSshRunner(config);
  const result = await runner.run(remoteCommand, options);
  const shouldRedact = options?.redactOutput !== false;
  const safe: SshResult = shouldRedact
    ? { ...result, stdout: redact(result.stdout), stderr: redact(result.stderr) }
    : result;
  if (!options?.allowNonZero && safe.code !== 0) {
    const detail = redact((safe.stderr || safe.stdout || "no output").trim().slice(0, 400));
    throw new AxiError(`remote command failed on ${config.host} (exit ${safe.code})`, "REMOTE_ERROR", [
      detail || "Run `ibmi-axi doctor` to check connectivity",
    ]);
  }
  return safe;
}

/** Run a Db2 for i statement via qsh and return raw CLI text. */
export async function runDb2(config: IbmiConfig, sql: string): Promise<string> {
  const remote = buildDb2Remote(sql);
  const result = await sshExec(config, remote, {
    allowNonZero: true,
    timeoutMs: 60_000,
    redactOutput: false,
  });
  const combined = `${result.stdout}\n${result.stderr}`;
  const hasCliError = /CLI ERROR|SQLSTATE:\s*\d|NATIVE ERROR CODE/i.test(combined);
  // db2 may exit non-zero on zero-row result sets or CCSID noise; accept clean tabular output.
  const hasTable = /RECORD\(S\)\s+SELECTED/i.test(combined) || /^-{3,}/m.test(result.stdout);
  if (hasCliError || (result.code !== 0 && !hasTable)) {
    const msg = redact(extractDb2Error(combined) || `db2 failed (exit ${result.code})`);
    throw new AxiError(msg, "SQL_ERROR", [
      "Verify the object/library exists and your SSH user has authority",
      "Run `ibmi-axi doctor` to confirm SQL path readiness",
    ]);
  }
  return result.stdout;
}

function extractDb2Error(text: string): string | undefined {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((l) => !/^\*+/.test(l) && !/^----+/.test(l));
  const descriptive = lines.find((l) =>
    /not found|nicht gefunden|Authorization|Berechtigung|JOB .+ NOT FOUND|ungültig|invalid/i.test(l),
  );
  if (descriptive) return descriptive.slice(0, 240);
  const state = lines.find((l) => /SQLSTATE|NATIVE ERROR/i.test(l));
  return state?.slice(0, 240);
}

/**
 * Parse simple db2 tabular output into row objects keyed by header names.
 * Handles the common aligned-column CLI format.
 */
export function parseDb2Table(stdout: string): { columns: string[]; rows: Record<string, string>[] } {
  const lines = stdout
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+$/, ""))
    .filter((l) => l.trim().length > 0);

  // Find header: first non-empty line that is not a banner, followed by dashes
  let headerIdx = -1;
  for (let i = 0; i < lines.length - 1; i++) {
    const next = lines[i + 1] ?? "";
    if (/^-{3,}/.test(next.trim()) || /^[-\s]{10,}$/.test(next)) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx < 0) return { columns: [], rows: [] };

  const headerLine = lines[headerIdx]!;
  const sepLine = lines[headerIdx + 1]!;

  // Column starts: runs of non-space in header aligned with dashes below
  const columns: { name: string; start: number; end: number }[] = [];
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(headerLine)) !== null) {
    const name = m[0]!;
    const start = m.index;
    // end = start of next column or end of sep
    columns.push({ name, start, end: start + name.length });
  }
  for (let i = 0; i < columns.length; i++) {
    const col = columns[i]!;
    const next = columns[i + 1];
    col.end = next ? next.start : Math.max(sepLine.length, headerLine.length);
  }

  const rows: Record<string, string>[] = [];
  for (let i = headerIdx + 2; i < lines.length; i++) {
    const line = lines[i]!;
    if (/^\s*\d+\s+RECORD/i.test(line)) break;
    if (/^\s*\*+/.test(line)) continue;
    if (/CLI ERROR|SQLSTATE/i.test(line)) break;
    const row: Record<string, string> = {};
    let empty = true;
    for (const col of columns) {
      const raw = line.slice(col.start, col.end).trim();
      row[col.name] = redact(raw);
      if (raw) empty = false;
    }
    if (!empty) rows.push(row);
  }
  return { columns: columns.map((c) => c.name), rows };
}

/** Run `system "CL-COMMAND"` on the host. */
export async function runSystem(
  config: IbmiConfig,
  clCommand: string,
  options?: { allowNonZero?: boolean },
): Promise<SshResult> {
  // system binary takes the CL command as one arg
  const remote = `/QOpenSys/usr/bin/system ${shSingleQuote(clCommand)}`;
  return sshExec(config, remote, { allowNonZero: options?.allowNonZero ?? true, timeoutMs: 60_000 });
}
