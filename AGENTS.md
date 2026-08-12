# Project agent memory

This file is the project's committed home for project-intrinsic agent knowledge: build, test, release, architecture, and sharp-edge notes that should travel with the code.

## What this is

Thin **Live-Read** AXI CLI for IBM i over SSH. Docs stay in MCP-IBMiDocs; DENSION write/deploy policy stays in skill `as400-ibm-i`. Bob is out of scope.

## Commands

```sh
npm install
npm test
npm run build
npm run skill:check
node dist/bin/ibmi-axi.js doctor
```

Default research host: SSH alias `as400` (override `--host` / `IBMI_AXI_HOST`).

## Architecture

- Entry: `bin/ibmi-axi.ts` → `src/cli.ts` (`axi-sdk-js` `runAxiCli`)
- Remote I/O: `src/ssh.ts` + injectable `SshRunner` (tests mock this; never hit a host in CI)
- SQL via PASE `qsh`/`db2` (`buildDb2Remote` in `src/parse.ts`); member read via `CPYTOSTMF`
- Skill body is generated from `src/skill-content.ts` — keep `skills/ibmi-axi/SKILL.md` in sync (`npm run skill:check`)

## Safety

- Read-only MVP. No silent writes. Credentials must never appear in stdout (see `src/redact.ts`).
- `member read` hard-caps export size (`MAX_MEMBER_BYTES` in `src/config.ts`); override only with `--allow-large`.
- SSH uses `StrictHostKeyChecking=accept-new` (TOFU) — pin host keys for production (see README).
- Future mutations need explicit `--confirm` plus operator write-gate policy.

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
