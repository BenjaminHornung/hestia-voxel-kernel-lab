# BR03 Implementierungsauftrag: Playwright/CDP-Runner

## Rolle und Stop-Regel

Du bist der alleinige Implementierer für BR03. Implementiere nur die deterministische Laufplanung und Playwright/CDP-Orchestrierung. Führe keinen Merge aus. Starte BR04 nicht automatisch. Nach Commit, Push und Bericht stoppst du.

## Hard Start

Arbeitsbranch: `agent/br-03-playwright-cdp-runner`

Exakte Basis: `<ACCEPTED_BR02_INTEGRATION_SHA>`

Der Platzhalter MUSS vor Beginn durch den einzelnen, 40-stelligen SHA der akzeptierten und fast-forward integrierten BR02-Fassung ersetzt werden. Ein Implementierungs-, Review-, Kurz-, Tag-, Datums- oder Branchwert ist unzulässig.

Nach Fetch MUSST du belegen:

1. BR02 besitzt ein unabhängiges Reviewurteil `ACCEPT`.
2. `origin/integration/voxel-kernel-lab-v1` zeigt exakt auf den eingesetzten SHA.
3. Der neue Arbeitsbranch hat exakt diesen Parent.
4. Der Worktree ist sauber.

Bei Abweichung: `NO_GO`, keine Änderung, kein Commit, kein Push, stop.

## Autoritative Eingaben

- `BR_SERIES_CONTRACT.md`
- akzeptierte und integrierte BR01-Verträge/Register
- akzeptierte und integrierte BR02-Telemetrie/Adapter
- BR03 Playwright/CDP Runner Abschlussbericht
- C07 Hardware Profiles H1-H3 Calibration Plan
- BR04-Bericht nur als Verbraucheranforderung
- aktuelle Project Memory, Decision Log, Instructions und Research Register
- `AGENTS.md`

## Enger Umfang

Zulässige neue oder geänderte Bereiche:

- `src/benchmark/runner/**`
- `tests/unit/benchmark/runner/**`
- `tests/fixtures/benchmark/runner/**`
- eng begrenzte Runner-E2E-Dateien unter `tests/e2e/benchmark-runner*.spec.ts`
- `docs/benchmark/runner-v1.md`
- erforderliche Benchmark-Runner-Skripte in `package.json`
- eine eng begrenzte Runner-`tsconfig`, falls technisch erforderlich
- eng begrenzte Ignore-Regeln nur für dokumentierte lokale Runner-Artefakte

Keine neue Abhängigkeit und keine Lockfile-Änderung. Verwende die bereits akzeptierte Playwright-Version und vorhandene Node-Laufzeit.

Nicht im Umfang:

- Änderung oder Kopie von BR01-Verträgen, Schemata, Availability-Union, Validierungs- oder Registerdaten;
- Änderung oder Kopie des BR02-Telemetrieexports oder Adapters;
- Aggregator, Bootstrap-Konfidenzintervalle oder Gateentscheidung;
- Produkt-, Editor-, G18- oder WP05-Arbeit;
- Evidence-Dateien oder Evidence-Generatoren;
- unbeaufsichtigter oder realer H1/H2/H3-Performance-Lauf.

## Zu implementierende Komponenten

1. Kanonischer, seedbarer Laufplan gegen BR01-Szenario- und Metrikregister.
2. Deterministische Erzeugung der konkreten Werte für `slotId`, `browserProcessId`, `bootstrapClusterId`, `pairCellId` und `pairOrdinal`.
3. Frisches Browserprofil je unabhängiger Prozessinstanz.
4. CDP-Erfassung des real beobachtbaren Umgebungsmanifests mit BR01-Availability-Zweigen.
5. Prozesscontainer `cold`, `warm-measurement`, `stress`, `trace` und `leak`.
6. Einphasige Runs und Samplephasen `cold`, `warmup`, `measurement`, `stress`, `trace` und `leak`.
7. Expliziter Übergang von mindestens einem `warmup`-Run zu einem oder mehreren `measurement`-Runs im selben `warm-measurement`-Prozess, gegen BR01-Registerregel und Laufplanminimum.
8. Aufruf des BR02-Adapters mit unverändertem BR03-Kontext.
9. BR01-Validierung und Erzeugung von `BenchmarkValidationReceiptV1` nur für erfolgreiche Runs.
10. Deterministische Ausgabe und Fehlerisolierung ohne Aggregation.

BR03 ist der einzige Erzeuger der konkreten Orchestrierungs-IDs. Es darf dafür keine lokale Typkopie definieren. `browserProcessId` ist logisch und nicht die Betriebssystem-PID. Paarung ist vollständig im Plan festgelegt und darf nie nach der Messung konstruiert werden.

## Mengenregeln

- Technische Statistik-Untergrenze: mindestens 3 unabhängige Browserprozesse. Dies markiert lediglich technische Aggregierbarkeit.
- Standard-Performance-Zelle: mindestens 5 unabhängige Browserprozesse je Kandidat, Szenario und Hardwarezelle.
- Warm-Measurement: mindestens 30 messberechtigte `measurement`-Iterationen je Standardzelle.
- Wenn höchstens 5 Messiterationen pro Prozess geplant sind, plane mindestens 6 Prozesse.
- Cold: mindestens 10 frische Browserprozesse, eine Cold-Beobachtung je neuem Prozess.
- Iterationen desselben Browserprozesses zählen nie als zusätzliche unabhängige Prozesse.

Der Plan darf strengere Werte konfigurieren. Er darf die Untergrenzen nicht implizit absenken.

## Positive Tests

Mindestens abzudecken:

- identischer Seed und Vertrag erzeugen byteidentischen Plan und IDs;
- anderer Seed verändert nur die dafür vorgesehenen Ordnungswerte;
- exakte Hierarchie Hardwarezelle, Prozess, Run, Iteration, Sample;
- frisches Profil und eindeutiger `bootstrapClusterId` pro unabhängiger Prozessinstanz;
- explizite, symmetrische Paarzellen und gemeinsame `pairOrdinal`-Werte;
- korrekt getrennte Prozesscontainer und Samplephasen;
- geordnete Warmup-Iterationen vor Measurement-Iterationen;
- erfolgreiche Stabilitätsprüfung mit Registermetrik und Epsilon;
- Standardzelle mit mindestens 5 unabhängigen Prozessen und mindestens 30 Measurement-Iterationen;
- Cold-Plan mit mindestens 10 frischen Prozessen;
- beobachtbare Environmentwerte und korrekte Unknown-/Unsupported-Zweige;
- BR02-Adapter erhält IDs unverändert;
- gültiger einphasiger Run erhält genau eine passende BR01-Validierungsquittung, die Telemetrieexport und finalen Run getrennt bindet;
- Prozessfehler bleiben auf den betroffenen Slot begrenzt und maschinenlesbar;
- alle im BR03-Quellbericht zugesagten Unit-, Plan-, Browser- und CDP-Fälle.

## Negative Tests

Mindestens abzudecken:

- Plan mit 2 Prozessen als technisch aggregierbar;
- Plan mit 3 oder 4 Prozessen als Standard-Performance-Zelle;
- fünf Prozesse, aber weniger als 30 Measurement-Iterationen;
- Cold-Beobachtungen aus wiederverwendetem Prozess oder Profil;
- doppelte oder inkonsistente Slot-, Prozess-, Cluster-, Pair- oder Ordinal-ID;
- Ableitung einer ID aus Betriebssystem-PID, Timestamp oder Zufall ohne Seed;
- heuristische Paarung nach Ausführung;
- `warm-measurement` als Samplephase;
- Measurement vor Warmupminimum oder Stabilität;
- Warmup-Sample in der Messpopulation;
- Capability als beobachtet markiert, obwohl CDP sie nicht belegt;
- Pflichtumgebung unbekannt, aber Zelle als messberechtigt markiert;
- Adapter verändert Kontext-ID oder Registerdigest;
- Quittung trotz Run-, Digest-, Referenz- oder Reihenfolgefehler;
- Browserabsturz, Timeout oder Teilausgabe ohne fail-closed Ergebnis;
- alle im BR03-Quellbericht verlangten negativen Plan-, Prozess- und CDP-Fälle.

## Unveränderliche Schutzbereiche

Vor und nach der Arbeit Dateiliste und SHA-256-Digests vergleichen für:

- `tests/contracts/wp02FixtureGolden.ts`
- `tests/contracts/wp03GreedyGolden.ts`
- `tests/contracts/wp04AoGolden.ts`
- `evidence/wp01/**` bis `evidence/wp04/**`

Keine Abweichung. Keine Evidence-Skripte. WP04-Timings dürfen weder Laufplanwert noch Warmupregel, Baseline oder Gate werden.

## Ausführungs- und Prüfungsreihenfolge

1. `npm ci`
2. fokussierte BR03-Plan-, ID- und Validator-Unit-Tests
3. vollständiges `npm test`
4. `npm run build`
5. kontrollierte Runner-Integration ausschließlich mit synthetischen Fixtures und lokalen deterministischen Profilen
6. reguläres `npm run test:e2e`
7. ein synthetischer `benchmark:verify`-Pfad, falls im Umfang implementiert, ohne reale Performanceinterpretation
8. Schutzbereich-Digestvergleich, Dependency- und vollständiger Diff-Audit

Kein Evidence-Skript. Kein realer H1/H2/H3-Benchmark. Keine behauptete Hardwareverfügbarkeit, die nicht beobachtet wurde.

## Qualitätsgrenzen

- Keine Schattenverträge oder zweite Metrik-Mappingtabelle.
- BR03 erzeugt Rohläufe und Quittungen, keine Statistiken.
- Ein Quittungsfehler ist fail-closed.
- Technische Untergrenze 3 und Standarduntergrenze 5 bleiben getrennt.
- Keine globale 10-Prozent-Regel.
- Ungebundene reale Hardwareprofile bleiben `measurementEligible: false`.

## Commit und Push

Nach vollständig erfolgreichen Pflichtgates genau ein fachlicher Commit mit Betreff:

`#VOXEL-LAB-007 Add deterministic benchmark runner v1`

Push ausschließlich:

`origin/agent/br-03-playwright-cdp-runner`

Kein Force-Push. Kein Merge.

## Übergabebericht

Melde:

- konkret eingesetzten Basis-SHA, Kandidaten-SHA und Parent-SHA;
- lokalen und Remote-Branch;
- vollständige geänderte Dateiliste;
- Planparameter, Seeds und erzeugte ID-Beispiele aus synthetischen Fixtures;
- Testbefehle, Resultate und Zählungen;
- Prozess-, Profil-, CDP- und Quittungsnachweise;
- Dependency- und Lockfile-Status;
- Schutzbereich-Digests vor und nach der Arbeit;
- Bestätigung, dass keine Evidence-Skripte oder realen Performancebenchmarks liefen;
- bekannte Restgrenzen;
- Bestätigung `kein Merge` und `BR04 nicht gestartet`.

Fordere danach einen unabhängigen BR03-Review gegen den konkret eingesetzten BR02-Integrations-SHA an und stoppe.

## Review/Fix-Loop

Nur ein unabhängiger Reviewer darf `ACCEPT` erteilen. Bei `FIX_REQUIRED` arbeitet derselbe Implementierer auf demselben Branch weiter, pusht einen klar bezeichneten Fix-Commit ohne Force und liefert den vollständigen Bericht erneut. Danach wird der gesamte unabhängige Review wiederholt. Kein Merge und kein Start von BR04.
