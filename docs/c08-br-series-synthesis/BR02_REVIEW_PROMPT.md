# BR02 unabhängiger Reviewauftrag

## Rolle

Du bist der unabhängige Reviewer für BR02. Arbeite read-only, führe Prüfungen aus, ändere aber keine Repositorydatei. Du mergst nicht und startest BR03 nicht.

## Exakte Vergleichsgrenze

- Basis: `<ACCEPTED_BR01_INTEGRATION_SHA>`
- Kandidatenbranch: `origin/agent/br-02-in-browser-telemetry`
- Kandidaten-SHA: `<BR02_CANDIDATE_SHA>`

Beide Platzhalter müssen vor dem Review konkrete 40-stellige SHAs sein. Nach Fetch belegen:

1. `origin/integration/voxel-kernel-lab-v1` steht exakt auf dem BR01-Basis-SHA.
2. Der Kandidatenbranch steht exakt auf dem Kandidaten-SHA.
3. Merge-Base und erster BR02-Parent sind exakt der BR01-Basis-SHA.
4. Der Worktree ist sauber.

Abweichung: `REJECT`, keine Reparatur.

## Autoritative Prüfbasis

- `BR_SERIES_CONTRACT.md`
- `BR02_IMPLEMENTATION_PROMPT.md`
- akzeptierte BR01-Verträge und Register
- BR02 In-Browser Telemetrie Abschlussbericht
- aktuelle Project Memory, Decision Log, Instructions und Research Register
- `AGENTS.md`

## Pflichtaudit

Prüfe Basis..Kandidat vollständig:

- Änderungen nur im erlaubten BR02-Umfang;
- keine Dependency- oder Lockfile-Änderung;
- keine Änderung eines BR01-Vertrags, Registers oder Schemas;
- `TelemetryExportV1` verwendet die gemeinsame BR01-Availability-/Capability-Union;
- genau ein Adapter, keine zweite Mappingtabelle;
- Adapter importiert BR01-Zieltypen und Register und importiert BR03 nicht;
- kanonische `ingestSequence` und byteidentische Wiederholung;
- keine Aggregation, Rundung, Null-Sentinelwerte oder stille Fehlerkorrektur;
- Hierarchie- und Orchestrierungs-IDs werden nur übernommen;
- Instrumentierung ändert keine Produkt-, Render-, Meshing-, AO- oder Palettensemantik;
- keine Statistik, kein Gate, kein WP05 oder G18;
- WP04-Timings nicht als Benchmarkwerte übernommen.

## Pflichtprüfungen

1. `npm ci`
2. fokussierte Telemetrie- und Adaptertests
3. vollständiges `npm test`
4. `npm run build`
5. reguläres `npm run test:e2e`
6. gezielte Browser-Degradations- und Exportfälle
7. Schutzbereich-Digestvergleich, Dependency- und Diff-Audit

Führe keine Evidence-Skripte und keinen realen Performancebenchmark aus. Nicht verfügbare Browser-APIs müssen zu korrekten Availability-Zuständen führen, nicht zu ausgelassenen Feldern oder erfundenem Support.

Prüfe ausdrücklich die positiven und negativen Fälle des Implementierungsauftrags, darunter Uhr-/Sequenzfehler, Bufferüberlauf, API-Ausnahme, unbekannte Metrikquelle, falsche Einheit, Registerdigest-Mismatch, ID-Manipulation und wiederholte Byteidentität.

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
- `REJECT`: falsche Basis, Scopebruch, Schutzbereich-Drift, Schattenvertrag oder grundlegende Architekturverletzung.

Bei `FIX_REQUIRED` geht die Arbeit an denselben Implementierer auf demselben Branch. Nach Fix-Push wird der vollständige Review gegen dieselbe Basis und den neuen Kandidaten-SHA wiederholt. Der Reviewer repariert und mergt nicht und startet BR03 nicht.

Der Abschlussbericht enthält Basis, Kandidat, Parent, vollständige Befunde, Befehle und Zählungen, Browser-/Capability-Nachweise, Dependency-Status, Schutzbereich-Digests, Evidence-Hygiene und das einzelne Urteil. Danach stop.
