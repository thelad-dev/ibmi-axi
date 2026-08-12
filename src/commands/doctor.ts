import type { AxiRenderable } from "../types.js";
import { AxiError } from "axi-sdk-js";
import type { AppContext } from "../context.js";
import { rejectUnknownFlags, takeBoolFlag } from "../args.js";
import { buildDb2Remote } from "../parse.js";
import { sshExec, parseDb2Table } from "../ssh.js";

interface Check {
  check: string;
  status: "ok" | "error" | "warn";
  detail: string;
}

export async function doctorCommand(args: string[], ctx: AppContext | undefined): Promise<AxiRenderable> {
  if (!ctx) throw new Error("missing context");
  const local = [...args];
  takeBoolFlag(local, "--help");
  rejectUnknownFlags(local, "doctor", ["--host"]);

  const checks: Check[] = [];
  const host = ctx.config.host;

  // SSH connectivity + uname
  try {
    const r = await sshExec(ctx.config, "uname -a", { allowNonZero: true, timeoutMs: 15_000 });
    if (r.code === 0) {
      checks.push({
        check: "ssh",
        status: "ok",
        detail: `reachable via ${host} (BatchMode, no credentials echoed)`,
      });
      checks.push({
        check: "uname",
        status: "ok",
        detail: r.stdout.trim().replace(/\s+/g, " ").slice(0, 120),
      });
    } else {
      checks.push({
        check: "ssh",
        status: "error",
        detail: summarizeErr(r.stderr || r.stdout) || `exit ${r.code}`,
      });
    }
  } catch (err) {
    checks.push({
      check: "ssh",
      status: "error",
      detail: err instanceof Error ? err.message.slice(0, 160) : "ssh failed",
    });
  }

  // system binary
  try {
    const r = await sshExec(ctx.config, "test -x /QOpenSys/usr/bin/system && echo ok", {
      allowNonZero: true,
    });
    checks.push({
      check: "system-cli",
      status: r.code === 0 && r.stdout.includes("ok") ? "ok" : "error",
      detail: r.code === 0 ? "/QOpenSys/usr/bin/system" : "system binary missing",
    });
  } catch {
    checks.push({ check: "system-cli", status: "error", detail: "probe failed" });
  }

  // SQL path
  try {
    const r = await sshExec(
      ctx.config,
      buildDb2Remote("SELECT OS_VERSION, OS_RELEASE, HOST_NAME FROM SYSIBMADM.ENV_SYS_INFO"),
      { allowNonZero: true, timeoutMs: 20_000 },
    );
    if (r.code === 0 && !/CLI ERROR/i.test(r.stdout + r.stderr)) {
      const table = parseDb2Table(r.stdout);
      const row = table.rows[0];
      const ver = row
        ? `V${row.OS_VERSION ?? "?"}R${row.OS_RELEASE ?? "?"} host=${row.HOST_NAME ?? "?"}`
        : "db2 responded";
      checks.push({ check: "sql-db2", status: "ok", detail: ver.slice(0, 160) });
      checks.push({ check: "os-level", status: "ok", detail: ver.slice(0, 160) });
    } else {
      checks.push({
        check: "sql-db2",
        status: "error",
        detail: summarizeErr(r.stderr || r.stdout) || "db2 not usable",
      });
    }
  } catch (err) {
    checks.push({
      check: "sql-db2",
      status: "error",
      detail: err instanceof Error ? err.message.slice(0, 160) : "sql probe failed",
    });
  }

  // IFS root readable
  try {
    const r = await sshExec(ctx.config, "ls /home >/dev/null 2>&1 && echo ok", { allowNonZero: true });
    checks.push({
      check: "ifs-ls",
      status: r.code === 0 && r.stdout.includes("ok") ? "ok" : "warn",
      detail: r.code === 0 ? "/home listable" : "could not list /home",
    });
  } catch {
    checks.push({ check: "ifs-ls", status: "warn", detail: "probe failed" });
  }

  checks.push({
    check: "credentials",
    status: "ok",
    detail: "not printed; uses local SSH keys/agent only",
  });

  const bad = checks.filter((c) => c.status === "error").length;
  const summary = bad === 0 ? "ready" : "attention-required";

  return {
    summary,
    host,
    checks,
    help:
      bad === 0
        ? [
            "Run `ibmi-axi obj show LIB/OBJ --type *PGM` to inspect an object",
            "Run `ibmi-axi spool --limit 10` for recent spooled files",
          ]
        : [
            "Fix SSH connectivity first: `ssh <host>` must work in BatchMode",
            "Ensure the SSH user can run qsh/db2 and system",
          ],
  };
}

function summarizeErr(text: string): string {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 2)
    .join(" | ")
    .slice(0, 200);
}

/** Exported for tests that want a pure failure shape. */
export function doctorOfflineError(host: string): AxiError {
  return new AxiError(`host ${host} is not reachable`, "SSH_ERROR", [
    "Run `ibmi-axi doctor` after fixing SSH",
  ]);
}
