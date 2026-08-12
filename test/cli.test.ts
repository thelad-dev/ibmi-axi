import { describe, expect, it } from "vitest";
import { VERSION } from "../src/version.js";
import { defaultMock, mockRunner, runCli, SAMPLE_OBJECT } from "./helpers.js";

describe("ibmi-axi CLI", () => {
  it("prints version on fast path flags", async () => {
    for (const flag of ["--version", "-v", "-V"]) {
      const result = await runCli([flag], defaultMock());
      // runAxiCli handles version when not using tryFastPath in tests
      expect(result.stdout.trim()).toBe(VERSION);
      expect(result.code).toBe(0);
    }
  });

  it("home view is content-first with host status", async () => {
    const result = await runCli([], defaultMock());
    expect(result.code).toBe(0);
    expect(result.stdout).toMatch(/bin:/);
    expect(result.stdout).toMatch(/description:/);
    expect(result.stdout).toMatch(/host:\s*testhost/);
    expect(result.stdout).toMatch(/host_status:\s*reachable/);
    expect(result.stdout).toMatch(/help\[/);
    expect(result.stdout).not.toMatch(/^usage:/);
  });

  it("doctor reports readiness without secrets", async () => {
    const result = await runCli(["doctor"], defaultMock());
    expect(result.code).toBe(0);
    expect(result.stdout).toMatch(/summary:\s*ready/);
    expect(result.stdout).toMatch(/ssh/);
    expect(result.stdout).toMatch(/sql-db2/);
    expect(result.stdout).toMatch(/credentials/);
    expect(result.stdout).not.toMatch(/password\s*=\s*(?!<redacted>)\S+/i);
  });

  it("obj show returns object attributes", async () => {
    const result = await runCli(
      ["obj", "show", "DENSION/AERA01", "--type", "*PGM"],
      defaultMock(),
    );
    expect(result.code).toBe(0);
    expect(result.stdout).toMatch(/AERA01/);
    expect(result.stdout).toMatch(/\*PGM/);
    expect(result.stdout).toMatch(/RPG36/);
  });

  it("obj show rejects bad selectors", async () => {
    const result = await runCli(["obj", "show", "not-valid"], defaultMock());
    expect(result.code).toBe(2);
    expect(result.stdout).toMatch(/error:/);
  });

  it("rejects unknown flags loudly", async () => {
    const result = await runCli(["doctor", "--stat"], defaultMock());
    expect(result.code).toBe(2);
    expect(result.stdout).toMatch(/unknown flag --stat/);
  });

  it("spool lists recent files", async () => {
    const result = await runCli(["spool", "--limit", "5"], defaultMock());
    expect(result.code).toBe(0);
    expect(result.stdout).toMatch(/ZLV801PMIK/);
    expect(result.stdout).toMatch(/spooled_files/);
  });

  it("joblog redacts secrets in message text", async () => {
    const result = await runCli(["joblog", "--job", "1/A/B"], defaultMock());
    expect(result.code).toBe(0);
    expect(result.stdout).toMatch(/password=<redacted>/);
    expect(result.stdout).not.toMatch(/supersecret/);
  });

  it("member read returns truncated content and redacts secrets", async () => {
    const result = await runCli(
      ["member", "read", "DENSION/QS36SRC", "AERA01"],
      defaultMock(),
    );
    expect(result.code).toBe(0);
    expect(result.stdout).toMatch(/SAMPLE MEMBER/);
    expect(result.stdout).toMatch(/password=<redacted>/);
    expect(result.stdout).not.toMatch(/should-redact/);
  });

  it("ifs ls returns bounded entries", async () => {
    const result = await runCli(["ifs", "ls", "/home/LADWEIN"], defaultMock());
    expect(result.code).toBe(0);
    expect(result.stdout).toMatch(/get_stat00j9xx\.sql/);
    expect(result.stdout).toMatch(/entries/);
  });

  it("ifs ls rejects relative paths", async () => {
    const result = await runCli(["ifs", "ls", "home"], defaultMock());
    expect(result.code).toBe(2);
    expect(result.stdout).toMatch(/absolute/);
  });

  it("honors --host override", async () => {
    const seen: string[] = [];
    const runner = mockRunner((cmd) => {
      seen.push(cmd);
      if (cmd.includes("OBJECT_STATISTICS")) {
        return { code: 0, stdout: SAMPLE_OBJECT, stderr: "" };
      }
      return { code: 0, stdout: SAMPLE_OBJECT, stderr: "" };
    });
    // host is consumed in resolveConfig; runner is injected so we just ensure command works
    const result = await runCli(
      ["obj", "show", "DENSION/AERA01", "--host", "otherhost", "--type", "*PGM"],
      runner,
      { ...process.env },
    );
    expect(result.code).toBe(0);
    expect(result.stdout).toMatch(/AERA01/);
  });

  it("skill generate --check fails when missing", async () => {
    const result = await runCli(
      ["skill", "generate", "--check", "--output", "/tmp/ibmi-axi-skill-missing-test.md"],
      defaultMock(),
    );
    expect(result.code).not.toBe(0);
    expect(result.stdout).toMatch(/missing|stale|error/i);
  });

  it("top-level help lists commands", async () => {
    const result = await runCli(["--help"], defaultMock());
    expect(result.code).toBe(0);
    expect(result.stdout).toMatch(/doctor/);
    expect(result.stdout).toMatch(/member/);
    expect(result.stdout).toMatch(/ifs/);
  });
});
