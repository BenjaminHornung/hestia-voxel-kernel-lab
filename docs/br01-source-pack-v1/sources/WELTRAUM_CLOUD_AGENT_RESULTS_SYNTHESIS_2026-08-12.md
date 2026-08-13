# Weltraum-Spiel – Intake und Vor-Synthese der Cloud-Agent-Ergebnisse

**Datum:** 2026-08-12  
**Kanonische technische Basis der Berichte:** `d95992df05952ac4be6221ca1809c1c9e3c0ac9d`  
**Laufender Write-Task:** WP04 in Codex Desktop  
**Status dieses Dokuments:** Projektweite Aufnahme der Ergebnisse; keine Implementierung und keine vorgezogene BR-Entscheidung.

---

## 1. Kurzurteil

Die Cloud-Welle C01 bis C07 ist fachlich wertvoll und vollständig genug, um die
nächste Planungsstufe vorzubereiten.

Unmittelbar gilt:

```text
C01 BR-01 Contracts/Provenienz       REPORT COMPLETE
C02 BR-02 Browser-Telemetrie         REPORT COMPLETE
C03 BR-03 Playwright/CDP Runner      REPORT COMPLETE
C04 BR-04 Aggregator                 CONTRACT COMPLETE, CROSSWALK PENDING
C05 WP04 Reviewprotokoll             READY FOR ACTUAL BRANCH REVIEW
C06 Lizenz/Contributions             OWNER DECISION REQUIRED
C07 Hardware H1-H3                   OWNER DECISION REQUIRED
C08 Gesamtsynthese                   NOCH NICHT STARTEN
```

C08 darf erst beginnen, wenn WP04 technisch und visuell akzeptiert sowie per
`--ff-only` integriert wurde. Erst C08 darf die vier BR-Berichte in eine
konfliktfreie serielle Implementierungsfolge umwandeln.

**Wichtig:** Die individuellen Handoff-Prompts aus C01 bis C04 sollen noch nicht
direkt an lokale Write-Agenten gegeben werden. Zwischen den Berichten bestehen
mehrere echte Schnittstellenkonflikte, die C08 zuerst normativ auflösen muss.

---

## 2. Einzelstatus

## C01 – BR-01 Benchmark-Contracts und Provenienz

**Bericht:** `BR01_benchmark_contracts_provenance_specification(1).md`  
**Agentstatus:** `READY_FOR_LATER_IMPLEMENTATION`

Stärken:

- geschlossene und versionierte TypeScript-/JSON-Schema-Verträge;
- JSON Schema Draft 2020-12;
- RFC-8785-JCS;
- SHA-256 mit Domain Separation;
- selbstreferenzfreier Bundle-Digest;
- Source-/Tree-/Build-/Fixture-/Candidate-Bindung;
- Scenario Registry;
- umfangreiche positive und negative Fail-closed-Fixtures;
- klare Trennung von Contracts, Provenienz, Telemetrie, Runner und Aggregator.

Vorgeschlagene Dependency:

```text
ajv@8.20.0
nur exakt gepinnte Dev-Dependency
keine Runtime-/Browserbundle-Abhängigkeit
```

Projektstatus:

```text
PROPOSED CONTRACT
nicht direkt implementieren
C08-Crosswalk erforderlich
```

## C02 – BR-02 In-Browser-Telemetrie

**Bericht:** `BR02_In_Browser_Telemetrie_Abschlussbericht_2026-08-12(1).md`  
**Agentstatus:** `READY_FOR_LATER_IMPLEMENTATION`

Stärken:

- Zeitnormalisierung über `performance.timeOrigin + performance.now()`;
- getrennte Messsemantik für rAF, Main-App-Work, Draw Submit, Browser Entries
  und Workerphasen;
- Capability-driven statt erfundener Nullwerte;
- bounded append-only Segmente;
- explizite Overflow-/Drop-Evidence;
- keine JSON-Serialisierung im Messfenster;
- keine globale mutierende TestBridge;
- Production-Build entfernt Full Collector und Export-UI;
- Datenschutz- und Fehlervertrag;
- bereits WP05-kompatible Operation-/Revision-/Request-Korrelation.

Projektstatus:

```text
PROPOSED CONTRACT
Basis später: akzeptierter BR-01-SHA
C08-Crosswalk erforderlich
```

## C03 – BR-03 Playwright/CDP Runner

**Bericht:** `BR03_Playwright_CDP_Runner_Abschlussbericht(1).md`  
**Agentstatus:** `READY_FOR_LATER_IMPLEMENTATION`

Stärken:

- dedizierte Node-CLI mit direkter Playwright-Library;
- Playwright Test nur zum Testen des Runners, nicht als Orchestrator;
- deterministischer Runplan;
- ABBA/BAAB beziehungsweise Williams-/Latin-Square-Gegenbalancierung;
- keine automatischen Performance-Retries;
- frische Browserprozesse und temporäre Profile;
- getrennte Cold, Warmup, Measurement, Stress, Trace und Leak;
- Environment-/GPU-/Browser-/Display-/Power-Provenienz;
- write-once Benchmarkartefakte außerhalb kuratierter Evidence;
- explizite Infrastructure-/Candidate-/Environment-/Unsupported-Taxonomie.

Projektstatus:

```text
PROPOSED CONTRACT
Basis später: akzeptierter BR-02-SHA
C08 muss A-01 bis A-08 gegen reale C01/C02-Verträge auflösen
```

## C04 – BR-04 Benchmark-Aggregator

**Bericht:** `BR04_Benchmark_Aggregator_Abschlussbericht_2026-08-12(1).md`  
**Agentstatus:** `REQUIRES_ADDITIONAL_RESEARCH`

Die allgemeine Statistikrecherche ist inhaltlich abgeschlossen. Der Status ist
nur deshalb nicht READY, weil beim Agenten Pflichtquellen und fertige
BR-01/02/03-Berichte nicht verfügbar waren.

Stärken:

- Hierarchie Hardwarezelle → Browserprozess → Run → Iteration → Event;
- Schutz gegen Pseudoreplikation;
- nearest-rank p50/p95;
- p99 nur ab 1.000 kompatiblen Events;
- Maxima immer sichtbar;
- explizites Pairing;
- hierarchischer Bootstrap;
- deterministische Seeds, 10.000 Resamples und Replicate-Digest;
- keine Outlier-Löschung;
- vollständige Invalid-/Missing-/Capability-Ledger;
- keine automatische Sieger-, PASS- oder FAIL-Aussage;
- Claim Trace bis zu Rohdaten, Plan und Digests.

Projektstatus:

```text
STATISTICAL SPEC COMPLETE
C08 CROSSWALK REQUIRED
keine weitere allgemeine Statistikrecherche nötig
```

## C05 – unabhängiges WP04-Reviewprotokoll

**Bericht:** `WP04_independent_review_protocol_abschlussbericht_2026-08-12(1).md`  
**Status:** `READY_FOR_LATER_IMPLEMENTATION`

Das Protokoll ist sofort verwendbar, sobald der lokale WP04-Agent Branch,
Commit und Parent meldet.

Es trennt:

```text
Code-/Contract-Korrektheit
Browser-/Evidence-Korrektheit
Git-/Scope-Disziplin
Performancediagnostik
visuelles Owner-Gate
```

Verbindliche Verdictfolge:

```text
TECHNICAL_ACCEPT_VISUAL_PENDING
ACCEPT
FIX_REQUIRED
REJECT
```

Es ist kein Urteil über den noch laufenden WP04-Branch.

## C06 – Lizenz- und Contribution-Entscheidung

**Bericht:** `C06_voxel_lab_license_contribution_decision_brief_2026-08-12(1).md`  
**Status:** `REQUIRES_OWNER_DECISION`

Empfohlener Standard:

```text
PolyForm Noncommercial 1.0.0
```

Bedingungen:

- Rechteinhaber und historische Rechtekette bestätigen;
- Scope für Code, Tests, Docs, Assets und Evidence festlegen;
- Required Notice festlegen;
- externe Codebeiträge zunächst geschlossen halten;
- vor externen Beiträgen juristisch geprüfte CLA, wenn spätere kommerzielle
  Relizenzierung erhalten bleiben soll;
- DCO allein löst Relizenzierung nicht.

Keine Lizenzänderung während des laufenden WP04-Write-Agents.

## C07 – H1-H3-Hardwareprofile

**Bericht:** `07_hardware_profiles_H1_H3_calibration_plan_abschlussbericht(1).md`  
**Status:** `REQUIRES_OWNER_DECISION`

Bereits sinnvoll definiert:

```text
H1-DESKTOP-DGPU:
  vorhandener 7950X3D / 64 GB / RX 7900 XTX / Windows 11
  High-End-Entwicklungsbaseline, kein typisches Zielgerät

H2-MAINSTREAM-IGPU:
  genau ein konkretes reales Mainstream-iGPU-Gerät

H3-MINIMUM-TARGET:
  genau ein konkretes reales Mindestgerät

CI-CORRECTNESS:
  Korrektheit, keine Produktperformance

EDGE-COMPAT / CHROME-BETA:
  Browserzellen, keine zusätzlichen Hardwareprofile
```

Offen bleiben vor allem:

- konkretes H2;
- ob H3 WebGPU unterstützen muss oder WebGL2-Fallback reicht;
- konkretes H3;
- kanonischer 1920×1080/DPR1/60-Hz-Vertrag;
- Thermal-Sensorpfad.

---

## 3. Kritische Crosswalk-Findings für C08

Die folgenden Punkte sind echte P1-Schnittstellenfragen. Sie müssen vor BR-01
normativ gelöst werden.

### X-01 – Environment Unknown/Unavailable

C01 verlangt mehrere zwingende konkrete Environmentwerte, darunter physische
Kerne, GPU/Treiber, Refresh, VSync und AC/Battery.

C03 und C07 weisen korrekt darauf hin, dass einige Werte auf einem Gerät oder
per CDP nicht zuverlässig beobachtbar sind. Sie verwenden dafür
`observed/declared/unknown/unsupported/error`.

**Erforderliche Entscheidung:**

BR-01 übernimmt einen allgemeinen Availability-/Provenance-Wrapper oder
markiert einen Run bei fehlenden Pflichtwerten als nicht measurement-eligible.
Es dürfen keine plausiblen Werte erfunden werden.

### X-02 – Run-/Process-/Iteration-Hierarchie

C01 modelliert `BenchmarkRunV1` mit einem flachen Samplearray und genau einem
`execution.iteration`.

C03 plant Browserprozesse mit mehreren Warmup-/Measurement-Iterationen.

C04 benötigt ausdrücklich:

```text
Browserprozess → Run → Iteration → Event
```

**Erforderliche Entscheidung:**

Entweder:

1. ein BR-01-Run entspricht genau einer Iteration und trägt stabile
   `browserProcessId`-/Clusterfelder, oder
2. `BenchmarkRunV1` wird vor Freeze auf `iterations[]` erweitert.

C08 muss genau eine Variante wählen und alle vier Berichte anpassen.

### X-03 – Explizite Plan-, Slot-, Pair- und Cluster-IDs

C04 darf nicht heuristisch paaren und verlangt:

```text
slotId
bootstrapClusterId
pairCellId
pairOrdinal
browserProcessId
```

Diese Felder sind in den C01-/C03-Kernverträgen derzeit nicht vollständig
normativ vorhanden.

**Erforderliche Entscheidung:**

BR-03 erzeugt diese IDs im Runplan. BR-01 bindet sie im Run-/Executionvertrag.
BR-04 importiert sie unverändert.

### X-04 – Validation Receipt

C04 erwartet ein BR-01-Validation-Receipt mit Validator-ID und Digests.
C01 definiert Validierung, aber kein eigenständiges Receipt als verbindliches
Artefakt.

**Erforderliche Entscheidung:**

BR-01 erhält einen versionierten `BenchmarkValidationReceiptV1`, oder C04 wird
auf eine andere explizite, digestgebundene Validierungsevidence umgestellt.

### X-05 – TelemetryExport versus BenchmarkRawSample

C02 exportiert `TelemetryExportV1` mit heterogenen Records.
C01 erwartet `BenchmarkRunV1.samples: BenchmarkRawSampleV1[]`.

**Erforderliche Entscheidung:**

Empfohlene Grenze:

```text
BR-02:
  erzeugt TelemetryExportV1 als unverändertes Rohartefakt

BR-03 oder ein reiner BR-02-Adapter:
  wandelt validierte Telemetrierecords deterministisch in
  BenchmarkRawSampleV1 um

BR-01:
  digestet sowohl Rohtelemetrie als auch finalen Run

BR-04:
  konsumiert ausschließlich BR-01-validierte Runs/Receipts
```

Der Adapterbesitz muss eindeutig werden. Keine doppelte Semantik.

### X-06 – Capability-Vokabular

C01, C02 und C03 verwenden unterschiedliche Statusmengen für:

```text
supported
unsupported
unavailable
not-requested
not-active
permission-denied
blocked
error
unknown
declared
observed
```

**Erforderliche Entscheidung:**

Eine gemeinsame, verlustfreie Capability-/Availability-Union in BR-01; BR-02
und BR-03 dürfen nur spezialisierte Unterfälle abbilden.

### X-07 – Phase-Vokabular

C01/C02/C04 unterscheiden:

```text
cold
warmup
measurement
stress
trace
leak
```

C03 verwendet teilweise `warm-measurement` als gemeinsame Prozesseinheit.

**Erforderliche Entscheidung:**

Prozesscontainer darf `warm-measurement` heißen; jedes Sample und jeder Run
muss trotzdem eindeutig `warmup` oder `measurement` tragen. Keine gemischte
Population.

### X-08 – Metrik-Registry Ownership

C01 besitzt Scenario-Metric-Contracts.
C02 besitzt Telemetrie-Recordnamen.
C04 besitzt `MetricDefinitionV1`.

**Erforderliche Entscheidung:**

Eine einzige versionierte Metrik-Registry wird Eigentum von BR-01. BR-02
emittiert nur registrierte rohe Namen/Units; BR-04 erweitert keine Semantik,
sondern konsumiert die Registry.

### X-09 – Unabhängige Prozesscluster

C04 setzt drei Top-Level-Cluster als technische Mindestgrenze für ein CI.
Für belastbare Performance-Gates sind fünf oder mehr Prozesse plausibel.

C03 garantiert Cold-Prozesse, aber Measurement ist primär über
Iterationszahlen beschrieben.

**Empfohlene C08-Entscheidung:**

```text
BR-04 technische Darstellungsuntergrenze:
  3 unabhängige Browserprozesse

Performance-gate-fähige Standardzelle:
  mindestens 5 unabhängige Browserprozesse

BR-03 muss Runpläne entsprechend aufrunden.
BR-06 kann pro Gate strenger sein.
```

### X-10 – Praktische Effektbandbreite

C04 beschreibt `0,10` als vorgeschlagenes Delta, das noch keine universelle
Produktschwelle ist.

**Empfohlene C08-Entscheidung:**

- kein global hartcodiertes 10-Prozent-Gate;
- `practicalEffectDelta` ist optional und versioniert pro Metrik;
- BR-04 berichtet es neutral;
- erst BR-06 entscheidet Gatewirkung.

### X-11 – AJV

C01 empfiehlt `ajv@8.20.0` als exakt gepinnte Dev-Dependency zur unabhängigen
Schema-Parität.

**Empfohlene C08-Entscheidung:**

Akzeptieren, sofern:

- nur Dev-Dependency;
- nicht im Browser-/Runtimebundle;
- Lockfileänderung ist expliziter BR-01-Scope;
- Lizenz und Third-Party-Eintrag werden dokumentiert;
- eigene enge semantische Validierung bleibt maßgeblich.

---

## 4. Nächster sicherer Ablauf

```text
1. WP04-Agent fertigstellen lassen.
2. C05-Reviewprompt mit echtem Branch/Commit/Parent ausführen.
3. Technische Findings auf demselben WP04-Branch beheben.
4. Owner bewertet WP04-Evidence visuell.
5. WP04 ACCEPT und --ff-only Integration.
6. Neuen WP04-Integrations-SHA festhalten.
7. Erst jetzt C08 starten.
8. C08 erhält C01–C04, dieses Crosswalk-Dokument, C07 und den neuen SHA.
9. C08 erzeugt konfliktfreie BR01–BR04 Implementierungs-/Reviewprompts.
10. Erst danach genau einen lokalen BR-01-Write-Agenten starten.
```

---

## 5. Was jetzt nicht passieren darf

```text
kein BR-01-Agent auf Basis des individuellen C01-Handoffs
kein paralleler Writer im Voxel-Lab
kein C08 vor WP04-Integration
keine Lizenzdatei während WP04
keine Hardware-Performancebehauptung
kein BR-04-Sieger-/Pass-/Fail-Vertrag
keine still erfundenen Environmentwerte
```

---

## 6. Projektstatus

```text
WP04:
  RUNNING

C01:
  REPORT COMPLETE / SYNTHESIS PENDING

C02:
  REPORT COMPLETE / SYNTHESIS PENDING

C03:
  REPORT COMPLETE / SYNTHESIS PENDING

C04:
  CONTRACT COMPLETE / CROSSWALK PENDING

C05:
  READY FOR WP04 REVIEW

C06:
  OWNER DECISION PENDING

C07:
  OWNER DECISION PENDING

C08:
  BLOCKED UNTIL WP04 INTEGRATED
```
