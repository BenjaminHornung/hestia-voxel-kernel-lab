# BR04 unabhängiger Reviewauftrag

## Rolle

Du bist der unabhängige Reviewer für BR04. Arbeite read-only. Führe Prüfungen aus, ändere aber keine Repositorydatei. Du mergst nicht und startest WP05 nicht.

## Exakte Vergleichsgrenze

- Basis: `<ACCEPTED_BR03_INTEGRATION_SHA>`
- Kandidatenbranch: `origin/agent/br-04-benchmark-aggregator`
- Kandidaten-SHA: `<BR04_CANDIDATE_SHA>`

Beide Platzhalter müssen konkrete 40-stellige SHAs sein. Nach Fetch belegen:

1. `origin/integration/voxel-kernel-lab-v1` steht exakt auf dem BR03-Basis-SHA.
2. Der Kandidatenbranch steht exakt auf dem Kandidaten-SHA.
3. Merge-Base und erster BR04-Parent sind exakt die Basis.
4. Der Worktree ist sauber.

Abweichung: `REJECT`, keine Reparatur.

## Autoritative Prüfbasis

- `BR_SERIES_CONTRACT.md`
- `BR04_IMPLEMENTATION_PROMPT.md`
- akzeptierte BR01-, BR02- und BR03-Integrationen
- BR04 Benchmark Aggregator Abschlussbericht
- Benchmark Test Methodology Audit Report
- aktuelle Project Memory, Decision Log, Instructions und Research Register
- `AGENTS.md`

## Pflichtaudit

Prüfe den vollständigen Diff Basis..Kandidat:

- nur erlaubte Aggregator-, Report-, Fixture-, Dokument- und Scriptbereiche;
- keine Dependency- oder Lockfile-Änderung;
- kein lokales Metrikregister und kein Schattenvertrag;
- BR01-Register und -Quittung werden direkt importiert;
- nur quittierte, passende Runs werden angenommen;
- exakte Hierarchie, keine Rekonstruktion oder Reparatur;
- Bootstrap auf unabhängiger Prozessebene;
- Paarung nur über explizite Pair-IDs und Ordinalwerte;
- Klassifikation 3 technisch, 5 Standard, 30 Measurement-Iterationen und Cold 10 korrekt;
- Warmup ausgeschlossen;
- deterministische Statistik, Sortierung, Rundung und Serialisierung;
- Effektband nur pro Metrik aus BR01 oder `null`;
- kein globaler 10-Prozent-Default;
- `decision: null`, keine Gate-, Winner-, Regression- oder Akzeptanzlogik;
- kein WP05, G18 oder Produktumfang;
- WP04-Diagnosezeiten nicht als Aggregatorwert übernommen.

## Pflichtprüfungen

1. `npm ci`
2. fokussierte Aggregator- und Golden-Tests
3. vollständiges `npm test`
4. `npm run build`
5. deterministischer Verify-Lauf mit synthetischen Fixtures
6. Schutzbereich-Digestvergleich, Dependency- und Diff-Audit

Browser-E2E ist `NOT_APPLICABLE_BR04_PURE_AGGREGATION`, sofern die aktuelle Repository-Regel keinen regulären Smoke-Test verlangt. Falls verlangt, führe nur `npm run test:e2e` aus. Keine Evidence-Skripte und keine realen Benchmarks.

Prüfe ausdrücklich die positiven und negativen Fälle des Implementierungsauftrags, insbesondere Eingabereihenfolge, Quittungsmismatch, Hierarchiefehler, 2/3/4/5-Prozess-Fälle, 30-Iterations-Regel, Cold 10, Clusterpseudoreplikation, Paarungsheuristik, Warmup-Leak, `null`-Effektband und verbotene Entscheidungen.

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
- `REJECT`: falsche Basis, Scopebruch, Schutzbereich-Drift, Schattenvertrag, Gate-Logik oder grundlegende Statistikverletzung.

Bei `FIX_REQUIRED` geht die Arbeit an denselben Implementierer auf demselben Branch. Nach Fix-Push wird der vollständige Review gegen dieselbe Basis und den neuen Kandidaten-SHA wiederholt. Reviewer repariert und mergt nicht und startet WP05 nicht.

Der Abschlussbericht enthält Basis, Kandidat, Parent, vollständige Befunde, Befehle und Zählungen, Determinismus-/Statistik-/Population-/Pairing-Nachweise, Dependency-Status, Schutzbereich-Digests, Evidence-Hygiene und das einzelne Urteil. Danach stop.
