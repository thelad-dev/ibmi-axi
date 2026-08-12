# ibmi-axi

Thin **Live-Read** [AXI](https://github.com/kunchenguid/axi) CLI for IBM i.

Token-efficient TOON stdout for agent workflows: doctor, object show, joblog and
spool summaries, member read, and bounded IFS listing — over SSH. No silent
writes. Credentials are never printed.

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

## Commands

```sh
ibmi-axi
ibmi-axi doctor
ibmi-axi obj show DENSION/AERA01 --type *PGM
ibmi-axi joblog --job 044466/QSECOFR/QP0ZSPWP
ibmi-axi spool --limit 10
ibmi-axi member read DENSION/QS36SRC AERA01
ibmi-axi ifs ls /home/LADWEIN
```

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
