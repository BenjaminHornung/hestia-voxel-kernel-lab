# BR04 benchmark aggregator v1

Scope-begrenzte Implementierung nach `BR04_IMPLEMENTATION_PROMPT.md`,
dem BR04-Abschlussbericht (`BR04_Benchmark_Aggregator_Abschlussbericht_2026-08-12.md`,
Status `REQUIRES_ADDITIONAL_RESEARCH`), den Crosswalk-Regeln aus Paket
P-BR04-XWALK-SPEC (Paket-Kern; der volle CROSSWALK_V1-Text lag diesem
Paket nicht vor) und den methodischen Grenzen aus dem Architektur-Audit
(Abschnitt 9, Anhang A BR04-Ergänzung; die Auditdatei war im
Arbeitsverzeichnis nicht auffindbar, es gelten der Paket-Kern und der
BR04-Bericht).

Keine Dashboards, keine Statistikframeworks, keine Generatorplattformen.
Keine Gate-, Winner-, Pass-/Fail- oder Regressionslogik (`decision: null`,
`automaticDecision: "forbidden"`).

## Module

- `src/benchmark/aggregate/br04ContractV1.ts` — §8-Vertragstypen.
- `src/benchmark/aggregate/br04StatisticsV1.ts` — Nearest-rank-Quantile,
  xoshiro128\*\*-32-v1 (aus der dokumentierten Algorithmusspezifikation
  neu geschrieben), Seed-Bindung, Rejection-Sampling, hierarchische
  Bootstraps, Paar-Schätzer, Effekt-Relationen, Anzeigeformat.
- `src/benchmark/aggregate/br04CrosswalkV1.ts` — dünner versionierter
  Adapter von eingefrorenen BR01-/BR03-Typen auf die §8-Projektionen.
- `src/benchmark/aggregate/br04AggregateV1.ts` — Validierung, Gruppierung,
  Ledger, Paarung, Claims, Digests.
- `src/benchmark/reports/br04MarkdownReportV1.ts` — reines Reportmodell
  plus reiner Renderer (keine Neuberechnung).

`MetricRegistryV1` und Digest werden aus BR01 importiert
(`BENCHMARK_METRIC_REGISTRY_V1`); eine lokale `metricRegistry.ts` mit
erneut definierten Registrydaten existiert nicht. `practicalEffectDelta`
wird pro Metrik angezeigt, `null` bleibt `null`; es gibt keinen globalen
Default.

## Crosswalk (versioniert, v1)

| Eingefroren (Eigentümer) | Projektion | Regel |
|---|---|---|
| `RunPlanProcessUnitV1.ids.*` (BR03) | `PlannedRunSlotV1.*` | Verbatim, keine Umdeutung |
| `unit.balanceBlockId` (BR03) | `slot.balanceBlockId` | XW-Block-01: explizites Feld, bindet Paar-Scope und gepaarten Bootstrap |
| `unit.ids.pairCellId/pairOrdinal` (BR03) | `slot.pairCellId/pairOrdinal` | Verbatim; `bootstrapClusterId` ist nie Paar-Kriterium |
| `referenceCandidateId`, `comparisonMode` (BR03-Plan) | Arm-Ableitung | reference/comparison/unpaired; heuristisches Nachpaaren verboten |
| `run.execution.order.*`, `run.ids.*` | Slot-Bindung | Kandidat- und Block-Gleichheit fail-closed geprüft |
| `run.hardwareCellId` | `environmentCellId` | XW-Cell-01: v1 bindet die Umgebungszelle an die BR03-Hardwarezelle; die volle §6.1-Schlüsselzerlegung ist Owner-Arbeit |
| fehlender Slot | `environmentCellId: unobserved:<slotId>` | XW-Cell-02: nur Ledger, nie gruppiert |
| fehlender Slot, Phase | Container-Abbildung | XW-Phase-02: cold→cold, warm-measurement→measurement, stress/trace/leak direkt |
| `scenarioParameters seed ?? orderSeed` | `workloadSeed` | XW-Seed-01: beides BR03-eigene explizite Werte |
| Warmup-Iterationen/Samples | ausgeschlossen | XW-Phase-01: Warmup ist für keine v1-Metrik aggregierbar; Runs bleiben im Ledger |
| `MetricDefinitionV1` (BR01) | §8-Metrikprojektion | §12.2-Richtlinientabelle für die 15 analytischen Refs; sonst dokumentierter Fallback |
| `BenchmarkValidationReceiptV1` | Receipt-Bindung | Status-, Digest-, Plan- und Registry-Gleichheit fail-closed |
| `measurementEligibilityReasons` | Basis-Disposition | Klassifizierung nach Reason-Klasse (XW-Disp-01), nicht nach Behauptung |
| `declaredRuleId` (Harness) | Regelbindung | XW-Rule-01/02: eingefrorene Runs tragen keine Regelreferenz; ohne passende vorab deklarierte Regel ist eine Infra-Behauptung `UNDECLARED_INVALIDATION_CODE` |
| `fixture.semanticSha256 ?? sourceFileSetSha256` | `fixtureDigest` | XW-Fixt-01: beobachteter Wert, sonst fatal |
| `syntheticHardwareProfile` (BR03-Plan) | `inputProvenance` | XW-Synth-01: synthetische Fixtures sind strikt ineligible für Performance-Claims |

## Paarungs- und Clusterregeln (Paket-Kern)

- Absolute CIs: äußere Bootstrap-Einheit sind Browserprozess-Cluster
  (`browserProcessId` = ein BR03-Bootstrap-Cluster je Prozess).
- Gepaarte CIs: äußere Einheit sind `balanceBlockId`-Blöcke; innen werden
  vollständige Pair Cells mit gemeinsam gehaltenen Armen resampled.
- Paar-Identität ist `(balanceBlockId, pairCellId, pairOrdinal)`.
  Paarung aus Reihenfolge, Zeit oder Sample-Ähnlichkeit ist verboten.
- Unvollständige Pair Cells erzeugen kein Ratio/keine Differenz; der
  gültige Gegenlauf bleibt im unpaired Summary; kein Ersatzpaaren.

## Synthetische Fixtures

Alle mitgelieferten Fixtures sind synthetisch. Aggregate aus
synthetischen Eingaben tragen
`performanceClaimEligibility: ineligible-synthetic-fixture`; der
Markdownbericht verweigert numerische Performance-Claims explizit.
Numerik in Tests verifiziert den Aggregationsvertrag, nie Leistung.

## Methodische Grenzen (Audit/Paket)

- Keine Ausreißer-Löschung, kein Winsorizing, kein Trimming.
- Frames/Events eines Prozesses sind keine unabhängigen Samples.
- p99 erst ab 1000 kompatiblen Events, sonst `insufficient-samples`.
- Populationen: <3 Prozesse `below-technical-floor`, 3–4
  `technical-only`, ≥5 plus Minima `standard-cell` (30
  Measurement-Iterationen; cold 10 frische Prozesse).
- Hardware H1 ist keine Mainstream-Untergrenze (Kalibrierung ist
  Owner-Arbeit; ungebundene Zellen bleiben `measurementEligible: false`).

## Verwendung

```ts
import { crosswalkToBundleV1 } from './src/benchmark/aggregate/br04CrosswalkV1';
import { validateAndAggregateBundleV1 } from './src/benchmark/aggregate/br04AggregateV1';
import { buildReportModelV1, renderMarkdownReportV1 } from './src/benchmark/reports/br04MarkdownReportV1';

const { bundle, issues } = crosswalkToBundleV1(input);
if (bundle === null) throw new Error(JSON.stringify(issues));
const { validation, aggregate } = validateAndAggregateBundleV1(bundle);
if (aggregate === null) throw new Error(JSON.stringify(validation.issues));
const markdown = renderMarkdownReportV1(buildReportModelV1(aggregate));
```

Prüflauf: `npm run benchmark:aggregate:verify` (reine Node-Unit-Tests,
keine Browser-/Hardware-Benchmarks).

## Offene Lücken (nicht erfunden, als offen markiert)

- Voller CROSSWALK_V1-Text und Research Synthesis / Decision Log lagen
  nicht vor (Berichtstatus `REQUIRES_ADDITIONAL_RESEARCH`, O1/O3).
- Auditdatei `WELTRAUM_ARCHITEKTUR_AUDIT_2026-09-06.md` war im
  Arbeitsverzeichnis nicht auffindbar; umgesetzt wurde der Paket-Kern.
- Owner-Entscheidungen O2 (akzeptierter BR03-SHA als Integrationsbasis),
  O4 (produktweite Δ-Bindung) und O5 (Gate-Mindestcluster) sind offen;
  v1 nutzt pro-Metrik-Registrywerte und die 3/5-Regeln ohne Gatewirkung.
- Feinere Zeitblock-Tags unterhalb der Iterationsebene werden in v1 als
  ganze Iterationen resampled (BL-01); `pairingKeySuffix` wird
  aufgezeichnet, die Punktschätzer folgen §9.6 auf Run-Scalar-Ebene.

## R2-Fixes (P-BR04-FIX, Audit B1–B6, Evidence `br04-fixes-r2.md`)

- XW-Name-01: einzige versionierte Namensgrenze Registry↔Samples
  (`memory-kind`→`memoryKind`, `observation-window-id`→`observationWindowId`,
  `stale-reason`→`staleReason`, `drop-kind`→`dropKind`,
  `checkpoint-id`→`checkpointId`); BR01-Verträge unverändert.
- Kompatibilitätsschlüssel für absolute Zellen und Paarung:
  Umgebung, Phase, Kandidat, Szenario + Version, Workload-Seed,
  Source-Tree/Build/Fixture, Umgebungs-Fingerprint, metrische
  Tag-Signatur aus `groupByTags`. Die Hardwarezelle allein genügt nicht.
- Crosswalk projiziert den dokument-eingebetteten Run (kanonische
  Gleichheit, sonst `RUN_DOCUMENT_MISMATCH`) und prüft fail-closed:
  Run-/Sample-Bindung, Szenario, Eligibility, Statistikpolicy-Konstanten.
- Paarung plan-first über `(balanceBlockId, pairCellId, pairOrdinal)`;
  Missing-Slots → `incomplete-pair` mit Ursachen, Gegenlauf deskriptiv,
  kein Ersatzpaaren; Dispositionen per Tripel, nicht per `pairCellId`.
- Difference/Ratio getrennt (eigene Streams, eigene Status); Ratio-Unit
  `ratio`; `eligible-measured` nur bei messfähigem Bestand;
  ECDF/`run-dotplot`/`ci-forest` deklarieren `includesAllValidPoints: false`.
- `aggregatorSourceDigest` ist ein Methoden-Label-Hash (kein Byte-Hash);
  der Umgebungs-Fingerprint bindet den vollen Schlüssel.
