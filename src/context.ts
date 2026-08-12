import type { IbmiConfig, SshRunner } from "./config.js";
import { resolveConfig } from "./config.js";

export interface AppContext {
  config: IbmiConfig;
  binPath: string;
}

export interface BuildContextOptions {
  command?: string;
  args: string[];
  env?: NodeJS.ProcessEnv;
  runner?: SshRunner;
  binPath?: string;
}

export function buildContext(options: BuildContextOptions): AppContext {
  const config = resolveConfig({
    args: options.args,
    env: options.env,
    runner: options.runner,
  });
  return {
    config,
    binPath: options.binPath ?? process.argv[1] ?? "ibmi-axi",
  };
}
