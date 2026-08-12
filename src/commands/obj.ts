import type { AxiRenderable } from "../types.js";
import { AxiError } from "axi-sdk-js";
import type { AppContext } from "../context.js";
import {
  getPositional,
  rejectUnknownFlags,
  takeBoolFlag,
  takeFlag,
} from "../args.js";
import { parseLibObj, parseObjType, sqlString } from "../parse.js";
import { parseDb2Table, runDb2 } from "../ssh.js";

export async function objCommand(args: string[], ctx: AppContext | undefined): Promise<AxiRenderable> {
  if (!ctx) throw new Error("missing context");
  const local = [...args];
  takeBoolFlag(local, "--help");

  const sub = local[0];
  if (!sub || sub.startsWith("-")) {
    throw new AxiError("obj requires a subcommand", "VALIDATION_ERROR", [
      "Run `ibmi-axi obj show LIB/OBJ --type *PGM`",
    ]);
  }
  if (sub !== "show") {
    throw new AxiError(`unknown obj subcommand ${sub}`, "VALIDATION_ERROR", [
      "valid subcommands: show",
    ]);
  }
  local.shift();

  const type = parseObjType(takeFlag(local, "--type"), "*ALL");
  rejectUnknownFlags(local, "obj show", ["--type", "--host"]);
  const positionals = getPositional(local);
  if (positionals.length !== 1) {
    throw new AxiError("obj show requires exactly one LIB/OBJ argument", "VALIDATION_ERROR", [
      "Run `ibmi-axi obj show DENSION/AERA01 --type *PGM`",
    ]);
  }
  const { library, object } = parseLibObj(positionals[0]!);

  const sql =
    type === "*ALL"
      ? `SELECT OBJNAME, OBJTYPE, OBJATTRIBUTE, OBJSIZE, OBJTEXT, OBJOWNER, LAST_USED_TIMESTAMP, OBJCREATED ` +
        `FROM TABLE(QSYS2.OBJECT_STATISTICS(${sqlString(library)}, '*ALL', ${sqlString(object)})) X`
      : `SELECT OBJNAME, OBJTYPE, OBJATTRIBUTE, OBJSIZE, OBJTEXT, OBJOWNER, LAST_USED_TIMESTAMP, OBJCREATED ` +
        `FROM TABLE(QSYS2.OBJECT_STATISTICS(${sqlString(library)}, ${sqlString(type)}, ${sqlString(object)})) X`;

  const stdout = await runDb2(ctx.config, sql);
  const table = parseDb2Table(stdout);
  if (table.rows.length === 0) {
    return {
      object: `${library}/${object}`,
      type,
      objects: 0,
      message: `0 objects found for ${library}/${object} type ${type}`,
      help: [
        "Check library/object spelling and --type",
        "Run `ibmi-axi doctor` if SQL probes fail",
      ],
    };
  }

  const objects = table.rows.map((row) => ({
    name: row.OBJNAME ?? object,
    library,
    type: row.OBJTYPE ?? type,
    attribute: row.OBJATTRIBUTE ?? "",
    size: numberOrString(row.OBJSIZE),
    text: row.OBJTEXT ?? "",
    owner: row.OBJOWNER ?? "",
    last_used: row.LAST_USED_TIMESTAMP ?? "",
    created: row.OBJCREATED ?? "",
  }));

  return {
    object: `${library}/${object}`,
    type,
    count: objects.length,
    objects,
  };
}

function numberOrString(value: string | undefined): number | string {
  if (value === undefined || value === "") return "";
  const n = Number(value.replace(/,/g, ""));
  return Number.isFinite(n) ? n : value;
}
