import { AxiError } from "axi-sdk-js";

const NAME_RE = /^[A-Za-z0-9$#@_.]{1,128}$/;
const LIB_OBJ_RE = /^([A-Za-z0-9$#@_]{1,10})\/([A-Za-z0-9$#@_]{1,10})$/;
const OBJ_TYPE_RE = /^\*[A-Z][A-Z0-9]{0,9}$/;

export interface LibObj {
  library: string;
  object: string;
}

export function parseLibObj(raw: string, label = "object"): LibObj {
  const trimmed = raw.trim();
  const m = LIB_OBJ_RE.exec(trimmed);
  if (!m) {
    throw new AxiError(
      `${label} must be LIB/OBJ (e.g. DENSION/AERA01)`,
      "VALIDATION_ERROR",
      [`Pass ${label} as LIBRARY/OBJECT`],
    );
  }
  return { library: m[1]!.toUpperCase(), object: m[2]!.toUpperCase() };
}

export function parseMemberTarget(
  fileSpec: string,
  member: string | undefined,
): { library: string; file: string; member: string } {
  const file = parseLibObj(fileSpec, "file");
  if (!member || !NAME_RE.test(member.trim())) {
    throw new AxiError(
      "member name is required (1-10 IBM i characters)",
      "VALIDATION_ERROR",
      ["Run `ibmi-axi member read LIB/FILE MBR`"],
    );
  }
  const mbr = member.trim().toUpperCase();
  if (mbr.length > 10) {
    throw new AxiError("member name must be at most 10 characters", "VALIDATION_ERROR");
  }
  return { library: file.library, file: file.object, member: mbr };
}

export function parseObjType(raw: string | undefined, fallback = "*ALL"): string {
  if (raw === undefined || raw.trim() === "") return fallback;
  const t = raw.trim().toUpperCase();
  const normalized = t.startsWith("*") ? t : `*${t}`;
  if (!OBJ_TYPE_RE.test(normalized)) {
    throw new AxiError(
      `invalid object type ${raw}`,
      "VALIDATION_ERROR",
      ["Use IBM i types like *PGM, *FILE, *CMD, *ALL"],
    );
  }
  return normalized;
}

export function assertSafePath(path: string): string {
  const trimmed = path.trim();
  if (!trimmed.startsWith("/")) {
    throw new AxiError("IFS path must be absolute (start with /)", "VALIDATION_ERROR", [
      "Run `ibmi-axi ifs ls /home/LADWEIN`",
    ]);
  }
  if (trimmed.includes("\0") || /[\n\r]/.test(trimmed)) {
    throw new AxiError("IFS path contains illegal characters", "VALIDATION_ERROR");
  }
  // Reject shell metacharacters that would break remote quoting
  if (/[;|&`$<>\\]/.test(trimmed)) {
    throw new AxiError("IFS path contains unsupported shell metacharacters", "VALIDATION_ERROR");
  }
  return trimmed;
}

export function assertSafeName(value: string, label: string): string {
  const v = value.trim().toUpperCase();
  if (!NAME_RE.test(v) || v.length > 10 && label !== "job") {
    // jobs can be longer: 123456/USER/JOBNAME
  }
  if (label === "job") {
    if (!/^[A-Za-z0-9/#$_.]{1,64}$/.test(value.trim())) {
      throw new AxiError(
        "job must look like NUMBER/USER/NAME or a short job name",
        "VALIDATION_ERROR",
      );
    }
    return value.trim().toUpperCase();
  }
  if (!NAME_RE.test(v) || v.length > 10) {
    throw new AxiError(`invalid ${label}`, "VALIDATION_ERROR");
  }
  return v;
}

/** Escape a string for embedding inside a single-quoted IBM i SQL literal. */
export function sqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

/** Escape a remote shell single-quoted string (POSIX-safe). */
export function shSingleQuote(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

/**
 * Build a remote `qsh -c "db2 \"SQL\""` command.
 * SQL must use only single-quoted literals (see sqlString).
 */
export function buildDb2Remote(sql: string): string {
  if (/["\\\n\r`]/.test(sql)) {
    throw new AxiError("SQL contains characters unsafe for remote shell transport", "VALIDATION_ERROR");
  }
  // qsh -c "db2 \"SQL\"" — double-quoted outer so single-quoted SQL literals pass through.
  const inner = `db2 "${sql}"`;
  const escaped = inner.replaceAll("\\", "\\\\").replaceAll('"', '\\"').replaceAll("$", "\\$");
  return `/QOpenSys/usr/bin/qsh -c "${escaped}"`;
}
