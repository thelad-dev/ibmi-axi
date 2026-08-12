import type { AxiRenderable } from "../types.js";
import type { AppContext } from "../context.js";
import { DESCRIPTION } from "../help.js";
import { displayBin } from "../config.js";
import { buildDb2Remote } from "../parse.js";
import { sshExec } from "../ssh.js";

export async function homeCommand(_args: string[], ctx: AppContext | undefined): Promise<AxiRenderable> {
  if (!ctx) throw new Error("missing context");

  let hostStatus = "unchecked";
  let os = "unknown";
  try {
    const probe = await sshExec(
      ctx.config,
      buildDb2Remote("SELECT OS_VERSION, OS_RELEASE, HOST_NAME FROM SYSIBMADM.ENV_SYS_INFO"),
      {
        allowNonZero: true,
        timeoutMs: 15_000,
      },
    );
    if (probe.code === 0 && /RECORD/i.test(probe.stdout)) {
      hostStatus = "reachable";
      const m = probe.stdout.match(/\n\s*(\d+)\s+(\d+)\s+(\S+)/);
      if (m) os = `V${m[1]}R${m[2]} (${m[3]})`;
    } else if (probe.code === 0) {
      hostStatus = "reachable";
    } else {
      hostStatus = "error";
    }
  } catch {
    hostStatus = "unreachable";
  }

  return {
    bin: displayBin(ctx.binPath),
    description: DESCRIPTION,
    host: ctx.config.host,
    host_status: hostStatus,
    os,
    mode: "live-read",
    help: [
      "Run `ibmi-axi doctor` to verify SSH and SQL readiness",
      "Run `ibmi-axi obj show LIB/OBJ --type *PGM` for object attributes",
      "Run `ibmi-axi member read LIB/FILE MBR` to read a source member",
      "Run `ibmi-axi ifs ls /path` for a bounded IFS listing",
    ],
  };
}
