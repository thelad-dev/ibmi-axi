import { AxiError } from "axi-sdk-js";

function flagEqualsPrefix(flag: string): string {
  return `${flag}=`;
}

/** Get a flag value from `--flag value` or `--flag=value` without mutating args. */
export function getFlag(args: string[], name: string): string | undefined {
  const equalsPrefix = flagEqualsPrefix(name);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === name) {
      if (i + 1 >= args.length) return undefined;
      return args[i + 1];
    }
    if (arg !== undefined && arg.startsWith(equalsPrefix)) {
      return arg.slice(equalsPrefix.length);
    }
  }
  return undefined;
}

/** Take a flag value and remove it from args. */
export function takeFlag(args: string[], flag: string): string | undefined {
  const equalsPrefix = flagEqualsPrefix(flag);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === flag) {
      const val = args[i + 1];
      args.splice(i, 2);
      return val;
    }
    if (arg !== undefined && arg.startsWith(equalsPrefix)) {
      const val = arg.slice(equalsPrefix.length);
      args.splice(i, 1);
      return val;
    }
  }
  return undefined;
}

export function hasFlag(args: string[], flag: string): boolean {
  return args.includes(flag);
}

export function takeBoolFlag(args: string[], flag: string): boolean {
  const idx = args.indexOf(flag);
  if (idx === -1) return false;
  args.splice(idx, 1);
  return true;
}

export function getPositional(args: string[]): string[] {
  return args.filter((a) => !a.startsWith("-"));
}

/**
 * Reject unknown flags after known ones have been taken.
 * Known booleans and value flags must already be removed.
 */
export function rejectUnknownFlags(
  args: string[],
  commandLabel: string,
  validFlags: string[],
): void {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === undefined || !arg.startsWith("-")) continue;
    if (arg === "--") continue;
    const name = arg.includes("=") ? arg.slice(0, arg.indexOf("=")) : arg;
    if (name === "--help") continue;
    throw new AxiError(`unknown flag ${name} for \`${commandLabel}\``, "VALIDATION_ERROR", [
      `valid flags for \`${commandLabel}\`: ${validFlags.sort().join(", ")} (--help always allowed)`,
    ]);
  }
}

export function parseLimit(
  value: string | undefined,
  fallback: number,
  max: number,
  flag = "--limit",
): number {
  if (value === undefined) return fallback;
  if (!/^\d+$/.test(value)) {
    throw new AxiError(`${flag} must be a positive integer`, "VALIDATION_ERROR", [
      `Run with ${flag} <n> where 1 <= n <= ${max}`,
    ]);
  }
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n < 1) {
    throw new AxiError(`${flag} must be a positive integer`, "VALIDATION_ERROR");
  }
  return Math.min(n, max);
}

export function requireValue(value: string | undefined, flag: string, help: string[]): string {
  if (value === undefined || value.trim() === "") {
    throw new AxiError(`${flag} is required`, "VALIDATION_ERROR", help);
  }
  return value;
}
