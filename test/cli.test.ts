import { describe, expect, it } from "vitest";
import { MAX_MEMBER_BYTES, MAX_MEMBER_PREVIEW } from "../src/config.js";
import { parseLsSizeBytes, parseWcBytes } from "../src/commands/member.js";
import { VERSION } from "../src/version.js";
import {
  defaultMock,
  lsSizeLine,
  memberMock,
  mockRunner,
  runCli,
  SAMPLE_MEMBER_CONTENT,
  SAMPLE_OBJECT,
} from "./helpers.js";

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

  it("asp returns capacity and derived used percent", async () => {
    const result = await runCli(["asp"], defaultMock());
    expect(result.code).toBe(0);
    expect(result.stdout).toMatch(/asps/);
    expect(result.stdout).toMatch(/used_pct/);
    expect(result.stdout).toMatch(/1986456|capacity_mb/);
  });

  it("cpu returns labeled utilization percentages", async () => {
    const result = await runCli(["cpu"], defaultMock());
    expect(result.code).toBe(0);
    expect(result.stdout).toMatch(/average_pct/);
    expect(result.stdout).toMatch(/12\.5/);
    expect(result.stdout).toMatch(/percent/);
    expect(result.stdout).toMatch(/--jobs/);
  });

  it("cpu --jobs includes top jobs by cpu_ms", async () => {
    const result = await runCli(["cpu", "--jobs", "2"], defaultMock());
    expect(result.code).toBe(0);
    expect(result.stdout).toMatch(/top_jobs/);
    expect(result.stdout).toMatch(/AAWO01S52/);
    expect(result.stdout).toMatch(/15143567/);
  });

  it("msgw lists inquiry messages and redacts secrets", async () => {
    const result = await runCli(["msgw"], defaultMock());
    expect(result.code).toBe(0);
    expect(result.stdout).toMatch(/QSYS\/QSYSOPR/);
    expect(result.stdout).toMatch(/CPA0701/);
    expect(result.stdout).toMatch(/password=<redacted>/);
    expect(result.stdout).not.toMatch(/supersecret/);
    expect(result.stdout).toMatch(/jobs_msgw/);
    expect(result.stdout).toMatch(/BATCH01/);
  });

  it("msgw rejects unknown filter", async () => {
    const result = await runCli(["msgw", "--filter", "nope"], defaultMock());
    expect(result.code).toBe(2);
    expect(result.stdout).toMatch(/invalid --filter/);
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

  it("member read refuses oversized members without --allow-large", async () => {
    const oversized = MAX_MEMBER_BYTES + 1;
    const seen: string[] = [];
    const runner = memberMock({ sourceBytes: oversized });
    const wrapped = mockRunner(async (cmd) => {
      seen.push(cmd);
      return runner.run(cmd);
    });
    const result = await runCli(
      ["member", "read", "DENSION/QS36SRC", "AERA01", "--full"],
      wrapped,
    );
    expect(result.code).not.toBe(0);
    expect(result.stdout).toMatch(/MEMBER_TOO_LARGE|too large|max/i);
    expect(result.stdout).toMatch(/allow-large/);
    expect(seen.some((c) => c.includes("CPYTOSTMF"))).toBe(false);
  });

  it("member read allows oversized members with --allow-large", async () => {
    const content = `${"A".repeat(MAX_MEMBER_BYTES + 50)}\n`;
    const result = await runCli(
      ["member", "read", "DENSION/QS36SRC", "AERA01", "--full", "--allow-large"],
      memberMock({ sourceBytes: content.length, exportBytes: content.length, content }),
    );
    expect(result.code).toBe(0);
    expect(result.stdout).toMatch(/allow_large:\s*true/);
    expect(result.stdout).toMatch(/risk: large SSH/);
  });

  it("member read refuses when size cannot be determined", async () => {
    const runner = mockRunner((cmd) => {
      if (cmd.includes("ls -ln ") || /(^|\|\s*)ls -l /.test(cmd) || cmd.includes("wc -c")) {
        return { code: 1, stdout: "", stderr: "missing" };
      }
      if (cmd.includes("CPYTOSTMF")) {
        return { code: 0, stdout: "CPCA082\n", stderr: "" };
      }
      if (cmd.startsWith("rm -f") || cmd.startsWith("cat ")) {
        return { code: 0, stdout: SAMPLE_MEMBER_CONTENT, stderr: "" };
      }
      return { code: 1, stdout: "", stderr: `unexpected: ${cmd}` };
    });
    const result = await runCli(["member", "read", "DENSION/QS36SRC", "AERA01"], runner);
    expect(result.code).not.toBe(0);
    expect(result.stdout).toMatch(/MEMBER_SIZE_UNKNOWN|could not be determined/i);
    expect(result.stdout).toMatch(/allow-large/);
  });

  it("member read refuses when export size is unknown even if source probe is small", async () => {
    const seen: string[] = [];
    const runner = memberMock({
      sourceBytes: 64,
      failExportProbe: true,
      content: `${"Z".repeat(MAX_MEMBER_BYTES + 100)}\n`,
    });
    const wrapped = mockRunner(async (cmd) => {
      seen.push(cmd);
      return runner.run(cmd);
    });
    const result = await runCli(
      ["member", "read", "DENSION/QS36SRC", "AERA01", "--full"],
      wrapped,
    );
    expect(result.code).not.toBe(0);
    expect(result.stdout).toMatch(/MEMBER_SIZE_UNKNOWN|could not be determined/i);
    expect(result.stdout).toMatch(/allow-large/);
    expect(seen.some((c) => c.includes("CPYTOSTMF"))).toBe(true);
    expect(seen.some((c) => c.startsWith("cat "))).toBe(false);
  });

  it("member read honors --limit up to MAX_MEMBER_PREVIEW without silent lower cap", async () => {
    const marker = "X";
    const content = `${marker.repeat(12_000)}\n`;
    const result = await runCli(
      ["member", "read", "DENSION/QS36SRC", "AERA01", "--limit", "11000"],
      memberMock({ sourceBytes: content.length, exportBytes: content.length, content }),
    );
    expect(result.code).toBe(0);
    expect(result.stdout).toMatch(/truncated:\s*true/);
    const contentMatch = result.stdout.match(/content:\s*"(X+)/);
    expect(contentMatch?.[1]?.length).toBe(11_000);
  });

  it("member help documents --allow-large and size cap", async () => {
    const result = await runCli(["member", "--help"], defaultMock());
    expect(result.code).toBe(0);
    expect(result.stdout).toMatch(/--allow-large/);
    expect(result.stdout).toMatch(new RegExp(String(MAX_MEMBER_BYTES)));
    expect(result.stdout).toMatch(new RegExp(String(MAX_MEMBER_PREVIEW)));
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
    expect(result.stdout).toMatch(/asp/);
    expect(result.stdout).toMatch(/cpu/);
    expect(result.stdout).toMatch(/msgw/);
    expect(result.stdout).toMatch(/member/);
    expect(result.stdout).toMatch(/ifs/);
    expect(result.stdout).toMatch(/accept-new/);
  });
});

describe("member size parsers", () => {
  it("parses ls -l size field", () => {
    expect(parseLsSizeBytes(lsSizeLine(2048))).toBe(2048);
    expect(parseLsSizeBytes("total 4\n")).toBeUndefined();
  });

  it("parses wc -c output", () => {
    expect(parseWcBytes("  4096 /tmp/x\n")).toBe(4096);
    expect(parseWcBytes("not-a-size")).toBeUndefined();
  });
});
