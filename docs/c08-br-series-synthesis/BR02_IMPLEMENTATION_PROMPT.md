# BR02 Implementierungsauftrag: In-Browser-Telemetrie und deterministischer Adapter

## Rolle und Stop-Regel

Du bist der alleinige Implementierer für BR02. Implementiere nur Browsererfassung, Export und den deterministischen Adapter. Führe keinen Merge aus. Starte BR03 nicht automatisch. Nach Commit, Push und Bericht stoppst du.

## Hard Start

Arbeitsbranch: `agent/br-02-in-browser-telemetry`

Exakte Basis: `<ACCEPTED_BR01_INTEGRATION_SHA>`

Der Platzhalter MUSS vor Arbeitsbeginn durch den einzelnen, 40-stelligen SHA der akzeptierten und fast-forward integrierten BR01-Fassung ersetzt werden. Ein Implementierungs-, Review-, Kurz-, Tag-, Datums- oder Branchwert ist unzulässig.

Nach Fetch MUSST du belegen:

1. BR01 besitzt ein unabhängiges Reviewurteil `ACCEPT`.
2. `origin/integration/voxel-kernel-lab-v1` zeigt exakt auf den eingesetzten SHA.
3. Der neue Arbeitsbranch hat exakt diesen Parent.
4. Der Worktree ist sauber.

Bei jeder Abweichung: `NO_GO`, keine Änderung, kein Commit, kein Push, stop.

## Autoritative Eingaben

- `BR_SERIES_CONTRACT.md`
- akzeptierte, integrierte BR01-Verträge und Register
- BR02 In-Browser Telemetrie Abschlussbericht
- BR01 Benchmark Contracts and Provenance Specification
- BR03- und BR04-Berichte nur als Verbraucheranforderung
- aktuelle Project Memory, Decision Log, Instructions und Research Register
- `AGENTS.md`

## Enger Umfang

Zulässige neue oder geänderte Bereiche:

- `src/diagnostics/telemetry/**`
- `src/benchmark/adapters/telemetryExportV1ToBenchmarkRawSampleV1.ts`
- `src/benchmark/adapters/index.ts`
- eng begrenzte Instrumentierungsaufrufe in `src/main.ts`
- eng begrenzte Instrumentierungsaufrufe in bestehenden Renderer-/Scheduler-Integrationspunkten
- `tests/unit/diagnostics/telemetry/**`
- `tests/unit/benchmark/adapters/**`
- `tests/e2e/telemetry*.spec.ts`
- `docs/benchmark/telemetry-v1.md`
- nur erforderliche Script-Ergänzungen in `package.json`

Keine neue Abhängigkeit und keine Lockfile-Änderung. Wenn der Adapterpfad in der akzeptierten BR01-Struktur anders vorgegeben ist, verwende den vorhandenen BR01-Pfad und dokumentiere dies.

Nicht im Umfang:

- Änderung der BR01-Schemata, Availability-Union, Registerdaten oder Validierungssemantik;
- Erzeugung von Laufplan-, Slot-, Prozess-, Bootstrap- oder Paar-IDs;
- Browserprozess-Orchestrierung oder CDP-Runner;
- Statistik, Konfidenzintervalle, Aggregation oder Gateentscheidung;
- WP05, G18, Editor- oder Produktfeatures;
- Evidenzdateien oder Evidenz-Generatoren;
- reale Performanceauswertung.

## Zu implementierende Komponenten

1. In-Browser-Uhr und monotone Ereignisreihenfolge.
2. Begrenzte, deterministisch exportierbare Telemetriebuffer.
3. `TelemetryExportV1` mit expliziten Availability-/Capability-Zuständen aus BR01.
4. Instrumentierung der im BR02-Bericht festgelegten Quellen, ohne Runtime-Semantik zu verändern.
5. Exportdiagnostik für Drops, Überlauf, nicht aktive oder nicht unterstützte Quellen.
6. Genau einen reinen Adapter `adaptTelemetryExportV1` gegen die akzeptierten BR01-Typen und das BR01-Metrikregister.

Der Adapter MUSS:

- Export und BR01-Kontext validieren;
- Ereignisse nach kanonischer `ingestSequence` verarbeiten;
- ausschließlich `sourceMapping` aus `MetricRegistryV1` nutzen;
- atomare `BenchmarkRawSampleV1`-Ereignisse erzeugen;
- die von BR03 gelieferten Hierarchie- und Orchestrierungs-IDs unverändert tragen;
- weder aggregieren noch Mittelwerte, Quantile oder Gatewerte bilden;
- keine Timestamp- oder Wertkorrektur verschweigen;
- nicht verfügbare Quellen als Availability/Capability-Zustand und nie als Nullsample darstellen;
- unbekannte oder unklassifizierte Namen, falsche Einheiten und mehrdeutige Mappings fail-closed invalidieren; BR01-seitig ausdrücklich als `context-only`, `diagnostic-only` oder `control-only` klassifizierte Records ohne Sampleerzeugung akzeptieren;
- bei gleichem Export, Kontext und Registerdigest byteidentische kanonische Ausgabe liefern.

BR02 darf BR03 nicht importieren. Der Adapterkontext stammt aus BR01. Keine lokale Kopie eines BR01-Typs oder Metrikregisters ist zulässig.

## Positive Tests

Mindestens abzudecken:

- monotone Browseruhr und stabile `ingestSequence`;
- stabile Reihenfolge bei mehreren Ereignisquellen;
- begrenzter Buffer mit sichtbarer Drop-Diagnostik;
- beobachtete, nicht aktive, nicht angeforderte und nicht unterstützte Capabilities;
- Long-Task-, RAF-, Memory-, Scheduler- und Mesh-Telemetrie entsprechend ihrer realen Browserverfügbarkeit;
- byteidentischer wiederholter `TelemetryExportV1`;
- byteidentische Adapterausgabe bei gleichem Export, Kontext und Registerdigest;
- korrekte Abbildung jeder aktuell aktiven `sourceMapping` auf Registereinheit und `metricRef`;
- Übernahme von Hardwarezellen-, Prozess-, Run-, Iterations- und Slotkontext ohne Änderung;
- mehrere atomare Samples aus einem Export in kanonischer Reihenfolge;
- alle im BR02-Quellbericht zugesagten positiven Unit- und Browserfälle.

## Negative Tests

Mindestens abzudecken:

- rückläufige Uhr oder doppelte `ingestSequence`;
- NaN, Infinity, falsche Einheit oder ungültiger Wertebereich;
- unbekannter oder mehrdeutiger Telemetriequellenname;
- Registerdigest passt nicht zum Kontext;
- `declared` wird fälschlich als beobachtete Capability behandelt;
- nicht verfügbare Quelle wird als numerisches Nullsample ausgegeben;
- fehlende Hierarchie- oder Orchestrierungs-ID im Adapterkontext;
- Adapter verändert eine von BR03 gelieferte ID;
- Adapter aggregiert oder rundet stillschweigend;
- instabile Serialisierung bei anderer Objektschlüsselreihenfolge;
- Bufferüberlauf ohne maschinenlesbare Invalidierung;
- Browser-API-Ausnahme ohne `error`-Availability;
- Telemetrie deaktiviert, aber trotzdem Messsample erzeugt;
- alle im BR02-Quellbericht verlangten negativen und Degradationsfälle.

## Unveränderliche Schutzbereiche

Vor und nach der Arbeit Dateiliste und SHA-256-Digests vergleichen für:

- `tests/contracts/wp02FixtureGolden.ts`
- `tests/contracts/wp03GreedyGolden.ts`
- `tests/contracts/wp04AoGolden.ts`
- `evidence/wp01/**` bis `evidence/wp04/**`

Keine Abweichung. Keine Evidence-Skripte. WP04-Zeitdiagnosen dürfen nicht als Telemetrie-Baseline, Sample oder Schwelle importiert werden.

## Ausführungs- und Prüfungsreihenfolge

1. `npm ci`
2. fokussierte BR02-Unit- und Adaptertests
3. vollständiges `npm test`
4. `npm run build`
5. reguläres `npm run test:e2e`
6. gezielte Telemetrie-E2E-Fälle in den vorhandenen deterministischen Browserprofilen
7. Schutzbereich-Digestvergleich, Dependency-Diff und vollständiger Diff-Audit

Führe kein Evidence-Skript und keinen realen Performancebenchmark aus. Wenn eine Browser-API auf der Testplattform nicht verfügbar ist, prüfe den richtigen Availability-Zweig. Erfinde keinen positiven Capability-Nachweis.

## Qualitätsgrenzen

- Instrumentierung darf keine sichtbare Produkt- oder Rendersemantik ändern.
- Keine Schattenverträge, kein lokales Metrikregister.
- Keine neue Abhängigkeit.
- Keine Aggregation und kein Gateurteil.
- Warmup- und Measurement-Samples bleiben unterschiedliche BR01-Samplephasen; `warm-measurement` ist nur ein Prozesscontainer.
- Die Telemetrie darf eine Ausführung nicht eigenständig als messberechtigt erklären.

## Commit und Push

Nach vollständig erfolgreichen Pflichtgates genau ein fachlicher Commit mit Betreff:

`#VOXEL-LAB-006 Add in-browser benchmark telemetry v1`

Push ausschließlich:

`origin/agent/br-02-in-browser-telemetry`

Kein Force-Push. Kein Merge.

## Übergabebericht

Melde:

- konkret eingesetzten Basis-SHA, Kandidaten-SHA und Parent-SHA;
- lokalen und Remote-Branch;
- vollständige geänderte Dateiliste und Instrumentierungspunkte;
- Testbefehle, Resultate, Zählungen und Browserprofil;
- tatsächlich beobachtete Capability- und Degradationspfade;
- deterministischen Export- und Adapter-Nachweis;
- Dependency- und Lockfile-Status;
- Schutzbereich-Digests vor und nach der Arbeit;
- Bestätigung, dass keine Evidence-Skripte oder realen Benchmarks liefen;
- bekannte Restgrenzen;
- Bestätigung `kein Merge` und `BR03 nicht gestartet`.

Fordere danach einen unabhängigen BR02-Review gegen den konkret eingesetzten BR01-Integrations-SHA an und stoppe.

## Review/Fix-Loop

Nur ein unabhängiger Reviewer darf `ACCEPT` erteilen. Bei `FIX_REQUIRED` arbeitet derselbe Implementierer auf demselben Branch weiter, pusht einen klar bezeichneten Fix-Commit ohne Force und liefert den vollständigen Bericht erneut. Danach wird der gesamte unabhängige Review wiederholt. Kein Merge und kein Start von BR03.
