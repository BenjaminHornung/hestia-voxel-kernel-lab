# BR-Series-Vertrag nach integrierter WP04

Status: `READY_FOR_LATER_IMPLEMENTATION`

Datum: 2026-08-13

## 1. Freigabenachweis und Geltungsbereich

Die Hard-Start-Bedingung ist erfüllt.

- Autoritativer Integrationsbranch: `origin/integration/voxel-kernel-lab-v1`
- Verifizierter Remote-Head: `c64aeef1f51dd0ed2d8431411cf3ba1e84195b9d`
- Integrierter Commit: `#VOXEL-LAB-004 Complete WP04 visual evidence contract`
- Integrationsurteil: `ACCEPT`
- Integrationsart: Fast-forward, ohne Force-Push
- Integrationsprüfungen: Build erfolgreich, 121 von 121 Unit-Tests erfolgreich, 12 von 12 reguläre E2E-Tests erfolgreich, null Retries
- WP02-, WP03- und WP04-Goldens sowie WP01- bis WP04-Evidenz vor und nach Integration unverändert

Dieser Vertrag synthetisiert BR01 bis BR04. Er autorisiert keine Implementierung. Er ändert das Repository nicht. G18, Produktruntime, Editor-Roadmap und WP05 bleiben außerhalb des Umfangs.

Verbindliche Reihenfolge:

`BR01 -> unabhängiger Review/Fix-Loop -> Integration -> BR02 -> unabhängiger Review/Fix-Loop -> Integration -> BR03 -> unabhängiger Review/Fix-Loop -> Integration -> BR04 -> unabhängiger Review/Fix-Loop -> Integration -> WP05`

Kein Paket darf vom Ausgangs-SHA seines Vorgängers abzweigen. Jedes Paket startet nur vom exakt verifizierten, akzeptierten Integrations-SHA des unmittelbar vorherigen Pakets.

## 2. Normative Begriffe

Die Schlüsselwörter MUSS, DARF NICHT, SOLL und KANN sind normativ.

- `strukturell gültig`: Schema, Referenzen, Reihenfolge, Digests und Provenienz sind gültig.
- `messberechtigt`: Eine strukturell gültige Beobachtung erfüllt zusätzlich alle für ihr Hardwareprofil und ihren Metriktyp geforderten Laufzeitbedingungen.
- `technisch aggregierbar`: Eine Population erreicht die statistische Untergrenze von mindestens drei unabhängigen Browserprozessen.
- `Standard-Performance-Zelle`: Eine messberechtigte Population mit mindestens fünf unabhängigen Browserprozessen je Kandidat, Szenario und Hardwarezelle sowie den im Laufplan geforderten Messiterationen.
- `Gate`: Eine spätere BR06-Entscheidungsregel. BR04 erzeugt niemals ein Gate-Urteil.

## 3. Eigentumsgrenzen

| Bereich | Einziger Eigentümer | Zulässige Verbraucher | Verbotene Duplikation |
|---|---|---|---|
| Protokollversionen, gemeinsame IDs und Status-Union | BR01 | BR02, BR03, BR04, später WP05 | Lokale Status- oder ID-Enums |
| Hierarchie und serialisierte Strukturtypen | BR01 | BR02, BR03, BR04 | Schatten-Schemata in Runner oder Aggregator |
| Hardwareprofil-Bindung und Umgebungsmanifest | BR01 | BR03 erzeugt Werte, BR04 gruppiert | Eigenes `MeasurementCell`-Schema außerhalb BR01 |
| Szenarioregister | BR01 | BR03, BR04 | Freie Szenarionamen in Laufdaten |
| Zentrales Metrikregister | BR01 | BR02 mappt, BR03 plant, BR04 aggregiert | Zweites Metrikregister in BR04 |
| Validierungsquittung | BR01 | BR03 erzeugt nach Validierung, BR04 verlangt sie | Informelle oder nachträglich rekonstruierte Quittung |
| Browser-Erfassung und `TelemetryExportV1` | BR02 | BR03 | Browsererfassung in BR03 oder BR04 |
| Deterministischer Telemetrieadapter | BR02, gegen BR01-Zieltypen | BR03 ruft ihn auf | Adapterlogik in BR03 oder BR04 |
| Laufplan, Prozessstart und konkrete Orchestrierungs-IDs | BR03 | BR02 trägt Kontext, BR04 konsumiert | Heuristische ID-Erzeugung in BR04 |
| Aggregation, Statistik und neutraler Bericht | BR04 | später BR06 | Rohdatenreparatur, Gate- oder Gewinnerlogik |

BR01 definiert Verträge. BR02 beobachtet. BR03 führt aus. BR04 fasst zusammen. Kein Paket DARF den Vertrag eines Vorgängers lokal nachbauen.

## 4. Gemeinsame Verfügbarkeits- und Capability-Union

BR01 MUSS genau eine gemeinsame diskriminierte Union exportieren:

```ts
type AvailabilityStatusV1 =
  | "observed"
  | "declared"
  | "unknown"
  | "unsupported"
  | "not-requested"
  | "not-active"
  | "permission-denied"
  | "blocked"
  | "error";

type AvailabilityV1<T> =
  | {
      status: "observed";
      value: T;
      sourceRef: CanonicalIdV1;
      stability: "stable" | "experimental" | "platform-specific";
    }
  | {
      status: "declared";
      value: T;
      sourceRef: CanonicalIdV1;
      stability: "owner-binding" | "run-config" | "browser-default";
    }
  | {
      status: Exclude<AvailabilityStatusV1, "observed" | "declared">;
      value: null;
      sourceRef: CanonicalIdV1;
      reasonCode: CanonicalIdV1;
    };

type CapabilityAvailabilityV1 = AvailabilityV1<true>;
```

Regeln:

1. Alle Felder eines Umgebungsmanifests bleiben strukturell vorhanden und tragen eine Union. Ein nicht ermittelbarer Wert wird nicht ausgelassen.
2. Leere Strings, `0`, `false`, `null` in einem beobachteten oder deklarierten Zweig und Fantasiewerte sind als Ersatz für unbekannte Werte verboten.
3. Nur `status: "observed", value: true` belegt eine zur Laufzeit tatsächlich verfügbare Capability.
4. `declared` ist eine deklarierte Konfiguration und kein Beleg für Runtime-Support.
5. `not-active` bedeutet, dass eine grundsätzlich mögliche Beobachtung im Lauf nicht aktiv war. Das ist nicht dasselbe wie `unsupported`.
6. `unknown` ist eine gültige Repräsentation, kann aber die Messberechtigung entziehen.
7. Das Hardwareprofil definiert pro Pflichtfeld die zulässigen Statuswerte. Fehlt für H1, H2 oder H3 ein erforderlicher beobachteter Wert, ist die Zelle fail-closed `measurementEligible: false`. Die Daten können dennoch strukturell gültig und für Korrektheitsdiagnosen nutzbar sein.
8. Capability-, Environment- und optionale Metrikverfügbarkeit verwenden dieselbe Union. Spezialisierte Schattenvarianten sind verboten.

## 5. Exakte Hierarchie

Die kanonische serialisierte Hierarchie lautet genau:

`HardwareCellV1 -> BrowserProcessV1 -> BenchmarkRunV1 -> BenchmarkIterationV1 -> BenchmarkRawSampleV1`

`BenchmarkRawSampleV1` ist das atomare Ereignis. Es darf keinen parallelen flachen Sample-Pfad außerhalb dieser Hierarchie geben.

### 5.1 Hardwarezelle

Eine `HardwareCellV1` bindet mindestens:

- `hardwareCellId`
- Source-, Build- und Fixture-Digests
- `scenarioId` und `scenarioVersion`
- logisches Hardwareprofil H1, H2 oder H3
- beobachtetes Umgebungsmanifest mit Browser-, OS-, CPU-, GPU-, Display- und Power-Angaben
- Container- und Capability-Bindungen
- Messberechtigungsstatus mit maschinenlesbaren Gründen

`environmentCellId` und `MeasurementCellKeyV1` dürfen in historischen Dokumenten als Alias erläutert werden, aber nicht als zweiter serialisierter Primärschlüssel fortbestehen. Der kanonische Schlüssel ist `hardwareCellId`.

### 5.2 Browserprozess

Ein `BrowserProcessV1` ist eine unabhängige Browserinstanz mit frischem Profil. `browserProcessId` ist eine logische, deterministische Protokoll-ID und niemals die Betriebssystem-PID. Ein Prozess gehört genau einer Hardwarezelle.

### 5.3 Run, Iteration und Sample

- Ein Browserprozess kann mehrere Runs desselben Planslots enthalten.
- Ein Run gehört genau einem Browserprozess und genau einem Laufplan-Slot und trägt genau eine `samplePhase`.
- Eine Iteration gehört genau einem Run, hat einen monotonen `iterationOrdinal` und dieselbe `samplePhase` wie ihr Run.
- Ein Sample gehört genau einer Iteration, trägt dieselbe `samplePhase`, genau eine registrierte `metricRef` und einen endlichen numerischen Wert in der Registereinheit.
- BR04 darf keine fehlenden Elternknoten aus Samples herleiten.
- Referenz-, Reihenfolge- oder Digestfehler machen den Run ungültig. BR04 darf solche Fehler nicht reparieren.

## 6. ID-Eigentum und Paarung

BR01 definiert Typen, Formate und Integritätsregeln. BR03 ist der einzige Erzeuger der konkreten Orchestrierungswerte:

| Feld | Erzeuger | Semantik |
|---|---|---|
| `slotId` | BR03 | Deterministische ID genau eines Planslots |
| `browserProcessId` | BR03 | Logische ID eines frischen Browserprozesses |
| `bootstrapClusterId` | BR03 | Primäre Resampling-Einheit auf Prozessebene |
| `pairCellId` | BR03 | Explizite Paarzelle für zwei vorab geplante Gegenstücke |
| `pairOrdinal` | BR03 | Gemeinsame Ordinalzahl beider Slots innerhalb derselben Paarzelle |

BR02 übernimmt diese IDs unverändert als Adapterkontext. BR04 konsumiert sie unverändert. BR04 darf Paarungen niemals aus Zeitnähe, Reihenfolge, Hardwareähnlichkeit, Commitnamen oder Samplewerten erraten.

Prozessunabhängigkeit wird über verschiedene `browserProcessId` und `bootstrapClusterId` belegt. Mehrere Iterationen desselben Browserprozesses zählen nicht als mehrere unabhängige Prozesse.

## 7. Prozesscontainer und Samplephasen

Zwei getrennte Typen sind zwingend:

```ts
type BenchmarkProcessContainerV1 =
  | "cold"
  | "warm-measurement"
  | "stress"
  | "trace"
  | "leak";

type BenchmarkSamplePhaseV1 =
  | "cold"
  | "warmup"
  | "measurement"
  | "stress"
  | "trace"
  | "leak";
```

Regeln:

- `warm-measurement` ist ausschließlich ein Prozesscontainer und niemals eine Samplephase.
- Ein `warm-measurement`-Prozess erzeugt zuerst mindestens einen `warmup`-Run, danach einen oder mehrere `measurement`-Runs. Jeder Run und jedes Sample bleibt einphasig.
- Warmup-Samples sind nicht Teil der Messpopulation.
- Der Übergang zu `measurement` erfolgt nur nach der im BR01-Metrikregister referenzierten Stabilitätsregel und dem BR03-Laufplan-Minimum.
- Cold-, Stress-, Trace- und Leak-Container dürfen nur ihre gleichnamige Samplephase erzeugen.
- Ein illegaler Container-Phasen-Übergang ist ein Validierungsfehler, kein Aggregatorhinweis.

## 8. Validierungsquittung

BR01 MUSS einen formalen, schemavalidierten Vertrag bereitstellen:

```ts
interface BenchmarkValidationReceiptV1 {
  schemaVersion: "benchmark-validation-receipt-v1";
  protocolVersion: "benchmark-protocol-v1";
  status: "schema-and-integrity-valid";
  receiptId: Sha256DigestV1;
  planId: CanonicalIdV1;
  slotId: CanonicalIdV1;
  runId: CanonicalIdV1;
  planDigest: Sha256DigestV1;
  telemetryExportRawByteSha256: Sha256DigestV1;
  benchmarkRunRawByteSha256: Sha256DigestV1;
  benchmarkRunCanonicalSha256: Sha256DigestV1;
  runBindingSha256: Sha256DigestV1;
  schemaSetSha256: Sha256DigestV1;
  metricRegistrySha256: Sha256DigestV1;
  validator: {
    id: "br01-validator-v1";
    sourceCommitSha: GitShaV1;
    sourceFileSetSha256: Sha256DigestV1;
  };
}
```

Normative Eigenschaften:

1. `receiptId` ist der SHA-256-Digest der kanonischen Quittung ohne das Feld `receiptId` selbst.
2. Die Quittung enthält keinen Zeitstempel und keine laufzeitabhängige Zufalls-ID.
3. Sie wird nur nach erfolgreicher Schema-, Referenz-, Reihenfolge-, Digest- und Registerprüfung erzeugt.
4. Ein ungültiger Run erzeugt `BenchmarkValidationFailureV1`, niemals eine Quittung.
5. Die Quittung bindet den unveränderten BR02-Telemetrieexport und den daraus erzeugten finalen Run getrennt. Die beiden Artefakte dürfen nicht durch einen einzelnen mehrdeutigen `rawByteSha256`-Wert vertreten werden.
6. Die Quittung belegt strukturelle Gültigkeit und Integrität. Sie belegt weder Messberechtigung noch Performancequalität noch ein Gate-Ergebnis.
7. BR04 akzeptiert nur Runs mit passender Quittung. Es rekonstruiert keine Quittung und validiert nicht nach eigenem Schattenvertrag.

## 9. Deterministischer Adapter

BR02 implementiert genau einen reinen Adapter von `TelemetryExportV1` zu BR01-Rohsamples. BR01 besitzt Zieltypen, Adapterkontext und Mappingmetadaten. BR03 liefert den validierten Kontext und ruft den Adapter auf.

Normative Signatur:

```ts
adaptTelemetryExportV1(
  telemetry: TelemetryExportV1,
  context: TelemetryAdapterContextV1,
  metricRegistry: MetricRegistryV1
): TelemetryAdapterResultV1;
```

Der Kontext enthält mindestens Hardwarezelle, Planslot, Browserprozess, Run, Iteration und Samplephase. Der Adapter:

1. validiert den Export vor der Abbildung,
2. verarbeitet Ereignisse ausschließlich nach kanonischer `ingestSequence`,
3. verwendet ausschließlich die `sourceMapping`-Einträge des BR01-Metrikregisters; jeder BR02-Recordname muss dort als `emit-sample`, `context-only`, `diagnostic-only` oder `control-only` klassifiziert sein,
4. erzeugt atomare `BenchmarkRawSampleV1`-Ereignisse ohne Mittelwertbildung oder Quantile,
5. rundet keine Zeitstempel oder Werte stillschweigend,
6. bildet nicht verfügbare optionale Quellen auf gemeinsame Availability- bzw. Capability-Zustände ab und niemals auf Nullmessungen,
7. weist unbekannte oder unklassifizierte Recordnamen sowie mehrdeutige oder einheitenfalsche Metrikabbildungen fail-closed zurück; ausdrücklich als `context-only`, `diagnostic-only` oder `control-only` klassifizierte Records sind keine unbekannten Namen,
8. bewahrt Mappingfehler als maschinenlesbare Invalidierungen,
9. liefert für denselben Export, Kontext und Registerdigest byteidentische kanonische Ausgabe.

BR02 darf BR03 nicht importieren. BR03 darf keine zweite Mappingtabelle besitzen. BR04 darf keine Telemetrie in Rohsamples umwandeln.

## 10. Zentrales Metrikregister

BR01 besitzt `MetricDefinitionV1`, `MetricRegistryV1`, die kanonische Serialisierung und `metricRegistrySha256`. Das Register enthält pro Metrik mindestens:

- stabile `metricRef` aus Name und Version,
- Einheit und numerischen Wertebereich,
- Ereignis- oder Populationssemantik,
- zulässige Prozesscontainer und Samplephasen,
- erforderliche Capabilities,
- Telemetrie-`sourceMapping`,
- Gruppierungs- und Paarungsregeln,
- Richtung der Interpretation,
- optionale Warmup-Kontrollfunktion und Epsilon,
- `practicalEffectDelta`, entweder explizit numerisch oder explizit `null`,
- `automaticDecision: "forbidden"`.

Die Registry ist die Vereinigungsmenge der BR01-Szenariometriken und der BR04-Analysematrik. Zunächst mindestens registrierte analytische Referenzen:

1. `world.mesh.total.ms@1`
2. `chunk.mesh.cpu.ms@1`
3. `snapshot.halo.build.ms@1`
4. `scheduler.queue.wait.ms@1`
5. `worker.total.ms@1`
6. `adoption.cpu.ms@1`
7. `input.revision.submit.ms@1`
8. `raf.interval.ms@1`
9. `longtask.duration.ms@1`
10. `longtask.count@1`
11. `memory.bytes@1`
12. `gpu.time.ms@1`
13. `scheduler.drain.ms@1`
14. `scheduler.stale.count@1`
15. `scheduler.drop.count@1`

Die BR04-Metriken werden so eingefroren:

| `metricRef` | Einheit | zulässige Phasen | Richtung | `practicalEffectDelta` |
|---|---|---|---|---:|
| `world.mesh.total.ms@1` | ms | cold, measurement | lower | 0.10 |
| `chunk.mesh.cpu.ms@1` | ms | cold, measurement, stress | lower | 0.10 |
| `snapshot.halo.build.ms@1` | ms | cold, measurement, stress | lower | 0.10 |
| `scheduler.queue.wait.ms@1` | ms | measurement, stress | lower | 0.10 |
| `worker.total.ms@1` | ms | measurement, stress | lower | 0.10 |
| `adoption.cpu.ms@1` | ms | measurement, stress | lower | 0.10 |
| `input.revision.submit.ms@1` | ms | measurement, stress | lower | 0.10 |
| `raf.interval.ms@1` | ms | measurement, stress | context-dependent | null |
| `longtask.duration.ms@1` | ms | measurement, stress, leak | lower | 0.10 |
| `longtask.count@1` | count | measurement, stress, leak | lower | null |
| `memory.bytes@1` | bytes | cold, measurement, leak | lower | 0.10 |
| `gpu.time.ms@1` | ms | measurement | lower | 0.10 |
| `scheduler.drain.ms@1` | ms | stress | lower | 0.10 |
| `scheduler.stale.count@1` | count | measurement, stress | context-dependent | null |
| `scheduler.drop.count@1` | count | measurement, stress | context-dependent | null |

BR01-Szenarioverträge verwenden keine parallelen freien Metriknamen. Folgende Crosswalks sind mindestens normativ:

| Historischer BR01-Szenarioname | Kanonische Referenz oder Bindung |
|---|---|
| `world-mesh-ms` | `world.mesh.total.ms@1` |
| `chunk-mesh-ms` | `chunk.mesh.cpu.ms@1` |
| `quad-count` | `mesh.quads.count@1` |
| `geometry-bytes` | `geometry.bytes@1` |
| `coverage-sha256-match` | `coverage.sha256.match@1` |
| `queue-depth` | `scheduler.queue.depth.count@1` |
| `active-worker-count` | `worker.active.count@1` |
| `adoption-ms` | `adoption.cpu.ms@1` |
| `latest-revision-visible` | `revision.latest.visible@1` |
| `heartbeat-gap-ms` | `heartbeat.gap.ms@1` |
| `long-task-ms` | `longtask.duration.ms@1` |
| `queue-drain-ms` | `scheduler.drain.ms@1` |
| `dropped-job-count` | `scheduler.drop.count@1` |
| `stale-result-count` | `scheduler.stale.count@1` |
| `input-to-revision-submit-ms` | `input.revision.submit.ms@1` |
| `world-sha256-match` | `world.sha256.match@1` |
| `js-heap-bytes` | `memory.bytes@1` plus `memoryKind: js-heap` |
| `embedder-heap-bytes` | `memory.bytes@1` plus `memoryKind: embedder-heap` |
| `backing-storage-bytes` | `memory.bytes@1` plus `memoryKind: backing-storage` |
| `memory-bytes` | `memory.bytes@1` plus verpflichtendes szenariospezifisches `memoryKind` |
| `dom-document-count` | `dom.document.count@1` |
| `dom-node-count` | `dom.node.count@1` |
| `event-listener-count` | `event.listener.count@1` |
| `gpu-resource-count` | `gpu.resource.count@1` |
| `draw-submit-cpu-ms` | `draw.submit.cpu.ms@1` |
| `raf-interval-ms` | `raf.interval.ms@1` |
| `image-contract-sha256-match` | `image.contract.sha256.match@1` |
| `gpu-time-ms` | `gpu.time.ms@1` |

Alle in der rechten Spalte neu genannten Referenzen gehören ebenfalls zur BR01-Registry. Für diese zusätzlich aus BR01 übernommenen Referenzen ist `practicalEffectDelta: null`, solange nicht eine spätere explizite metrikbezogene Entscheidung einen Wert setzt. Digest- oder Liveness-Matches sind Vertragsassertionen und keine Performance-Gates. BR01 muss für jeden `TelemetryRecord` eine Mappingdisposition definieren. Nicht jede Diagnostik muss ein Benchmark-Sample erzeugen.

Ein Effektband ist eine deskriptive, metrikbezogene Registereigenschaft. Es gibt keinen globalen 10-Prozent-Default. Ein Wert `0.10` darf nur in genau den einzelnen Registereinträgen stehen, für die er fachlich festgelegt wurde. `null` bedeutet ausdrücklich kein festgelegtes praktisches Effektband. BR04 darf einen Registerwert anzeigen, aber nicht in `pass`, `fail`, `winner`, `regression` oder `acceptable` umdeuten. Gatewirkung entsteht frühestens in BR06.

## 11. Populations- und Mindestmengenregeln

| Ebene | Untergrenze | Bedeutung |
|---|---:|---|
| Technische Bootstrap-Statistik | 3 unabhängige Browserprozesse | Intervall technisch berechenbar, nicht performance-gate-fähig |
| Standard-Performance-Zelle | 5 unabhängige Browserprozesse je Kandidat, Szenario und Hardwarezelle | Minimale reguläre Performancepopulation |
| Warm-Measurement | 30 Messiterationen je Standardzelle | Mindestzahl messberechtigter Messiterationen |
| Cold | 10 frische Browserprozesse | Cold-Start-Population, jede Beobachtung aus neuem Prozess |

Falls der BR03-Plan höchstens fünf Messiterationen pro Prozess vorsieht, muss er mindestens sechs Prozesse planen, um 30 Messiterationen zu erreichen. Die Fünf-Prozess-Regel allein reduziert die 30-Iterations-Regel nicht.

BR04 weist Populationen neutral als `below-technical-floor`, `technical-only` oder `standard-cell` aus. Die Kategorien sind keine Gate-Urteile. Spätere Hardwarekalibrierung oder BR06 darf strengere Mindestwerte verlangen, aber niemals diese historischen Laufdaten nachträglich umetikettieren.

## 12. AJV und Abhängigkeiten

- BR01 darf ausschließlich `ajv@8.20.0` als exakte `devDependency` hinzufügen.
- Das Caret- oder Tilde-Präfix ist verboten.
- AJV-Imports sind nur in Validator-, Schema-Test- und Testhilfsmodulen erlaubt.
- Produkt- und Benchmark-Laufzeitcode darf AJV nicht importieren oder bundeln.
- BR02, BR03 und BR04 dürfen keine neue Abhängigkeit hinzufügen, sofern nicht ein späterer, ausdrücklich akzeptierter Änderungsentscheid dies autorisiert.
- `package-lock.json` darf in BR01 nur durch die exakte AJV-Aufnahme und deren tatsächliche transitive Auflösung geändert werden.

## 13. SHA- und Übergabevertrag

### BR01

- Exakte Basis: `c64aeef1f51dd0ed2d8431411cf3ba1e84195b9d`
- Vor Start muss `origin/integration/voxel-kernel-lab-v1` exakt auf diesen SHA zeigen.
- Abweichung bedeutet `NO_GO`.

### BR02 bis BR04

Jeder Prompt enthält einen einzelnen Platzhalter `<ACCEPTED_BR0N_INTEGRATION_SHA>`. Vor Start muss der Owner den konkreten 40-stelligen SHA des akzeptierten, fast-forward integrierten Vorgängers einsetzen. Anschließend muss der Remote-Integrationsbranch exakt diesen Wert liefern.

Verboten sind:

- Ableiten vom Implementierungsbranch des Vorgängers,
- Verwendung eines Review-SHA ohne akzeptierte Integration,
- `latest`, Datum, Tag, Kurz-SHA oder Branchname als Basisersatz,
- Merge durch Implementierer oder Reviewer,
- automatischer Start des Nachfolgepakets.

Nach jedem Paket gilt:

1. Implementierer committet und pusht nur seinen Paketbranch.
2. Ein unabhängiger Reviewer prüft den exakten Kandidaten gegen den exakten Vorgänger-SHA.
3. Bei `FIX_REQUIRED` arbeitet derselbe Implementierer auf demselben Branch nach.
4. Der unabhängige Review wird vollständig wiederholt.
5. Nur ein Owner darf nach `ACCEPT` fast-forward integrieren.
6. Der verifizierte neue Remote-Integrations-SHA wird zur einzigen Basis des Nachfolgers.

## 14. Unveränderliche Schutzbereiche

Für BR01 bis BR04 sind unveränderlich:

- `tests/contracts/wp02FixtureGolden.ts`
- `tests/contracts/wp03GreedyGolden.ts`
- `tests/contracts/wp04AoGolden.ts`
- `evidence/wp01/**`
- `evidence/wp02/**`
- `evidence/wp03/**`
- `evidence/wp04/**`

Jede Implementierung und jeder Review muss die Dateiliste und SHA-256-Digests der vorhandenen Schutzbereiche vor und nach dem Paket vergleichen. Keine Evidenz-Generierung darf ausgeführt werden. Evidence-Skripte dürfen nicht geändert werden.

WP04-Timings bleiben ausdrücklich `diagnostic only; not a benchmark gate`. Sie dürfen nicht als BR-Baseline, Regressionsschwelle, Metriksample, Hardwarekalibrierung oder Leistungsnachweis übernommen werden. Die akzeptierten WP02-, WP03- und WP04-Goldens sind Vertragsevidenz, keine Trainingsdaten für eine Benchmarkgrenze.

## 15. Nachweis- und Hygieneanforderungen

Jeder Paketbericht muss enthalten:

- exakten Basis-SHA und Kandidaten-SHA,
- Branchname und Remote-Branchname,
- `git status --short` vor und nach der Arbeit,
- vollständige geänderte Dateiliste,
- Testergebnisse mit ausgeführten Befehlen und Zählungen,
- klare Kennzeichnung nicht anwendbarer Gates,
- Schutzbereich-Digestvergleich,
- Bestätigung, dass keine Evidence-Skripte liefen,
- Dependency-Diff,
- bekannte Restgrenzen,
- Bestätigung `kein Merge` und `kein automatischer Start des Nachfolgers`.

Erfundene Browser-, GPU-, Hardware- oder Erfolgsnachweise sind verboten. Nicht ausgeführte Tests werden als `NOT_RUN` oder begründet `NOT_APPLICABLE` dokumentiert, niemals als bestanden.

## 16. Offene Owner-Bindungen

Die exakten H2- und H3-Gerätebindungen, Refresh-Rate, Power-Policy und weitere reale Labordetails bleiben Owner-Entscheidungen. Sie blockieren nicht die Implementierung der BR01- bis BR04-Verträge mit synthetischen Fixtures und ungebundenen logischen Profilen. Sie blockieren reale Standard-Performance-Gates. Eine ungebundene Zelle muss `measurementEligible: false` bleiben.

## 17. Konfliktauflösung

| Ausgangskonflikt | Normative Auflösung |
|---|---|
| Pflichtstrings gegen reale Nichtverfügbarkeit | Alle Felder vorhanden, gemeinsame Availability-Union, keine Sentinelwerte |
| Flache BR01-Samples gegen BR04-Hierarchie | Genau eine Hierarchie bis zum Sampleereignis |
| Mehrere Besitzer der Orchestrierungs-IDs | BR01 definiert, BR03 erzeugt, BR02 trägt, BR04 konsumiert |
| Informelle Validierungsquittung | Formaler BR01-Vertrag mit selbstexkludierendem Digest |
| Telemetrieexport ohne Rohsample-Abbildung | Reiner deterministischer BR02-Adapter gegen BR01-Register |
| Mehrere Capability-Statusmodelle | Eine BR01-Union für alle Pakete |
| `warm-measurement` als Phase und Prozess | Prozesscontainer und Samplephase getrennt |
| Metrikregister erst in BR04 | BR01 ist alleiniger Eigentümer |
| Mindestens 3 gegen mindestens 5 Prozesse | 3 technisch, 5 Standard-Performance-Zelle |
| Globaler 10-Prozent-Wert | Kein Default, nur explizite per-Metrik-Werte oder `null` |
| AJV-Nutzung | Exakt 8.20.0, nur dev, keine Runtime-Bündelung |
| Paketlokale Vertragstypen | Keine Schattenverträge, nur Imports vom Eigentümer |
| Ungenaue Paketbasis | Exakter 40-stelliger Vorgänger-Integrations-SHA |
| WP04-Zeitwerte als Performancebeleg | Ausschließlich Diagnose, nie Gate oder Baseline |
| Schutz früherer Evidenz | Goldens und Evidenz bleiben byteidentisch |

## 18. Abschluss

Die Synthese ist konfliktfrei und implementierbar. BR01 darf erst nach formaler Annahme dieses C08-Vertrags gestartet werden. BR02, BR03, BR04 und WP05 bleiben bis zur jeweils akzeptierten und verifizierten Vorgängerintegration gesperrt.

Abschlussstatus: `READY_FOR_LATER_IMPLEMENTATION`
