# BR01 Implementierungsauftrag: Benchmarkverträge und Provenienz

## Rolle und Stop-Regel

Du bist der alleinige Implementierer für BR01 im Repository `BenjaminHornung/hestia-voxel-kernel-lab`. Implementiere nur BR01. Führe keinen Merge aus. Starte BR02 nicht automatisch. Nach Commit, Push und Bericht stoppst du.

## Hard Start

Arbeitsbranch: `agent/br-01-benchmark-contracts-provenance`

Exakte Basis: `c64aeef1f51dd0ed2d8431411cf3ba1e84195b9d`

Vor jeder Änderung MUSST du nach Fetch belegen:

1. `origin/integration/voxel-kernel-lab-v1` zeigt exakt auf `c64aeef1f51dd0ed2d8431411cf3ba1e84195b9d`.
2. Dein neuer Arbeitsbranch hat exakt diesen Parent und keine zusätzlichen Commits.
3. Der Worktree ist sauber.

Bei jeder Abweichung: `NO_GO`, keine Änderung, kein Commit, kein Push, stop.

## Autoritative Eingaben

- akzeptierter WP04-Integrations-SHA `c64aeef1f51dd0ed2d8431411cf3ba1e84195b9d`
- `BR_SERIES_CONTRACT.md`
- BR01 Benchmark Contracts and Provenance Specification
- C07 Hardware Profiles H1-H3 Calibration Plan
- BR02-, BR03- und BR04-Abschlussberichte nur zur Verträglichkeitsprüfung
- aktuelle Project Memory, Decision Log, Instructions und Research Register
- Repository-Regeln in `AGENTS.md`

Bei Konflikten gilt `BR_SERIES_CONTRACT.md` für die BR-Serie. Erfinde keine zusätzlichen Felder oder Richtlinien.

## Enger Umfang

Zulässige neue oder geänderte Bereiche:

- `src/benchmark/contracts/**`
- `src/benchmark/provenance/**`
- `src/benchmark/schemas/**`
- `tests/contracts/benchmark/**`
- `tests/fixtures/benchmark/**`
- `tests/unit/benchmark/contracts/**`
- `tests/unit/benchmark/provenance/**`
- `docs/benchmark/contracts-v1.md`
- `docs/benchmark/provenance-v1.md`
- `docs/benchmark/third-party-ajv.md`
- `package.json`
- `package-lock.json`

Wenn die vorhandene Teststruktur einen engeren äquivalenten Unterpfad erzwingt, dokumentiere die Abweichung vor der Änderung. Andere Bereiche sind gesperrt.

Nicht im Umfang:

- Browsererfassung oder `src/diagnostics/**`
- Playwright/CDP-Runner
- Aggregator und Statistik
- Produkt- oder Editorlogik
- WP05 oder G18
- Renderer-, Voxel-, Meshing-, AO- oder Palettenlogik
- Evidenz-Generatoren und Evidenzdateien
- reale Benchmarks

## Zu implementierender Vertrag

BR01 ist alleiniger Eigentümer von:

1. Protokoll- und Schemaversionen.
2. Gemeinsamen kanonischen ID- und Digesttypen.
3. `AvailabilityV1<T>` und `CapabilityAvailabilityV1` gemäß Vertrag, einschließlich `observed`, `declared`, `unknown`, `unsupported`, `not-requested`, `not-active`, `permission-denied`, `blocked` und `error`.
4. Der exakten Hierarchie `HardwareCellV1 -> BrowserProcessV1 -> BenchmarkRunV1 -> BenchmarkIterationV1 -> BenchmarkRawSampleV1`.
5. Getrennten Typen `BenchmarkProcessContainerV1` und `BenchmarkSamplePhaseV1`.
6. Typen und Constraints für `slotId`, `browserProcessId`, `bootstrapClusterId`, `pairCellId` und `pairOrdinal`. BR01 erzeugt die konkreten Werte nicht.
7. Hardwareprofil-Bindung, Umgebungsmanifest und fail-closed Messberechtigungsregeln.
8. Szenarioregister und Referenzintegrität.
9. Zentrales `MetricRegistryV1` als Vereinigungsmenge aus BR01-Szenariometriken und BR04-Analysematrik, einschließlich des normativen Alias-Crosswalks im BR-Series-Vertrag, Einheiten, zulässigen Phasen, Capability-Anforderungen, Mappingdispositionen und explizitem Effektbandwert oder `null` je Metrik.
10. Kanonische Serialisierung, SHA-256-Digests und Bundle-/Artefaktprovenienz.
11. `BenchmarkValidationReceiptV1` und `BenchmarkValidationFailureV1`.
12. Den reinen Adapterkontext und Ergebnisvertrag, nicht die BR02-Adapterimplementierung.

Keine freie Freitextvariante darf einen kanonischen Enum-, ID-, Grund- oder Registerwert ersetzen. Unbekannte reale Werte werden mit der gemeinsamen Union dargestellt, nicht mit leerem String, Nullzahl oder erfundenem Inhalt.

## AJV und Abhängigkeiten

- Füge ausschließlich `ajv` in exakt Version `8.20.0` als `devDependency` hinzu.
- Kein `^`, kein `~`, keine weitere neue direkte Abhängigkeit.
- AJV darf nur in Schema-/Validator- und Testmodulen importiert werden.
- Verifiziere, dass der Produktions- und Benchmark-Laufzeitbundle AJV nicht enthält.
- Begrenze den Lockfile-Diff auf AJV und tatsächlich aufgelöste Transitivabhängigkeiten.
- Dokumentiere Paket, exakte Version und MIT-Lizenz in `docs/benchmark/third-party-ajv.md`. Ändere keine Projektlizenz und keine Contribution-Policy.

## Positive Tests

Mindestens abzudecken:

- kanonische Serialisierung ist unabhängig von Objektschlüsselreihenfolge;
- Digestwiederholung ist byteidentisch;
- vollständige Hierarchie mit gültigen Rückreferenzen;
- beobachtete und deklarierte Availability-Werte;
- strukturell gültiger `unknown`-Wert mit entzogener Messberechtigung;
- beobachtete Capability `true` erfüllt die Capability-Anforderung;
- `warm-measurement`-Container mit geordneten `warmup`- und `measurement`-Iterationen;
- gültige explizite Pair- und Bootstrap-IDs;
- gültige Registerreferenz und Telemetrie-Source-Mapping;
- gültige Quittung mit selbstexkludierendem `receiptId`;
- Quittung bindet Plan, rohen BR02-Telemetrieexport, rohe Benchmark-Run-Bytes, kanonischen Run-Inhalt, Schema, Validator und Register jeweils eindeutig;
- Roundtrip aller JSON-Schemata gegen die TypeScript-Verträge;
- alle im BR01-Quellbericht zugesagten positiven Vertrags- und Provenienzfälle.

## Negative Tests

Mindestens abzudecken:

- leerer String, `0` oder `false` als Unbekannt-Sentinel;
- `declared` als angeblicher Runtime-Capability-Beleg;
- Wert im nichtwertigen Availability-Zweig;
- fehlender Elternknoten oder falsche Rückreferenz in der Hierarchie;
- flacher Samplepfad außerhalb der Iteration;
- `warm-measurement` als Samplephase;
- Messsample vor abgeschlossenem Warmup;
- doppelte oder inkonsistente Pair-, Slot-, Prozess- oder Cluster-ID;
- unbekannte `metricRef`, falsche Einheit oder nicht erlaubte Phase;
- impliziter globaler Effektband-Default;
- Quittung mit Zeitstempel, Zufallsfeld, zusammengefallenem Telemetrie-/Run-Digest, falschem Digest oder nicht passendem Run;
- Quittung für ungültigen Run;
- nicht endliche numerische Werte;
- Dateipfad, Commit-SHA oder Fixture-Digest außerhalb der kanonischen Regeln;
- alle im BR01-Quellbericht verlangten negativen Fälle einschließlich fehlender Provenienz und manipulierten Bundles.

## Unveränderliche Schutzbereiche

Vor und nach der Arbeit MUSST du Dateiliste und SHA-256-Digests vergleichen für:

- `tests/contracts/wp02FixtureGolden.ts`
- `tests/contracts/wp03GreedyGolden.ts`
- `tests/contracts/wp04AoGolden.ts`
- `evidence/wp01/**`
- `evidence/wp02/**`
- `evidence/wp03/**`
- `evidence/wp04/**`

Diese Dateien müssen byteidentisch bleiben. Führe kein `evidence:*`-Skript aus. WP04-Timings sind Diagnosewerte und dürfen nicht in Registry, Fixtures, Schwellen oder Samples übernommen werden.

## Ausführungs- und Prüfungsreihenfolge

1. `npm ci`
2. fokussierte BR01-Unit- und Contract-Tests
3. vollständiges `npm test`
4. `npm run build`
5. statische Prüfung der AJV-Imports und des Bundleinhalts
6. Schutzbereich-Digestvergleich und vollständiger Diff-Audit

Browser-E2E und Screenshot-Evidenz sind für dieses reine Vertrags- und Provenienzpaket `NOT_APPLICABLE_BR01_CONTRACT_ONLY`. Behaupte dafür kein `PASS`. Wenn eine aktuelle Repository-Regel trotzdem einen regulären Smoke-Test verlangt, führe ausschließlich `npm run test:e2e` nach dem Build aus und dokumentiere die Abweichung. Evidence-Skripte bleiben verboten.

## Qualitätsgrenzen

- Keine Schattenverträge für BR02, BR03 oder BR04.
- Keine Laufzeitmessung, kein Performanceurteil und kein globaler 10-Prozent-Schwellwert.
- Die technische Bootstrap-Untergrenze 3 und die Standardzell-Untergrenze 5 müssen getrennte neutrale Vertragswerte sein.
- `automaticDecision` bleibt für jede Metrik `forbidden`.
- Ungebundene H1-H3-Profile bleiben strukturell darstellbar, aber nicht messberechtigt.

## Commit und Push

Nach vollständig erfolgreichen Pflichtgates genau ein fachlicher Commit mit Betreff:

`#VOXEL-LAB-005 Add benchmark contracts and provenance v1`

Push ausschließlich:

`origin/agent/br-01-benchmark-contracts-provenance`

Kein Force-Push. Kein Merge.

## Übergabebericht

Melde:

- Basis-SHA, Kandidaten-SHA und Parent-SHA;
- lokalen und Remote-Branch;
- vollständige geänderte Dateiliste;
- Testbefehle, Resultate und Testzählungen;
- E2E-Status als `NOT_APPLICABLE` oder tatsächlich ausgeführtes Ergebnis;
- Dependency- und Lockfile-Diff;
- AJV-Laufzeit-Ausschluss;
- Schutzbereich-Digests vor und nach der Arbeit;
- Bestätigung, dass keine Evidence-Skripte liefen;
- bekannte Restgrenzen;
- Bestätigung `kein Merge` und `BR02 nicht gestartet`.

Fordere danach einen unabhängigen BR01-Review gegen exakt `c64aeef1f51dd0ed2d8431411cf3ba1e84195b9d` an und stoppe.

## Review/Fix-Loop

Nur ein unabhängiger Reviewer darf `ACCEPT` erteilen. Bei `FIX_REQUIRED` arbeitest du auf demselben Branch weiter, fügst einen klar bezeichneten Fix-Commit hinzu, pushst ohne Force und lieferst den vollständigen Bericht erneut. Nach jedem Fix ist der komplette unabhängige Review zu wiederholen. Auch nach `ACCEPT` führst du keinen Merge aus und startest BR02 nicht.
