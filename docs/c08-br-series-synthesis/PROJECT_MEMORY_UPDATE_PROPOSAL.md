# Vorschlag zur Aktualisierung der WELTRAUM Project Memory

Status: Vorschlag, keine direkte Änderung der autoritativen Project Memory

Datum: 2026-08-13

## Zu ersetzender aktueller Stand

Der historische WP04-Basisstand `d95992df...` ist nicht mehr der aktuelle Integrationsstand. Der maßgebliche Remote-Integrationsbranch wurde verifiziert als:

- Repository: `BenjaminHornung/hestia-voxel-kernel-lab`
- Branch: `origin/integration/voxel-kernel-lab-v1`
- SHA: `c64aeef1f51dd0ed2d8431411cf3ba1e84195b9d`
- Commit: `#VOXEL-LAB-004 Complete WP04 visual evidence contract`
- Integrationsurteil: `ACCEPT`
- Integrationsmethode: Fast-forward
- Verifikation: Build erfolgreich, 121/121 Unit-Tests, 12/12 reguläre E2E-Tests, null Retries, Schutzbereiche unverändert

WP04 ist damit akzeptiert und integriert. C08 durfte gestartet werden und ist als reine Vertrags- und Prompt-Synthese abgeschlossen.

## Neuer Steuerungsstand

- `C08`: `READY_FOR_LATER_IMPLEMENTATION`
- `BR01`: freigabefähig erst nach formaler Owner-Annahme der C08-Synthese, noch nicht gestartet
- `BR02`: gesperrt bis akzeptierte und verifizierte BR01-Integration
- `BR03`: gesperrt bis akzeptierte und verifizierte BR02-Integration
- `BR04`: gesperrt bis akzeptierte und verifizierte BR03-Integration
- `WP05`: gesperrt bis akzeptierte und verifizierte BR04-Integration
- `G18` und Editor-/Produkt-Roadmap: getrennt, nicht Bestandteil dieser Kette

Verbindliche Reihenfolge:

`C08 Owner-Annahme -> BR01 Implementierung -> unabhängiger Review/Fix-Loop -> Owner-Integration -> BR02 Implementierung -> unabhängiger Review/Fix-Loop -> Owner-Integration -> BR03 Implementierung -> unabhängiger Review/Fix-Loop -> Owner-Integration -> BR04 Implementierung -> unabhängiger Review/Fix-Loop -> Owner-Integration -> gesonderte WP05-Startentscheidung`

Kein Paket startet automatisch das nächste.

## Neue kanonische BR-Grenzen

### Eigentum

- BR01 besitzt alle gemeinsamen Versionen, IDs, Availability-/Capability-Status, Hierarchieschemata, Umgebungs- und Hardwarezellenverträge, Szenario- und Metrikregister, Provenienz, kanonische Digests und Validierungsquittung.
- BR02 besitzt Browsererfassung, `TelemetryExportV1` und den reinen deterministischen Adapter in BR01-Rohsamples.
- BR03 besitzt Laufplanung, Prozessstart und die konkreten Werte für `slotId`, `browserProcessId`, `bootstrapClusterId`, `pairCellId` und `pairOrdinal`.
- BR04 besitzt ausschließlich Aggregation, Statistik und neutrale Berichte.
- Schattenverträge sind verboten.

### Hierarchie

Genau eine serialisierte Hierarchie ist zulässig:

`HardwareCellV1 -> BrowserProcessV1 -> BenchmarkRunV1 -> BenchmarkIterationV1 -> BenchmarkRawSampleV1`

Der Rohsample ist das atomare Ereignis. `hardwareCellId` ist der kanonische Zellschlüssel. Historische Bezeichnungen wie `environmentCellId` oder `MeasurementCellKeyV1` dürfen nur noch als Dokumentationsalias vorkommen.

### Nichtverfügbarkeit

BR01 definiert eine gemeinsame diskriminierte `AvailabilityV1<T>`-Union für beobachtete, deklarierte, unbekannte, nicht unterstützte, nicht angeforderte, nicht aktive, verweigerte, blockierte und fehlerhafte Zustände. Pflichtfelder bleiben strukturell vorhanden. Leere Strings, Nullzahlen, `false` und erfundene Werte sind als Ersatz verboten.

Nur tatsächlich beobachtete Capabilities belegen Runtime-Support. Ein strukturell gültiger unbekannter Pflichtwert kann eine Zelle fail-closed von der Performance-Messberechtigung ausschließen.

### Phasen

`warm-measurement` ist ein Prozesscontainer. `warmup` und `measurement` sind getrennte Samplephasen. Warmup gehört nie zur Messpopulation.

### Validierung und Adapter

BR01 definiert eine deterministische, zeitstempelfreie `BenchmarkValidationReceiptV1`, die Run, Slot, Plan, den rohen BR02-Telemetrieexport, die rohen Run-Bytes, den kanonischen Run-Inhalt, Schema, Validatorquelle und Metrikregister per getrennten Digests bindet. Ungültige Runs erhalten keine Quittung.

BR02 implementiert genau einen reinen Adapter `TelemetryExportV1 -> BenchmarkRawSampleV1`. Er verwendet nur die BR01-Registerzuordnung, aggregiert nicht, übernimmt BR03-Kontext unverändert und ist bei gleichem Input byteidentisch.

### Metrikregister und Entscheidungen

Das zentrale Metrikregister wird in BR01 implementiert, nicht in BR04. Es ist die Vereinigungsmenge aus BR01-Szenariometriken und BR04-Analysematrik, enthält einen normativen Alias-Crosswalk und pro Metrik Einheit, Phase, Capability, Source-Mapping oder Mappingdisposition, Gruppierung, Richtung und ein explizites `practicalEffectDelta` oder `null`.

Es gibt keinen globalen 10-Prozent-Default. BR04 darf Effektbänder beschreiben, aber kein Pass/Fail-, Winner-, Regression- oder Akzeptanzurteil bilden. Gatewirkung entsteht frühestens in BR06. BR04-Berichte tragen `decision: null`.

### Populationsgrenzen

- mindestens 3 unabhängige Browserprozesse: Statistik technisch berechenbar, nicht performance-gate-fähig;
- mindestens 5 unabhängige Browserprozesse je Kandidat, Szenario und Hardwarezelle: minimale Standard-Performance-Zelle;
- mindestens 30 messberechtigte Measurement-Iterationen je Standardzelle;
- mindestens 10 frische Browserprozesse für Cold-Populationen.

Iterationen desselben Prozesses zählen nicht als unabhängige Prozesse.

### Abhängigkeiten

Nur BR01 darf `ajv@8.20.0` exakt als `devDependency` hinzufügen. AJV darf nicht in Produkt- oder Benchmark-Laufzeitbundles gelangen. BR02 bis BR04 fügen keine neue Abhängigkeit hinzu.

## SHA- und Review-Regel

- BR01-Basis ist exakt `c64aeef1f51dd0ed2d8431411cf3ba1e84195b9d`.
- Jedes spätere Paket verwendet ausschließlich den konkreten 40-stelligen SHA der akzeptierten, fast-forward integrierten Vorgängerfassung.
- Vor jedem Start muss `origin/integration/voxel-kernel-lab-v1` exakt auf diesem SHA stehen.
- Implementierer und Reviewer führen keinen Merge aus.
- Bei `FIX_REQUIRED` arbeitet derselbe Implementierer auf demselben Paketbranch nach. Der unabhängige Review wird danach vollständig wiederholt.

## Unveränderliche Evidenz

Für BR01 bis BR04 bleiben byteidentisch:

- `tests/contracts/wp02FixtureGolden.ts`
- `tests/contracts/wp03GreedyGolden.ts`
- `tests/contracts/wp04AoGolden.ts`
- `evidence/wp01/**` bis `evidence/wp04/**`

Evidence-Skripte werden in der BR-Serie nicht ausgeführt. WP04-Zeitwerte bleiben `diagnostic only; not a benchmark gate` und dürfen nicht als Baseline, Sample, Effektband, Kalibrierung oder Gate verwendet werden.

## Offene Owner-Entscheidungen

Die exakten realen H2-/H3-Geräte, Refresh-Rate, Power-Policy und weitere Labordetails bleiben offen. Sie blockieren synthetische Implementierung und Contract-Tests von BR01 bis BR04 nicht. Sie blockieren reale Standard-Performance-Gates. Ungebundene Profile bleiben `measurementEligible: false`.

## Vorgeschlagener nächster Schritt

Owner prüft und akzeptiert die C08-Lieferdateien. Erst danach darf BR01 mit dem bereitgestellten Implementierungsprompt und exakt dem WP04-Integrations-SHA gestartet werden.

Vorgeschlagener Gesamtstatus: `READY_FOR_LATER_IMPLEMENTATION`
