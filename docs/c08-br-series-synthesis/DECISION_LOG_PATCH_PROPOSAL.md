# Vorschlag für einen Decision-Log-Patch

Status: Vorschlag, keine direkte Änderung des autoritativen Decision Log

Datum: 2026-08-13

Die folgenden IDs schließen an den zuletzt bekannten Stand D-037 an. Falls das autoritative Log inzwischen weitere Einträge besitzt, müssen die IDs beim Einfügen fortlaufend neu nummeriert werden. Inhalt und Reihenfolge bleiben erhalten.

## D-038: Gemeinsame Availability-/Capability-Union

**Entscheidung:** BR01 definiert eine einzige diskriminierte `AvailabilityV1<T>`-Union mit den Zuständen `observed`, `declared`, `unknown`, `unsupported`, `not-requested`, `not-active`, `permission-denied`, `blocked` und `error`. Capability-Verfügbarkeit ist eine Spezialisierung derselben Union. Nur `observed` mit `value: true` belegt Runtime-Support.

**Begründung:** Browser- und Hardwaredaten sind nicht auf jeder Plattform vollständig beobachtbar. Pflichtstrings erzwingen sonst ausgelassene Felder, leere Sentinelwerte oder erfundene Angaben.

**Folge:** Felder bleiben strukturell vorhanden. Leere Strings, Nullzahlen, `false` und Fantasiewerte sind als Ersatz verboten. Unbekannte Pflichtwerte können fail-closed die Messberechtigung entziehen, ohne die strukturelle Darstellung zu verhindern.

## D-039: Kanonische Benchmarkhierarchie und ID-Eigentum

**Entscheidung:** Die einzige serialisierte Hierarchie lautet `HardwareCellV1 -> BrowserProcessV1 -> BenchmarkRunV1 -> BenchmarkIterationV1 -> BenchmarkRawSampleV1`. BR01 definiert Typen und Constraints. BR03 erzeugt die konkreten Werte für `slotId`, `browserProcessId`, `bootstrapClusterId`, `pairCellId` und `pairOrdinal`. BR02 trägt sie unverändert, BR04 konsumiert sie.

**Begründung:** Flache Samples und mehrfach definierte Prozess-/Paarungsfelder machen Clusterresampling, Provenienz und Referenzintegrität mehrdeutig.

**Folge:** `hardwareCellId` ist der kanonische Zellschlüssel. Paarungen werden im Plan explizit erzeugt. BR04 darf keine IDs, Elternknoten oder Paarungen heuristisch rekonstruieren.

## D-040: Formale Validierungsquittung und Adaptergrenze

**Entscheidung:** BR01 definiert `BenchmarkValidationReceiptV1` ohne Timestamp oder Zufall. Die Quittung bindet Plan, Slot, Run, rohen BR02-Telemetrieexport, rohe Run-Bytes, kanonischen Run-Inhalt, Schemamenge, Validatorquelle und Metrikregister mit getrennten SHA-256-Werten. BR02 implementiert genau einen reinen deterministischen Adapter `TelemetryExportV1 -> BenchmarkRawSampleV1` gegen BR01-Zieltypen und Registermapping.

**Begründung:** Informelle Validierung und eine fehlende Export-zu-Rohsample-Grenze würden BR03 und BR04 zu Schattenvalidierung oder Datenreparatur zwingen.

**Folge:** Ungültige Runs erhalten keine Quittung. BR04 nimmt nur passend quittierte Runs an. Der Adapter aggregiert nicht, erfindet keine Nullsamples und liefert bei gleichem Input, Kontext und Registerdigest byteidentische Ausgabe.

## D-041: BR01 besitzt das zentrale Metrikregister und die Phasentypen

**Entscheidung:** `MetricRegistryV1` gehört BR01 und ist die Vereinigungsmenge aus BR01-Szenariometriken und BR04-Analysematrik mit normativem Alias-Crosswalk. BR02 nutzt dessen `sourceMapping` oder explizite Mappingdisposition, BR03 dessen Plan-, Capability- und Warmupregeln, BR04 dessen Aggregationssemantik. `warm-measurement` ist ausschließlich ein Prozesscontainer. Jeder Run und jedes Sample ist einphasig `warmup` oder `measurement`.

**Begründung:** Ein erst in BR04 definiertes Register kommt für Telemetrieabbildung und Laufplanung zu spät. Die Doppelbedeutung von `warm-measurement` vermischt Prozesslebensdauer und Samplepopulation.

**Folge:** Kein Paket besitzt ein zweites Register. Warmup-Samples werden nie in die Measurement-Population aufgenommen.

## D-042: Getrennte technische und reguläre Populationsuntergrenzen

**Entscheidung:** Drei unabhängige Browserprozesse sind die technische Untergrenze für eine Bootstrap-Statistik. Eine Standard-Performance-Zelle verlangt mindestens fünf unabhängige Browserprozesse je Kandidat, Szenario und Hardwarezelle sowie mindestens 30 messberechtigte Measurement-Iterationen. Cold verlangt mindestens zehn frische Browserprozesse.

**Begründung:** Die mathematische Berechenbarkeit eines Intervalls ist nicht gleichbedeutend mit einer belastbaren Performancepopulation.

**Folge:** BR04 klassifiziert neutral `below-technical-floor`, `technical-only` oder `standard-cell`. Iterationen desselben Prozesses erhöhen die unabhängige Prozesszahl nicht.

## D-043: Effektbänder sind metrikbezogen und nicht entscheidend

**Entscheidung:** Jede Metrik besitzt ein explizites `practicalEffectDelta` oder `null`. Es gibt keinen globalen 10-Prozent-Default und keine implizite Vererbung. BR04 gibt `decision: null` und `automaticDecision: "forbidden"` aus. Gatewirkung gehört frühestens BR06.

**Begründung:** Relevante Effektgrößen unterscheiden sich nach Metrik und liefern allein noch keine Produkt- oder Integrationsentscheidung.

**Folge:** BR04 darf Effektbänder deskriptiv darstellen, aber keine Pass/Fail-, Winner-, Regression- oder Akzeptanzlogik implementieren.

## D-044: AJV ist exakt gepinnt und entwicklungszeitlich

**Entscheidung:** BR01 darf ausschließlich `ajv@8.20.0` exakt als `devDependency` hinzufügen. AJV-Imports bleiben in Validator-, Schema- und Testmodulen. BR02 bis BR04 fügen keine neue Abhängigkeit hinzu.

**Begründung:** Reproduzierbare Schemavalidierung ist erforderlich, ohne das Produkt- oder Benchmark-Laufzeitbundle zu erweitern.

**Folge:** Kein Caret oder Tilde. BR01 muss Import- und Bundle-Ausschluss nachweisen. Der Lockfile-Diff wird auf die tatsächliche AJV-Auflösung begrenzt.

## D-045: Serielle SHA-Übergabe und unabhängiger Review/Fix-Loop

**Entscheidung:** BR01 startet exakt von `c64aeef1f51dd0ed2d8431411cf3ba1e84195b9d`. BR02, BR03 und BR04 starten jeweils nur vom konkreten 40-stelligen SHA der akzeptierten, fast-forward integrierten Vorgängerfassung. Vor jedem Start muss der Remote-Integrationsbranch exakt auf diesem SHA stehen.

**Begründung:** Branchnamen, Review-SHAs oder unbestimmte Latest-Stände erlauben unbemerkte Vertragsabweichungen.

**Folge:** Implementierer und Reviewer mergen nicht. Bei `FIX_REQUIRED` arbeitet derselbe Implementierer auf demselben Branch nach, danach wird der unabhängige Review vollständig wiederholt. Kein Paket startet automatisch das nächste.

## D-046: Frühere Goldens und Evidenz bleiben unverändert

**Entscheidung:** WP02-, WP03- und WP04-Goldens sowie `evidence/wp01/**` bis `evidence/wp04/**` bleiben während BR01 bis BR04 byteidentisch. Evidence-Skripte werden nicht ausgeführt. WP04-Timings bleiben `diagnostic only; not a benchmark gate`.

**Begründung:** Die BR-Serie ergänzt Beobachtung und Auswertung. Sie darf akzeptierte visuelle und algorithmische Evidenz weder regenerieren noch in Performancebaselines umdeuten.

**Folge:** Jedes Paket und jeder Review vergleicht Dateiliste und SHA-256-Digests vor und nach der Arbeit. WP04-Zeiten dürfen nicht als Sample, Baseline, Effektband, Kalibrierung oder Gate dienen.

## D-047: C08 abgeschlossen, BR-Serie implementierbar aber nicht gestartet

**Entscheidung:** Die C08-Gesamtsynthese ist `READY_FOR_LATER_IMPLEMENTATION`. Die erlaubte Reihenfolge lautet BR01, BR02, BR03, BR04, danach eine gesonderte WP05-Startentscheidung.

**Begründung:** Die zuvor offenen Paketgrenzen zu Availability, Hierarchie, ID-Eigentum, Adapter, Metrikregister, Populationen, Effekten, SHA-Provenienz und Evidenzschutz sind konfliktfrei aufgelöst.

**Folge:** BR01 darf erst nach Owner-Annahme von C08 starten. Reale Performance-Gates bleiben bis zu den offenen H2/H3-, Display- und Power-Bindungen gesperrt. G18 und Editor-/Produktrouten bleiben getrennt.

Vorgeschlagener Gesamtstatus: `READY_FOR_LATER_IMPLEMENTATION`
