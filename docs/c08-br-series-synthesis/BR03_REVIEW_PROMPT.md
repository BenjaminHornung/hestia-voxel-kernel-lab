# BR03 unabhängiger Reviewauftrag

## Rolle

Du bist der unabhängige Reviewer für BR03. Arbeite read-only. Führe Prüfungen aus, ändere aber keine Repositorydatei. Du mergst nicht und startest BR04 nicht.

## Exakte Vergleichsgrenze

- Basis: `<ACCEPTED_BR02_INTEGRATION_SHA>`
- Kandidatenbranch: `origin/agent/br-03-playwright-cdp-runner`
- Kandidaten-SHA: `<BR03_CANDIDATE_SHA>`

Beide Platzhalter müssen konkrete 40-stellige SHAs sein. Nach Fetch belegen:

1. `origin/integration/voxel-kernel-lab-v1` steht exakt auf dem BR02-Basis-SHA.
2. Der Kandidatenbranch steht exakt auf dem Kandidaten-SHA.
3. Merge-Base und erster BR03-Parent sind exakt die Basis.
4. Der Worktree ist sauber.

Abweichung: `REJECT`, keine Reparatur.

## Autoritative Prüfbasis

- `BR_SERIES_CONTRACT.md`
- `BR03_IMPLEMENTATION_PROMPT.md`
- akzeptierte BR01- und BR02-Integrationen
- BR03 Playwright/CDP Runner Abschlussbericht
- C07 Hardware Profiles H1-H3 Calibration Plan
- aktuelle Project Memory, Decision Log, Instructions und Research Register
- `AGENTS.md`

## Pflichtaudit

Prüfe den vollständigen Diff Basis..Kandidat:

- nur erlaubte Runner-, Test-, Dokument- und Scriptbereiche;
- keine Dependency- oder Lockfile-Änderung;
- keine Kopie oder Änderung von BR01- oder BR02-Verträgen;
- konkrete Orchestrierungs-IDs ausschließlich in BR03 erzeugt;
- deterministische IDs und Pläne, keine PID-/Timestamp-Zufälligkeit;
- exakte Hierarchie und explizite Paarung;
- frischer Browserprozess und frisches Profil pro unabhängiger Prozesseinheit;
- getrennte Prozesscontainer und Samplephasen;
- Warmup vor Measurement und Registerregel für Stabilität;
- Mindestwerte 3 technisch, 5 Standard, 30 Measurement-Iterationen und 10 Cold-Prozesse korrekt getrennt;
- CDP- und Environmentdaten nutzen die BR01-Availability-Union;
- BR02-Adapter wird unverändert genutzt;
- Quittung nur nach erfolgreicher BR01-Validierung;
- keine Aggregation, kein Gateurteil, kein WP05/G18;
- WP04-Diagnosezeiten nicht als Laufplan- oder Benchmarkwert genutzt.

## Pflichtprüfungen

1. `npm ci`
2. fokussierte Runner-, Plan-, ID- und Quittungstests
3. vollständiges `npm test`
4. `npm run build`
5. kontrollierte synthetische Runner-Integration
6. reguläres `npm run test:e2e`
7. synthetischer Verify-Pfad, falls vorhanden
8. Schutzbereich-Digestvergleich, Dependency- und Diff-Audit

Führe kein Evidence-Skript und keinen realen Performancebenchmark aus. Prüfe positive und negative Fälle des Implementierungsauftrags, besonders 2/3/4/5-Prozess-Klassifikation, 30-Iterations-Regel, Cold-Prozessfrische, ID-Kollisionen, Paarungsfehler, Phasenfehler, CDP-Degradation, Adapterkontext und Quittungsfehler.

## Unveränderliche Schutzbereiche

Vergleiche Dateiliste und SHA-256-Digests für:

- `tests/contracts/wp02FixtureGolden.ts`
- `tests/contracts/wp03GreedyGolden.ts`
- `tests/contracts/wp04AoGolden.ts`
- `evidence/wp01/**` bis `evidence/wp04/**`

Jede Abweichung ist `P0` und führt zu `REJECT`.

## Befundformat und Urteil

Jeder Befund nennt Schweregrad `P0`, `P1` oder `P2`, Datei/Symbol, Reproduktion, verletzte Vertragsstelle, kleinste Korrektur und Regressionstest.

Gib genau eines aus:

- `ACCEPT`: keine offenen P0/P1, alle Pflichtgates und Schutzprüfungen erfolgreich;
- `FIX_REQUIRED`: behebbarer P1 oder relevanter P2 mit präziser Fixliste;
- `REJECT`: falsche Basis, Scopebruch, Schutzbereich-Drift, Schattenvertrag oder grundlegende Orchestrierungsverletzung.

Bei `FIX_REQUIRED` geht die Arbeit an denselben Implementierer auf demselben Branch. Nach Fix-Push wird der vollständige Review gegen dieselbe Basis und den neuen Kandidaten-SHA wiederholt. Reviewer repariert und mergt nicht und startet BR04 nicht.

Der Abschlussbericht enthält Basis, Kandidat, Parent, vollständige Befunde, Befehle und Zählungen, Plan-/ID-/Prozessnachweise, Dependency-Status, Schutzbereich-Digests, Evidence-Hygiene und das einzelne Urteil. Danach stop.
