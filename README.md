# ibmi-axi

Thin **Live-Read** [AXI](https://github.com/kunchenguid/axi) CLI for IBM i.

Token-efficient TOON stdout for agent workflows: doctor, ASP/CPU/MSGW live reads,
object show, joblog and spool summaries, member read, and bounded IFS listing —
over SSH. No silent writes. Credentials are never printed.

## Install

```sh
npm install -g ibmi-axi
# or
npx -y ibmi-axi doctor
```

Skill (on-demand agent guidance):

```sh
npx skills add thelad-dev/ibmi-axi --skill ibmi-axi
```

Session hooks (explicit opt-in):

```sh
ibmi-axi setup hooks
```

## Host configuration

| Source | Value |
|--------|--------|
| Default | SSH host alias `as400` |
| Flag | `--host <ssh-host>` after the command |
| Env | `IBMI_AXI_HOST`, optional `IBMI_AXI_SSH`, `IBMI_AXI_CONNECT_TIMEOUT` |

Uses your local OpenSSH config and keys. Portable: any shop can point at their
IBM i SSH endpoint.

SSH sessions run with `BatchMode=yes` and `StrictHostKeyChecking=accept-new`
(trust-on-first-use: unknown host keys are accepted and stored). For production,
pin the IBM i host key in `~/.ssh/known_hosts` ahead of time.

## Commands

```sh
ibmi-axi
ibmi-axi doctor
ibmi-axi asp
ibmi-axi cpu
ibmi-axi cpu --jobs 5
ibmi-axi msgw
ibmi-axi obj show DENSION/AERA01 --type *PGM
ibmi-axi joblog --job 044466/QSECOFR/QP0ZSPWP
ibmi-axi spool --limit 10
ibmi-axi member read DENSION/QS36SRC AERA01
ibmi-axi member read DENSION/QS36SRC AERA01 --full
ibmi-axi member read DENSION/QS36SRC AERA01 --full --allow-large
ibmi-axi ifs ls /home/LADWEIN
```

Optional live smoke (requires SSH alias / `--host`): `ibmi-axi asp`, `ibmi-axi cpu`,
`ibmi-axi msgw` against a reachable IBM i. CI uses mocked SSH only.

### Member size guard

`member read` probes remote size (`ls` / `wc`) **before** `CPYTOSTMF` and again
before `cat`. Exports above **1 048 576 bytes** (1 MiB), or members whose size
cannot be determined, are refused unless you pass **`--allow-large`**.

`--allow-large` is an explicit override: it can pull multi‑MB source over SSH
into `/tmp` on the host and into the agent context. Use only when you accept
that cost/risk.

MVP is **read-only**. Future mutations will require an explicit `--confirm` flag
and remain gated by operator policy (see skill `as400-ibm-i` for DENSION write
rules). This CLI does not replace MCP-IBMiDocs (documentation) or Bob.

## Development

```sh
npm install
npm test
npm run build
npm run skill:check
```

Tests mock the SSH runner — no live host required for CI.

## License

MIT
