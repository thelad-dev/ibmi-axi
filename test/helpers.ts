import { main } from "../src/cli.js";
import type { SshResult, SshRunner } from "../src/config.js";

export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

export async function runCli(
  argv: string[],
  runner?: SshRunner,
  env: NodeJS.ProcessEnv = { ...process.env, IBMI_AXI_HOST: "testhost" },
): Promise<RunResult> {
  let stdout = "";
  const prevCode = process.exitCode;
  process.exitCode = 0;
  try {
    await main({
      argv,
      runner,
      env,
      binPath: "/tmp/ibmi-axi",
      stdout: {
        write(chunk: string) {
          stdout += chunk;
          return true;
        },
      },
    });
    return { code: process.exitCode ?? 0, stdout, stderr: "" };
  } finally {
    process.exitCode = prevCode;
  }
}

export function mockRunner(handler: (cmd: string) => SshResult | Promise<SshResult>): SshRunner {
  return {
    async run(remoteCommand: string): Promise<SshResult> {
      return handler(remoteCommand);
    },
  };
}

export const SAMPLE_SYSINFO = `
OS_VERSION  OS_RELEASE  HOST_NAME
----------- ----------- ------------------------
7           5           AS400.TEST.LOCAL

  1 RECORD(S) SELECTED.
`;

export const SAMPLE_OBJECT = `
OBJNAME    OBJTYPE  OBJATTRIBUTE  OBJSIZE  OBJTEXT                 OBJOWNER  LAST_USED_TIMESTAMP         OBJCREATED
---------- -------- ------------- -------- ----------------------- --------- --------------------------- --------------------------
AERA01     *PGM     RPG36         98304    lesen File von aera     DENSION   2026-01-08-00.00.00.000000  2019-07-23-08.38.33.000000

  1 RECORD(S) SELECTED.
`;

export const SAMPLE_SPOOL = `
JOB_NAME              SPOOLED_FILE_NAME  FILE_NUMBER  USER_NAME  STATUS  TOTAL_PAGES  CREATE_TIMESTAMP
--------------------- ------------------ ------------ ---------- ------- ------------ --------------------------
954559/KIND/KINDC0    ZLV801PMIK         2            KIND       HELD    1            2026-07-13-08.31.43.090834
954604/NAR/NARB0      ZLV801PMIK         2            NAR        HELD    1            2026-07-13-10.29.41.306974

  2 RECORD(S) SELECTED.
`;

export const SAMPLE_JOBLOG = `
MESSAGE_ID  MESSAGE_TYPE  SEVERITY  MESSAGE_TEXT                     MESSAGE_TIMESTAMP
----------- ------------- --------- -------------------------------- --------------------------
CPF0000     COMPLETION    0         Job started                      2026-08-12-15.00.00.000000
CPD0000     DIAGNOSTIC    20        Something password=supersecret   2026-08-12-15.00.01.000000

  2 RECORD(S) SELECTED.
`;

export const SAMPLE_ASP = `
ASP_NUMBER  ASP_STATE  ASP_TYPE  TOTAL_CAPACITY  TOTAL_CAPACITY_AVAILABLE  STORAGE_THRESHOLD_PERCENTAGE  DEVICE_DESCRIPTION_NAME
----------- ---------- --------- -------------- ------------------------- ----------------------------- ------------------------
1           NONE       SYSTEM    1986456        1104549                   90                            
2           ACTIVE     PRIMARY   500000         250000                    85                            IASP01

  2 RECORD(S) SELECTED.
`;

export const SAMPLE_CPU_ACTIVITY = `
AVERAGE_CPU_RATE  AVERAGE_CPU_UTILIZATION  MINIMUM_CPU_UTILIZATION  MAXIMUM_CPU_UTILIZATION
----------------- ------------------------ ------------------------ ------------------------
100.00            12.50                    10.00                    15.00

  1 RECORD(S) SELECTED.
`;

export const SAMPLE_CPU_STATUS = `
ELAPSED_CPU_USED  CURRENT_CPU_CAPACITY  ACTIVE_JOBS_IN_SYSTEM  TOTAL_JOBS_IN_SYSTEM
----------------- --------------------- ---------------------- --------------------
34.30             1.00                  302                    1822

  1 RECORD(S) SELECTED.
`;

export const SAMPLE_CPU_JOBS = `
JOB_NAME                 AUTHORIZATION_NAME  JOB_STATUS  CPU_TIME
------------------------ ------------------- ----------- --------
051085/DUSEND/AAWO01S52  DUSEND              RUN         15143567
051096/DUSEND/AAZLVJOB52 QTCP                TIMA        406597

  2 RECORD(S) SELECTED.
`;

export const SAMPLE_MSGW = `
MESSAGE_ID  MESSAGE_TYPE  SEVERITY  MESSAGE_TEXT                     MESSAGE_TIMESTAMP          MESSAGE_KEY  FROM_JOB                 FROM_USER
----------- ------------- --------- -------------------------------- -------------------------- ------------ ------------------------ ---------
CPA0701     INQUIRY       99        Job password=supersecret waiting 2026-08-16-12.00.00.000000 0000ABCD     044466/QSECOFR/BATCH01   QSECOFR

  1 RECORD(S) SELECTED.
`;

export const SAMPLE_MSGW_JOBS = `
JOB_NAME                JOB_STATUS  AUTHORIZATION_NAME  SUBSYSTEM
----------------------- ----------- ------------------- ---------
044466/QSECOFR/BATCH01  MSGW        QSECOFR             QBATCH

  1 RECORD(S) SELECTED.
`;

export const SAMPLE_MEMBER_CONTENT =
  "0001 H** SAMPLE MEMBER\n0002 C     HELLO\npassword=should-redact\n";

/** ls -l line with a controllable size field (5th column). */
export function lsSizeLine(bytes: number, name = "member"): string {
  return `-rw-r--r-- 1 100 0 ${bytes} Jan 1 00:00 ${name}\n`;
}

export function defaultMock(): SshRunner {
  return mockRunner((cmd) => {
    if (cmd.includes("uname")) {
      return { code: 0, stdout: "OS400 AS400 5 7\n", stderr: "" };
    }
    if (cmd.includes("test -x /QOpenSys/usr/bin/system")) {
      return { code: 0, stdout: "ok\n", stderr: "" };
    }
    if (cmd.includes("ENV_SYS_INFO")) {
      return { code: 0, stdout: SAMPLE_SYSINFO, stderr: "" };
    }
    if (cmd.includes("ls /home")) {
      return { code: 0, stdout: "ok\n", stderr: "" };
    }
    if (cmd.includes("ASP_INFO")) {
      return { code: 0, stdout: SAMPLE_ASP, stderr: "" };
    }
    if (cmd.includes("SYSTEM_ACTIVITY_INFO")) {
      return { code: 0, stdout: SAMPLE_CPU_ACTIVITY, stderr: "" };
    }
    if (cmd.includes("SYSTEM_STATUS_INFO")) {
      return { code: 0, stdout: SAMPLE_CPU_STATUS, stderr: "" };
    }
    if (cmd.includes("ACTIVE_JOB_INFO") && cmd.includes("CPU_TIME")) {
      return { code: 0, stdout: SAMPLE_CPU_JOBS, stderr: "" };
    }
    if (cmd.includes("MESSAGE_QUEUE_INFO")) {
      return { code: 0, stdout: SAMPLE_MSGW, stderr: "" };
    }
    if (cmd.includes("ACTIVE_JOB_INFO") && cmd.includes("MSGW")) {
      return { code: 0, stdout: SAMPLE_MSGW_JOBS, stderr: "" };
    }
    if (cmd.includes("OBJECT_STATISTICS")) {
      return { code: 0, stdout: SAMPLE_OBJECT, stderr: "" };
    }
    if (cmd.includes("OUTPUT_QUEUE_ENTRIES_BASIC")) {
      return { code: 0, stdout: SAMPLE_SPOOL, stderr: "" };
    }
    if (cmd.includes("JOBLOG_INFO")) {
      return { code: 0, stdout: SAMPLE_JOBLOG, stderr: "" };
    }
    if (cmd.includes("CPYTOSTMF")) {
      return { code: 0, stdout: "CPCA082: Objekt kopiert.\n", stderr: "" };
    }
    // Member size probes (`ls -ln path || ls -l path`) before CPYTOSTMF/cat.
    if (cmd.includes("ls -ln ") || /(^|\|\s*)ls -l /.test(cmd)) {
      if (cmd.includes(".MBR") || cmd.includes("ibmi-axi-mbr-")) {
        return { code: 0, stdout: lsSizeLine(SAMPLE_MEMBER_CONTENT.length), stderr: "" };
      }
    }
    if (cmd.includes("wc -c")) {
      return { code: 0, stdout: `${SAMPLE_MEMBER_CONTENT.length}\n`, stderr: "" };
    }
    if (cmd.startsWith("cat ")) {
      return {
        code: 0,
        stdout: SAMPLE_MEMBER_CONTENT,
        stderr: "",
      };
    }
    if (cmd.startsWith("rm -f")) {
      return { code: 0, stdout: "", stderr: "" };
    }
    if (cmd.includes("ls -la")) {
      return {
        code: 0,
        stdout: `total 8
drwxr-xr-x  3 ladwein 0 8192 Jun  9 12:38 .
drwxr-xr-x 26 qsys    0 8192 Aug  5 10:09 ..
-rw-r--r--  1 ladwein 0   63 May 26 12:21 get_stat00j9xx.sql
drwxr-xr-x  2 ladwein 0 8192 Jun  9 12:38 .cache
`,
        stderr: "",
      };
    }
    return { code: 1, stdout: "", stderr: `unexpected command: ${cmd}` };
  });
}

/** Member-focused mock with controllable remote size and optional cat body. */
export function memberMock(opts: {
  sourceBytes?: number;
  exportBytes?: number;
  content?: string;
  failSourceProbe?: boolean;
  /** Fail only the post-CPYTOSTMF size probe (source probe still succeeds). */
  failExportProbe?: boolean;
}): SshRunner {
  const content = opts.content ?? SAMPLE_MEMBER_CONTENT;
  const sourceBytes = opts.sourceBytes ?? content.length;
  const exportBytes = opts.exportBytes ?? sourceBytes;
  let copied = false;

  return mockRunner((cmd) => {
    if (cmd.includes("CPYTOSTMF")) {
      copied = true;
      return { code: 0, stdout: "CPCA082: Objekt kopiert.\n", stderr: "" };
    }
    if (cmd.includes("ls -ln ") || /(^|\|\s*)ls -l /.test(cmd)) {
      if (opts.failSourceProbe && !copied) {
        return { code: 1, stdout: "", stderr: "not found" };
      }
      if (opts.failExportProbe && copied) {
        return { code: 1, stdout: "", stderr: "export missing" };
      }
      const bytes = copied ? exportBytes : sourceBytes;
      return { code: 0, stdout: lsSizeLine(bytes), stderr: "" };
    }
    if (cmd.includes("wc -c")) {
      if (opts.failSourceProbe && !copied) {
        return { code: 1, stdout: "", stderr: "not found" };
      }
      if (opts.failExportProbe && copied) {
        return { code: 1, stdout: "", stderr: "export missing" };
      }
      const bytes = copied ? exportBytes : sourceBytes;
      return { code: 0, stdout: `${bytes}\n`, stderr: "" };
    }
    if (cmd.startsWith("cat ")) {
      return { code: 0, stdout: content, stderr: "" };
    }
    if (cmd.startsWith("rm -f")) {
      return { code: 0, stdout: "", stderr: "" };
    }
    return { code: 1, stdout: "", stderr: `unexpected command: ${cmd}` };
  });
}
