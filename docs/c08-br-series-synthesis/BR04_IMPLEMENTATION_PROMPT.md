# BR04 Implementierungsauftrag: Deterministischer Benchmark-Aggregator

## Rolle und Stop-Regel

Du bist der alleinige Implementierer für BR04. Implementiere nur Validierungsannahme, Aggregation, Statistik und neutrale Berichtsprojektion. Führe keinen Merge aus. Starte WP05 nicht automatisch. Nach Commit, Push und Bericht stoppst du.

## Hard Start

Arbeitsbranch: `agent/br-04-benchmark-aggregator`

Exakte Basis: `<ACCEPTED_BR03_INTEGRATION_SHA>`

Der Platzhalter MUSS vor Beginn durch den einzelnen, 40-stelligen SHA der akzeptierten und fast-forward integrierten BR03-Fassung ersetzt werden. Ein Implementierungs-, Review-, Kurz-, Tag-, Datums- oder Branchwert ist unzulässig.

Nach Fetch MUSST du belegen:

1. BR03 besitzt ein unabhängiges Reviewurteil `ACCEPT`.
2. `origin/integration/voxel-kernel-lab-v1` zeigt exakt auf den eingesetzten SHA.
3. Der neue Arbeitsbranch hat exakt diesen Parent.
4. Der Worktree ist sauber.

Bei Abweichung: `NO_GO`, keine Änderung, kein Commit, kein Push, stop.

## Autoritative Eingaben

- `BR_SERIES_CONTRACT.md`
- akzeptierte und integrierte BR01-Verträge, Register und Quittung
- akzeptierte und integrierte BR02-Telemetrie und Adapter
- akzeptierte und integrierte BR03-Laufpläne und Rohläufe
- BR04 Benchmark Aggregator Abschlussbericht
- Benchmark Test Methodology Audit Report
- aktuelle Project Memory, Decision Log, Instructions und Research Register
- `AGENTS.md`

## Enger Umfang

Zulässige neue oder geänderte Bereiche:

- `src/benchmark/aggregate/**`
- `src/benchmark/reports/**`
- `tests/unit/benchmark/aggregate/**`
- `tests/fixtures/benchmark/aggregate/**`
- `docs/benchmark/aggregator-v1.md`
- erforderliche reine Node-Aggregator-Skripte in `package.json`

Keine neue Abhängigkeit und keine Lockfile-Änderung.

Nicht im Umfang:

- eigenes Metrik-, Szenario-, Availability-, Capability-, Hierarchie- oder Quittungsschema;
- Änderung akzeptierter BR01-, BR02- oder BR03-Verträge und Daten;
- Browsererfassung, Adapter oder Runner;
- Reparatur, Ergänzung oder heuristische Interpretation ungültiger Rohläufe;
- automatische Pass-/Fail-, Winner-, Regression- oder Akzeptanzentscheidung;
- BR06-Policy, WP05, G18, Editor- oder Produktlogik;
- Evidenzdateien, Evidenz-Generatoren und reale Performancekampagnen.

## Zu implementierende Komponenten

1. Annahme ausschließlich von BR01-validierten Runs mit passender `BenchmarkValidationReceiptV1`.
2. Strikte Hierarchieprüfung ohne Rekonstruktion fehlender Elternknoten.
3. Gruppierung nach BR01-Metrikregister, Hardwarezelle, Kandidat, Szenario, Prozesscontainer und Samplephase.
4. Prozessebene als primäre Bootstrap-Clustereinheit.
5. Explizit gepaarte Auswertung nur anhand `pairCellId` und `pairOrdinal`.
6. Robuste deskriptive Statistiken und Konfidenzintervalle gemäß akzeptiertem BR04-Bericht.
7. Deterministische Sortierung, Rundungs- und Serialisierungsregeln.
8. Neutrale Populationsqualifikation `below-technical-floor`, `technical-only` oder `standard-cell`.
9. Per-Metrik-Anzeige des BR01-`practicalEffectDelta`, ohne globale Vorgabe und ohne Gatewirkung.
10. Maschinenlesbarer und menschenlesbarer Bericht mit `decision: null` und `automaticDecision: "forbidden"`.

BR04 importiert `MetricRegistryV1` und dessen Digest aus BR01. Eine Datei wie `metricRegistry.ts`, die Registrydaten erneut definiert, ist verboten. BR04 darf nur Aggregatorfunktionen und registergetriebene Projektionen besitzen.

## Statistische Mindestregeln

- Weniger als 3 unabhängige `bootstrapClusterId`: `below-technical-floor`, kein Intervall mit Qualitätsanspruch.
- 3 oder 4 unabhängige Browserprozesse: `technical-only`, technisch berechenbar, nicht Standard-Performance-Zelle.
- Mindestens 5 unabhängige Browserprozesse plus alle weiteren Vertragsminima: `standard-cell`.
- Mindestens 30 messberechtigte Measurement-Iterationen je Standardzelle.
- Cold-Populationen verlangen mindestens 10 frische Prozesse.
- Iterationen desselben Prozesses erhöhen nicht die Zahl unabhängiger Cluster.
- Warmup-Samples werden nie in eine Measurement-Population aufgenommen.

Ein Effektband ist deskriptiv und metrikbezogen. Es gibt keinen globalen 10-Prozent-Wert, keine Vererbung und keinen impliziten Default. `null` bleibt `null`.

## Positive Tests

Mindestens abzudecken:

- deterministisch identischer Bericht bei gleicher kanonischer Eingabe;
- Eingabereihenfolge ändert den Bericht nicht;
- gültige Quittung, Plan-, Run-, Schema- und Registerdigests;
- korrekte Gruppierung entlang der exakten Hierarchie;
- Prozessebene als Bootstrap-Cluster, Iterationen bleiben innerhalb des Clusters;
- explizit gepaarte Auswertung mit passender Pair-ID und Ordinalzahl;
- ungepaarte Auswertung ohne erfundene Pair-Metadaten;
- 3 Prozesse ergeben `technical-only`;
- 5 Prozesse und vollständige Iterationsminima ergeben `standard-cell`;
- Cold-Zelle mit 10 frischen Prozessen;
- warmup wird ausgeschlossen, measurement wird eingeschlossen;
- jedes Metrik-Effektband wird exakt aus BR01 gelesen, einschließlich `null`;
- `decision: null` und `automaticDecision: "forbidden"` in jeder Ausgabe;
- alle im BR04-Quellbericht definierten Golden-, Quantil-, Bootstrap-, Paarungs-, Rundungs- und Serialisierungsfälle.

## Negative Tests

Mindestens abzudecken:

- 2 Prozesse als technisch aggregierbar;
- 3 oder 4 Prozesse als `standard-cell`;
- 5 Prozesse mit weniger als 30 Measurement-Iterationen als vollständige Standardzelle;
- Cold-Zelle mit weniger als 10 frischen Prozessen;
- mehrere Iterationen desselben Prozesses als mehrere unabhängige Cluster;
- fehlende, manipulierte oder nicht passende Validierungsquittung;
- Registerdigest-, Plan-, Hierarchie-, Einheit- oder Referenzmismatch;
- fehlender Elternknoten wird rekonstruiert;
- Paarung wird aus Reihenfolge, Zeit oder ähnlichen Samplewerten erraten;
- Warmup-Samples gelangen in die Measurement-Population;
- unbekannte `metricRef` oder illegale Samplephase;
- globale oder vererbte `0.10`-Schwelle;
- aus Effektband erzeugtes Pass-/Fail-, Winner- oder Regressionsurteil;
- nicht deterministische Ausgabe durch Map-, Locale-, Zeit- oder Zufallsabhängigkeit;
- Rohdaten werden repariert oder überschrieben;
- alle im BR04-Quellbericht verlangten Golden- und Fehlerfälle.

## Unveränderliche Schutzbereiche

Vor und nach der Arbeit Dateiliste und SHA-256-Digests vergleichen für:

- `tests/contracts/wp02FixtureGolden.ts`
- `tests/contracts/wp03GreedyGolden.ts`
- `tests/contracts/wp04AoGolden.ts`
- `evidence/wp01/**` bis `evidence/wp04/**`

Keine Abweichung. Keine Evidence-Skripte. WP04-Timings dürfen nicht als Aggregatorfixture, Baseline, Effektband oder Gateurteil verwendet werden.

## Ausführungs- und Prüfungsreihenfolge

1. `npm ci`
2. fokussierte BR04-Unit- und Golden-Tests
3. vollständiges `npm test`
4. `npm run build`
5. deterministischer Aggregator-Verify-Lauf ausschließlich mit synthetischen, versionierten Fixtures
6. Schutzbereich-Digestvergleich, Dependency- und vollständiger Diff-Audit

Browser-E2E ist für den reinen Node-Aggregator `NOT_APPLICABLE_BR04_PURE_AGGREGATION`. Behaupte dafür kein `PASS`. Falls eine aktuelle Repository-Regel einen regulären Smoke-Test verlangt, führe ausschließlich `npm run test:e2e` nach dem Build aus. Kein Evidence-Skript und kein realer Performancebenchmark.

## Qualitätsgrenzen

- BR04 ist neutral und erzeugt keine Entscheidung.
- Kein eigenes Metrikregister und keine Schattenverträge.
- Kein globaler 10-Prozent-Default.
- Keine heuristische Paarung oder Rohdatenreparatur.
- Keine Vermischung technischer Statistikfähigkeit mit Performance-Gate-Fähigkeit.
- Keine neue Abhängigkeit.

## Commit und Push

Nach vollständig erfolgreichen Pflichtgates genau ein fachlicher Commit mit Betreff:

`#VOXEL-LAB-008 Add deterministic benchmark aggregator v1`

Push ausschließlich:

`origin/agent/br-04-benchmark-aggregator`

Kein Force-Push. Kein Merge.

## Übergabebericht

Melde:

- konkret eingesetzten Basis-SHA, Kandidaten-SHA und Parent-SHA;
- lokalen und Remote-Branch;
- vollständige geänderte Dateiliste;
- Testbefehle, Resultate, Zählungen und Golden-Fixtures;
- Determinismus-, Hierarchie-, Quittungs-, Cluster- und Paarungsnachweise;
- Fälle für 2, 3, 4 und 5 Prozesse sowie Cold 10;
- Nachweis `decision: null`, kein globaler Effektband-Default;
- E2E-Status als `NOT_APPLICABLE` oder tatsächlich ausgeführtes Ergebnis;
- Dependency- und Lockfile-Status;
- Schutzbereich-Digests vor und nach der Arbeit;
- Bestätigung, dass keine Evidence-Skripte oder realen Benchmarks liefen;
- bekannte Restgrenzen;
- Bestätigung `kein Merge` und `WP05 nicht gestartet`.

Fordere danach einen unabhängigen BR04-Review gegen den konkret eingesetzten BR03-Integrations-SHA an und stoppe.

## Review/Fix-Loop

Nur ein unabhängiger Reviewer darf `ACCEPT` erteilen. Bei `FIX_REQUIRED` arbeitet derselbe Implementierer auf demselben Branch weiter, pusht einen klar bezeichneten Fix-Commit ohne Force und liefert den vollständigen Bericht erneut. Danach wird der gesamte unabhängige Review wiederholt. Kein Merge und kein Start von WP05.
