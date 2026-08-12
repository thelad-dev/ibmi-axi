import type { AxiRenderable } from "../types.js";
import { AxiError, installSessionStartHooks } from "axi-sdk-js";
import type { AppContext } from "../context.js";
import { rejectUnknownFlags, takeBoolFlag } from "../args.js";

export async function setupCommand(args: string[], ctx: AppContext | undefined): Promise<AxiRenderable> {
  if (!ctx) throw new Error("missing context");
  const local = [...args];
  takeBoolFlag(local, "--help");
  const sub = local[0];
  if (sub !== "hooks") {
    throw new AxiError("unknown setup command", "VALIDATION_ERROR", [
      "Run `ibmi-axi setup hooks`",
    ]);
  }
  local.shift();
  rejectUnknownFlags(local, "setup hooks", []);

  installSessionStartHooks({
    marker: "ibmi-axi",
    binaryNames: ["ibmi-axi"],
    distEntrypoints: ["dist/bin/ibmi-axi.js", "bin/ibmi-axi.ts"],
  });

  return {
    setup: "hooks installed or already up to date",
    help: [
      "Session hooks inject a compact ibmi-axi home view at agent session start",
      "Run `ibmi-axi skill generate` for the installable skill document",
    ],
  };
}
