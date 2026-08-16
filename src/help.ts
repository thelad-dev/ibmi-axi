import { MAX_MEMBER_BYTES, MAX_MEMBER_PREVIEW } from "./config.js";

export const DESCRIPTION =
  "Thin Live-Read AXI for IBM i — ASP/CPU/MSGW, objects, joblogs, spools, members, and IFS over SSH";

export const TOP_LEVEL_HELP = `usage: ibmi-axi [command] [args] [flags]
description: ${DESCRIPTION}
commands[12]:
  (none)=home, doctor, asp, cpu, msgw, obj, joblog, spool, member, ifs, setup, skill
global_flags[3]:
  --host <ssh-host> (default as400 or IBMI_AXI_HOST), --help, -v/-V/--version
notes[4]:
  Read-only by default. No silent writes. Future mutations require explicit --confirm.
  Credentials are never printed; SSH uses your local OpenSSH keys/agent.
  SSH uses StrictHostKeyChecking=accept-new (TOFU); pin host keys in known_hosts for production.
  Portable: point --host at any IBM i with SSH + PASE.
examples:
  ibmi-axi
  ibmi-axi doctor
  ibmi-axi asp
  ibmi-axi cpu
  ibmi-axi msgw
  ibmi-axi obj show DENSION/AERA01 --type *PGM
  ibmi-axi joblog --job 044466/QSECOFR/QP0ZSPWP
  ibmi-axi spool --limit 10
  ibmi-axi member read DENSION/QS36SRC AERA01
  ibmi-axi ifs ls /home/LADWEIN
`;

export const COMMAND_HELP: Record<string, string> = {
  doctor: `usage: ibmi-axi doctor [--host <ssh-host>]
description: Check SSH reachability, OS level, and read-path readiness (no secrets)
flags[1]: --host <ssh-host>
examples:
  ibmi-axi doctor
  ibmi-axi doctor --host as400
`,
  asp: `usage: ibmi-axi asp [--host <ssh-host>]
description: ASP capacity overview (number, type, state, MB used/available, used %, threshold)
flags[1]: --host <ssh-host>
notes[1]:
  Capacities are megabytes from QSYS2.ASP_INFO; used_pct is derived (capacity - available).
examples:
  ibmi-axi asp
  ibmi-axi asp --host as400
`,
  cpu: `usage: ibmi-axi cpu [--jobs <n>] [--host <ssh-host>]
description: Live CPU utilization (SYSTEM_ACTIVITY_INFO) plus partition status metrics
flags[2]: --jobs <n> (default 0; top jobs by CPU_TIME ms via ACTIVE_JOB_INFO), --host <ssh-host>
notes[2]:
  Percent fields are labeled in output units. --jobs > 0 adds a slower ACTIVE_JOB_INFO pass.
  Does not reset statistics (read-only).
examples:
  ibmi-axi cpu
  ibmi-axi cpu --jobs 5
`,
  msgw: `usage: ibmi-axi msgw [--filter <inquiry|all>] [--limit <n>] [--full] [--host <ssh-host>]
description: QSYSOPR messages with MSGW focus — inquiry (wait-for-reply) plus jobs in MSGW status
flags[4]: --filter <inquiry|all> (default inquiry), --limit <n> (default 20, max 500), --full, --host <ssh-host>
notes[2]:
  Read-only: does not reply to inquiry messages. message key is HEX(MESSAGE_KEY) for identification.
  Also lists active jobs with JOB_STATUS=MSGW (may be empty while inquiries remain).
examples:
  ibmi-axi msgw
  ibmi-axi msgw --filter all --limit 20
  ibmi-axi msgw --full
`,
  obj: `usage: ibmi-axi obj show <LIB/OBJ> [--type <*PGM|*FILE|*ALL|...>] [--host <ssh-host>]
description: Show IBM i object attributes via OBJECT_STATISTICS (read-only)
subcommands[1]: show
flags[2]: --type <objtype> (default *ALL), --host <ssh-host>
examples:
  ibmi-axi obj show DENSION/AERA01 --type *PGM
  ibmi-axi obj show QGPL/QDFTJOBD --type *JOBD
`,
  joblog: `usage: ibmi-axi joblog [--job <NUMBER/USER/NAME>] [--limit <n>] [--full] [--host <ssh-host>]
description: Summarize job log messages (defaults to current SSH job when --job omitted)
flags[4]: --job <name>, --limit <n> (default 30, max 500), --full, --host <ssh-host>
examples:
  ibmi-axi joblog
  ibmi-axi joblog --job 044466/QSECOFR/QP0ZSPWP --limit 50
`,
  spool: `usage: ibmi-axi spool [--user <name>] [--limit <n>] [--host <ssh-host>]
description: Recent spooled file summary from OUTPUT_QUEUE_ENTRIES_BASIC
flags[3]: --user <name>, --limit <n> (default 20, max 500), --host <ssh-host>
examples:
  ibmi-axi spool --limit 10
  ibmi-axi spool --user QSECOFR
`,
  member: `usage: ibmi-axi member read <LIB/FILE> <MBR> [--full] [--limit <chars>] [--allow-large] [--host <ssh-host>]
description: Read a source/data member via CPYTOSTMF (read-only, truncated by default)
subcommands[1]: read
flags[4]: --full, --limit <chars> (default 1500, max ${MAX_MEMBER_PREVIEW}), --allow-large (override ${MAX_MEMBER_BYTES}-byte export cap; risk: large SSH/temp/agent payload), --host <ssh-host>
notes[2]:
  Hard max export size is ${MAX_MEMBER_BYTES} bytes unless --allow-large is set.
  Size is probed (ls/wc) before CPYTOSTMF and before cat; oversized or undetermined sizes are refused.
examples:
  ibmi-axi member read DENSION/QS36SRC AERA01
  ibmi-axi member read DENSION/QS36SRC AERA01 --full
  ibmi-axi member read DENSION/QS36SRC AERA01 --full --allow-large
`,
  ifs: `usage: ibmi-axi ifs ls <path> [--limit <n>] [--host <ssh-host>]
description: Bounded IFS directory listing (read-only, no recursion by default)
subcommands[1]: ls
flags[2]: --limit <n> (default 100, max 500), --host <ssh-host>
examples:
  ibmi-axi ifs ls /home/LADWEIN
  ibmi-axi ifs ls /QSYS.LIB/DENSION.LIB --limit 50
`,
  setup: `usage: ibmi-axi setup hooks
description: Install session-start hooks for Claude Code, Codex, and OpenCode (explicit opt-in)
examples:
  ibmi-axi setup hooks
`,
  skill: `usage: ibmi-axi skill generate [--output <path>] [--check]
description: Generate or verify the installable Agent Skill document
flags[2]: --output <path>, --check
examples:
  ibmi-axi skill generate
  ibmi-axi skill generate --check
`,
};
