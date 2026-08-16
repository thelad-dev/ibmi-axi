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
import { parseDb2Table, runDb2 } from "../src/ssh.js";
import { redact, truncate } from "../src/redact.js";
import { mockRunner, SAMPLE_MSGW_SECRET_SHIFT, SAMPLE_OBJECT } from "./helpers.js";

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

  it("runDb2 keeps trailing columns aligned when MESSAGE_TEXT contains secrets", async () => {
    const shifted = parseDb2Table(redact(SAMPLE_MSGW_SECRET_SHIFT));
    expect(shifted.rows[0]?.MESSAGE_KEY).not.toBe("DEADBEEF");
    expect(shifted.rows[0]?.FROM_JOB).not.toBe("044466/QSECOFR/BATCH01");

    const stdout = await runDb2(
      {
        host: "testhost",
        sshBin: "ssh",
        connectTimeoutSec: 1,
        runner: mockRunner(() => ({ code: 0, stdout: SAMPLE_MSGW_SECRET_SHIFT, stderr: "" })),
      },
      "SELECT 1",
    );
    const table = parseDb2Table(stdout);
    expect(table.rows[0]?.MESSAGE_KEY).toBe("DEADBEEF");
    expect(table.rows[0]?.FROM_JOB).toBe("044466/QSECOFR/BATCH01");
    expect(table.rows[0]?.FROM_USER).toBe("QSECOFR");
    expect(table.rows[0]?.MESSAGE_TIMESTAMP).toBe("2026-08-16-12.00.00.000000");
    expect(table.rows[0]?.MESSAGE_TEXT).toMatch(/password=<redacted>/);
    expect(table.rows[0]?.MESSAGE_TEXT).not.toMatch(/supersecretVALUE12345/);
  });

  it("redacts secret-shaped cell values after fixed-width parse", () => {
    const table = parseDb2Table(`
OBJNAME    OBJTYPE  OBJTEXT
---------- -------- --------------------------------
AERA01     *PGM     lesen password=objSecret99
`);
    expect(table.rows[0]?.OBJNAME).toBe("AERA01");
    expect(table.rows[0]?.OBJTYPE).toBe("*PGM");
    expect(table.rows[0]?.OBJTEXT).toMatch(/password=<redacted>/);
    expect(table.rows[0]?.OBJTEXT).not.toMatch(/objSecret99/);
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
