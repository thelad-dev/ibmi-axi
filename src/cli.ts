import { AxiError, runAxiCli } from "axi-sdk-js";
import { encode } from "@toon-format/toon";
import type { SshRunner } from "./config.js";
import { buildContext, type AppContext } from "./context.js";
import { COMMAND_HELP, DESCRIPTION, TOP_LEVEL_HELP } from "./help.js";
import { VERSION } from "./version.js";
import { aspCommand } from "./commands/asp.js";
import { cpuCommand } from "./commands/cpu.js";
import { doctorCommand } from "./commands/doctor.js";
import { homeCommand } from "./commands/home.js";
import { ifsCommand } from "./commands/ifs.js";
import { joblogCommand } from "./commands/joblog.js";
import { memberCommand } from "./commands/member.js";
import { msgwCommand } from "./commands/msgw.js";
import { objCommand } from "./commands/obj.js";
import { setupCommand } from "./commands/setup.js";
import { skillCommand } from "./commands/skill.js";
import { spoolCommand } from "./commands/spool.js";

const USAGE_CODES = new Set([
  "VALIDATION_ERROR",
  "SKILL_STALE",
]);

export interface MainOptions {
  argv?: string[];
  stdout?: { write: (chunk: string) => unknown };
  runner?: SshRunner;
  binPath?: string;
  env?: NodeJS.ProcessEnv;
}

export async function main(options: MainOptions = {}): Promise<void> {
  const binPath = options.binPath ?? process.argv[1] ?? "ibmi-axi";
  const argv = options.argv ?? process.argv.slice(2);

  await runAxiCli<AppContext>({
    argv,
    description: DESCRIPTION,
    version: VERSION,
    topLevelHelp: TOP_LEVEL_HELP,
    ...(options.stdout ? { stdout: options.stdout } : {}),
    getCommandHelp: (command) => COMMAND_HELP[command] ?? null,
    home: (args, ctx) => homeCommand(args, ctx),
    resolveContext: ({ args }) =>
      buildContext({
        args,
        env: options.env,
        runner: options.runner,
        binPath,
      }),
    formatError: (error) => {
      if (error instanceof AxiError) {
        const out: Record<string, unknown> = {
          error: error.message,
          code: error.code,
        };
        if (error.suggestions.length > 0) out.help = error.suggestions;
        return {
          output: `${encode(out)}\n`,
          exitCode: USAGE_CODES.has(error.code) ? 2 : 1,
        };
      }
      const message = error instanceof Error ? error.message : String(error);
      return {
        output: `${encode({ error: message, code: "UNKNOWN" })}\n`,
        exitCode: 1,
      };
    },
    commands: {
      doctor: (args, ctx) => doctorCommand(args, ctx),
      asp: (args, ctx) => aspCommand(args, ctx),
      cpu: (args, ctx) => cpuCommand(args, ctx),
      msgw: (args, ctx) => msgwCommand(args, ctx),
      obj: (args, ctx) => objCommand(args, ctx),
      joblog: (args, ctx) => joblogCommand(args, ctx),
      spool: (args, ctx) => spoolCommand(args, ctx),
      member: (args, ctx) => memberCommand(args, ctx),
      ifs: (args, ctx) => ifsCommand(args, ctx),
      setup: (args, ctx) => setupCommand(args, ctx),
      skill: (args, ctx) => skillCommand(args, ctx),
    },
  });
}
