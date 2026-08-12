import { describe, expect, it } from "vitest";
import {
  assertSafePath,
  buildDb2Remote,
  parseLibObj,
  parseMemberTarget,
  parseObjType,
  shSingleQuote,
  sqlString,
} from "../src/parse.js";
import { parseDb2Table } from "../src/ssh.js";
import { redact, truncate } from "../src/redact.js";
import { SAMPLE_OBJECT } from "./helpers.js";

describe("parse", () => {
  it("parses LIB/OBJ", () => {
    expect(parseLibObj("dension/aera01")).toEqual({
      library: "DENSION",
      object: "AERA01",
    });
  });

  it("parses member targets", () => {
    expect(parseMemberTarget("DENSION/QS36SRC", "aera01")).toEqual({
      library: "DENSION",
      file: "QS36SRC",
      member: "AERA01",
    });
  });

  it("normalizes object types", () => {
    expect(parseObjType("pgm")).toBe("*PGM");
    expect(parseObjType("*FILE")).toBe("*FILE");
    expect(parseObjType(undefined)).toBe("*ALL");
  });

  it("requires absolute IFS paths", () => {
    expect(() => assertSafePath("relative")).toThrow(/absolute/);
    expect(assertSafePath("/home/X")).toBe("/home/X");
  });

  it("escapes SQL strings", () => {
    expect(sqlString("O'Brien")).toBe("'O''Brien'");
  });

  it("builds safe remote db2 commands with SQL single quotes", () => {
    const remote = buildDb2Remote("SELECT 1 FROM SYSIBM.SYSDUMMY1 WHERE X = '*'");
    expect(remote).toContain("qsh -c");
    expect(remote).toContain("db2");
    expect(remote).toContain("WHERE X = '*'");
    expect(remote).not.toContain(`'"'"'`);
  });

  it("single-quotes shell args with embedded apostrophes", () => {
    expect(shSingleQuote("a'b")).toBe(`'a'"'"'b'`);
  });
});

describe("db2 table parse", () => {
  it("parses aligned db2 output", () => {
    const table = parseDb2Table(SAMPLE_OBJECT);
    expect(table.rows).toHaveLength(1);
    expect(table.rows[0]?.OBJNAME).toBe("AERA01");
    expect(table.rows[0]?.OBJTYPE).toBe("*PGM");
  });
});

describe("redact", () => {
  it("masks password assignments", () => {
    expect(redact("password=supersecret")).toMatch(/password=<redacted>/);
    expect(redact("password=supersecret")).not.toMatch(/supersecret/);
  });

  it("truncates long text", () => {
    const r = truncate("abcdefghij", 5);
    expect(r.truncated).toBe(true);
    expect(r.total).toBe(10);
    expect(r.text).toMatch(/truncated/);
  });
});
