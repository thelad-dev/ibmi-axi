/** Static skill body — single source of truth for `skill generate` and committed SKILL.md. */
export function skillMarkdown(): string {
  return `---
name: ibmi-axi
description: >
  Live-read IBM i (AS/400) operations through the ibmi-axi CLI — doctor, ASP/CPU/MSGW,
  object show, joblog/spool summary, member read, and bounded IFS listing with TOON
  output. Use whenever a task needs live host reads over SSH without silent writes.
---

# ibmi-axi

Thin Live-Read AXI for IBM i. Prefer this over ad-hoc \`ssh as400\` + \`system\` for
recurring read ops. Docs search stays with MCP-IBMiDocs / \`ibmi-docs\`; narrative
DENSION policy stays in skill \`as400-ibm-i\`. Bob is out of scope.

You do not need a global install — invoke with \`npx -y ibmi-axi <command>\`.
If output suggests a follow-up starting with \`ibmi-axi\`, run it as \`npx -y ibmi-axi ...\`.

## When to use

- Probe host readiness: \`doctor\`
- ASP capacity / used %: \`asp\`
- Live CPU utilization: \`cpu\` (optional \`--jobs\` for top CPU_TIME)
- QSYSOPR MSGW / inquiry wait: \`msgw\` (read-only; no reply)
- Object attributes: \`obj show LIB/OBJ --type *PGM\`
- Job log / spool summaries
- Source member reads
- Bounded IFS listings

## Workflow

1. \`npx -y ibmi-axi doctor\` — SSH + SQL readiness (never prints credentials).
2. Read with \`asp\`, \`cpu\`, \`msgw\`, \`obj show\`, \`joblog\`, \`spool\`, \`member read\`, \`ifs ls\`.
3. Default host is SSH alias \`as400\` (override with \`--host\` or \`IBMI_AXI_HOST\`).
4. **No silent writes.** MVP is read-only. Any future mutation requires explicit \`--confirm\` plus captain/write-gate policy from \`as400-ibm-i\`.

## Commands

\`\`\`
commands[11]:
  (none)=home, doctor, asp, cpu, msgw, obj show, joblog, spool, member read, ifs ls, setup hooks
\`\`\`

Examples:

\`\`\`sh
npx -y ibmi-axi
npx -y ibmi-axi doctor
npx -y ibmi-axi asp
npx -y ibmi-axi cpu
npx -y ibmi-axi cpu --jobs 5
npx -y ibmi-axi msgw
npx -y ibmi-axi obj show DENSION/AERA01 --type *PGM
npx -y ibmi-axi joblog --job 044466/QSECOFR/QP0ZSPWP
npx -y ibmi-axi spool --limit 10
npx -y ibmi-axi member read DENSION/QS36SRC AERA01
npx -y ibmi-axi ifs ls /home/LADWEIN
\`\`\`

## Tips

- Output is TOON and token-efficient; long member/joblog/msgw text is truncated — use \`--full\`.
- \`msgw\` defaults to inquiry messages waiting for reply; it never replies. Use \`--filter all\` for recent QSYSOPR traffic.
- Member export is capped (1 MiB) with a remote size guard before \`CPYTOSTMF\`/cat. Oversized members, or members whose size cannot be determined, are refused unless you pass \`--allow-large\` (risk: large SSH/temp/agent payload).
- SSH uses \`StrictHostKeyChecking=accept-new\` (TOFU on first connect). Pin host keys in \`~/.ssh/known_hosts\` for production trusts.
- Never scrape credential DBs; SSH keys/agent only.
- Portable: any shop can point \`--host\` at their IBM i SSH endpoint.
- Compile/deploy/5250/Bob remain outside this CLI (see \`as400-ibm-i\`).
`;
}
