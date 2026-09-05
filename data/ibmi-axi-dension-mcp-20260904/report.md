# ibmi-axi Phase 1+2 Report: DENSION Cleanup + MCP Mapping Analysis

**Branch:** fm/ibmi-axi-dension-mcp-20260904  
**Commit:** a722599 (Phase 1)  
**Status:** Phase 1 complete + committed; Phase 2 report delivered; awaiting Captain decision on mapping before any further changes.

---

## Phase 1: DENSION-Bereinigung (completed, independent, fully done)

**Ziel:** Repo vollständig frei von DENSION-/betriebsspezifischen Referenzen (Kundennamen, Bibliotheken, Pfade, Betriebsregeln). Ersetzungen:
- DENSION → MYLIB (Library/Owner)
- AERA01 → MYOBJ (Object/Member)
- DENSION/AERA01 → MYLIB/MYOBJ
- DENSION/QS36SRC AERA01 → MYLIB/QS36SRC MYOBJ
- /home/LADWEIN → /home/USER
- DENSION.LIB → MYLIB.LIB
- DENSION policy / DENSION write rules / DENSION write/deploy policy → neutral "operator policy" / "write rules" (Entfernung echter DENSION-Regeln/Bibliotheksstrukturen aus Skill-Texten und Verweisen; as400-ibm-i bleibt als generischer Skill-Verweis erhalten)

**Fundstellen vor der Bereinigung (vollständige Suche über README, CLAUDE.md→AGENTS.md, AGENTS.md, src/, bin/, scripts/, test/, skills/, Kommentare, Fixtures, Beispiel-Configs):**

Datei | Fundstellen
------|-------------
AGENTS.md | 1× "DENSION write/deploy policy stays in skill `as400-ibm-i`"
README.md | 7× (Beispiele DENSION/AERA01, DENSION/QS36SRC, /home/LADWEIN; "DENSION write rules")
skills/ibmi-axi/SKILL.md | 4× (DENSION policy, Beispiele mit DENSION/AERA01 + /home/LADWEIN)
src/skill-content.ts | 4× (gleiche wie SKILL.md, als Source)
src/help.ts | 10× (Beispiele in doctor/home/obj/member/ifs Help-Texten inkl. /QSYS.LIB/DENSION.LIB)
src/parse.ts | 2× (Error-Message-Beispiel DENSION/AERA01; assertSafePath /home/LADWEIN)
src/commands/obj.ts | 1× (Error-Message DENSION/AERA01)
src/commands/member.ts | 1× (Error-Message DENSION/QS36SRC AERA01)
src/commands/ifs.ts | 2× (Error-Message /home/LADWEIN)
test/cli.test.ts | 15+× (Test-Calls, Mock-Daten, expect-Matches, inline secretObj-Tabelle mit AERA01/DENSION, ifs /home/LADWEIN)
test/helpers.ts | 2× (SAMPLE_OBJECT AERA01/DENSION; ifs-ls Mock mit ladwein-User)
test/parse.test.ts | 8× (parseLibObj dension/aera01, parseMemberTarget DENSION/AERA01, expects AERA01/DENSION, inline Tabelle AERA01)

**Änderungen:**
- 12 Dateien editiert (AGENTS.md, README.md, skills/ibmi-axi/SKILL.md, src/*, test/*)
- Policy-Texte neutralisiert (keine DENSION-spezifischen Betriebsvorgaben mehr)
- Mock-Tabellen-Daten für korrekte Fixed-Width-Parsing (parseDb2Table) angepasst (Spalten-Alignment)
- Alle Ersetzungen herstellerneutral (MYLIB/MYOBJ/USER als generische Beispiele)
- Nachher: `git grep -i 'dension\|LADWEIN\|AERA01'` → nur noch .git/worktree-Pfad (ignoriert)

**Validierung:**
- `npm test` → 42/42 Tests grün
- `npm run skill:check` → "skill ok"
- Commit auf Feature-Branch (kein main, kein Force-Push)

**Ergebnis Phase 1:** Repo DENSION-frei. Keine Kundennamen/-bibliotheken/-pfade/-betriebsregeln mehr. Phase 1 unabhängig und vollständig.

---

## Phase 2: Analyse & Mapping (read-only, Report vor jedem Code-Umbau)

**Ziel:** Für jede Operation Kategorisierung A/B/C. A = sauber als SQL-Tool über IBM-i-MCP (Mapepire/Port 8076, Db2 Services). B = nicht sinnvoll SQL → bleibt SSH. C = unklar → Captain fragen.

**Analyse-Methode:** Code-Review der Commands (src/commands/*.ts), verwendete SQL-Statements (QSYS2.*), SSH-only Features (CPYTOSTMF, ls, local hooks). Keine Code-Änderungen, nur Analyse.

**Mapping-Tabelle:**

| Operation          | Kategorie | geplante Umsetzung                          | (bei A: konkretes Db2-Service/SQL) |
|--------------------|-----------|---------------------------------------------|------------------------------------|
| doctor (Systemcheck) | A      | SQL via MCP (ENV_SYS_INFO + Readiness); SSH-Ping hybrid oder transport-spezifisch | SYSIBMADM.ENV_SYS_INFO (OS_VERSION etc.); ggf. weitere SYSTEM_* für Full-Check |
| asp                | A        | SQL via MCP                                | QSYS2.ASP_INFO |
| cpu                | A        | SQL via MCP                                | QSYS2.SYSTEM_ACTIVITY_INFO + QSYS2.SYSTEM_STATUS_INFO (+ QSYS2.ACTIVE_JOB_INFO für --jobs) |
| msgw               | A        | SQL via MCP                                | QSYS2.MESSAGE_QUEUE_INFO (inquiry filter) + QSYS2.ACTIVE_JOB_INFO (MSGW jobs) |
| obj show           | A        | SQL via MCP                                | QSYS2.OBJECT_STATISTICS(LIB, TYPE, OBJ) |
| joblog             | A        | SQL via MCP                                | QSYS2.JOBLOG_INFO |
| spool              | A        | SQL via MCP                                | QSYS2.OUTPUT_QUEUE_ENTRIES_BASIC |
| member read        | B        | bleibt SSH (CPYTOSTMF + cat + Size-Guard + --allow-large) | n/a (kein reines SQL-Äquivalent für Source-Members mit TOON/Size-Guard) |
| ifs ls             | B        | bleibt SSH (ls -la bounded)                | n/a |
| setup hooks        | B        | local-only (Claude Code etc. Hooks)        | n/a |
| skill generate/check | B      | local-only (generiert SKILL.md)            | n/a |
| home (default)     | B        | local help text                            | n/a |

**Keine Kategorie C (unklar) identifiziert.** Alle Operationen sind entweder:
- Klar A (bereits SQL-basiert via Db2 Services in QSYS2/SYSIBMADM; direkt mappbar zu MCP YAML-SQL-Tools)
- Klar B (SSH-spezifisch: Member-Export via CPYTOSTMF, IFS-Shell, lokale Setup/Skill-Generierung)

**Hinweise zu A-Umsetzung (für Phase 3 nach Freigabe):**
- MCP-Transport: offizieller MCP TypeScript Client → Mapepire WebSocket (DB2i_HOST/USER/PASS/PORT=8076)
- Auth: eigene DB2i_* Env-Vars (getrennt von SSH-Env IBMI_AXI_HOST etc.)
- Wahl: `--transport ssh|mcp` oder `IBMI_AXI_TRANSPORT=mcp`
- Safety: Read-only MVP, Size-Guard 1MiB für member (B nur), TOON-Output unverändert, keine Credentials in Output (redact.ts bleibt)
- Für A: beide Backends unterstützen; für B bei mcp: freundliche Fehlermeldung "not supported over MCP, use --transport ssh"

**Deliverable Phase 2:** Diese Tabelle + Scout-Report hier in `data/ibmi-axi-dension-mcp-20260904/report.md`. Kein Interface/MCP-Client-Code, kein Backend-Umbau vor Captain-Freigabe.

---

## Nächste Schritte (warten auf Captain)

**blocked: needs-decision[phase2-mapping]**

Bitte Captain um explizite Freigabe der Phase-2-Mapping-Tabelle (Kategorien A/B, geplante SQLs, keine C). 
- Bei OK: starte Phase 3 (Transport-Abstraktion, mcp Backend via MCP Client, Env, Safety)
- Bei Änderungswünschen: Feedback, dann adjust report + resume
- Phase 3–4 erst nach Freigabe; no-mistakes + PR erst nach validierter Phase 1+2

**Definition of done bis hier:** Phase 1 committed + DENSION-frei (erreicht); Phase 1 Report; Phase 2 Tabelle geliefert + blocked/needs-decision für Captain-Freigabe. Kein Merge, Feature-Branch only.

Report generated as Scout for Captain review.