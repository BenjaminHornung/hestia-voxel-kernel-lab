# BR04 R3 Fix-Evidence (Paket P-BR04-FIX2: B2-Rest, B3-Rest, Ratio-Mindestcluster, B6-Folgen)

- Basis: `agent/br-04-benchmark-aggregator` @ `be054acc995241e72d0666466df2d5adbe682736` (verifiziert: HEAD + clean vor Arbeitsbeginn)
- Worktree: `C:\IFI_SourceCode\Temp\hestia-voxel-kernel-lab\.worktrees\br04-fixes` (derselbe Branch, nur lokal, kein Push)
- Autoritative Quelle: Paketvorgabe P-BR04-FIX2 mit je Repro + Korrekturvorgabe. Abweichung: Das referenzierte
  "dritte Audit, Abschnitt 7" lag in den zugaenglichen Upload-Verzeichnissen nicht vor (vorhanden: nur
  `WELTRAUM_IMPLEMENTIERUNGS_AUDIT_2026-09-08.md` mit B1-B6 in Abschnitt 4 sowie das aeltere Architektur-Audit).
  Stattdessen wurden die praezisen Paket-Repros als autoritativ verwendet (je failing-first belegt).
- Regressionen laufen echte Vertragsfixtures (reale `BENCHMARK_METRIC_REGISTRY_V1`, reale Szenario-IDs,
  Kebab-Case-Dimensionen, dokument-eingebettete Runs, jetzt mit echt nachberechneten Dokument-Digests) durch
  **Crosswalk -> Aggregator -> Report**.

## Befund -> Fix -> Test

| Befund | Fix (Datei) | Regressionstest |
|---|---|---|
| B2-Rest: Samples INNERHALB eines Runs mit verschiedenen Tags (js-heap=1 vs embedder-heap=1000) landeten in EINER Population (kombinierte Tag-Signatur, gepoolte Skalare), auch in der Paarung | `br04AggregateV1.ts`: `tagPartitionKeyV1()` (volles metrisches Tag-Tupel) + Partitionierung je Run in `groupCellDataV1` (Run-/Iterationshierarchie je Population erhalten; Single-Partition-Faelle behalten Legacy-Keys/Digests); Paarung pro Partition in `buildPairedComparisonsV1` (`armPartitionMapV1`, Partitionssatz-Gleichheit sonst `group-tags-diverged`, `comparisonId`-Suffix nur bei echtem Split); Bootstrap folgt automatisch pro Vergleich | `br04-same-run-partition.test.ts` / R3 (4 Tests: zwei Populationen Maxima 1/1000, Hierarchie je Population, Paar-Divergenz, Paar-pro-Partition mit Differenzen 2/200) |
| B3-Rest: konsistente Dokumentmutation (5->12345) unter staler Receipt akzeptiert, da nur Caller-Digeststrings verglichen wurden; Bundlefaelle (manifestDigest, dirty-als-gueltig, Kandidat-vs-Slot, Validator-Digest, resamples=7) an der oeffentlichen Grenze nicht geprueft; R2-Fixtures mit Fake-Digests/Typcasts | `br04CrosswalkV1.ts` `projectRunV1`: kanonischen Dokument-Digest mit BR01-Kanonisierer nachberechnen und gegen beobachteten Digest (`DOCUMENT_DIGEST_MISMATCH`) und Receipt (`RECEIPT_DIGEST_MISMATCH`) binden. `br04AggregateV1.ts` `validateAndAggregateBundleV1`: `BOOTSTRAP_POLICY_INVALID` (inkl. resamples), `SOURCE_CONTRACT_CONFLICT` (acceptedBr03Sha), `VALIDATOR_MISMATCH`/`VALIDATOR_DIGEST_MISMATCH`, `SOURCE_DIRTY_MISMATCH` (dirty+valid), `SLOT_CANDIDATE_MISMATCH`, `MANIFEST_DIGEST_MISMATCH` (nachberechnet). Fixtures: `r2EntryV1` + xw-`frozenRunV1` mit echten `sha256OfCanonicalV1(document)`-Digests statt Fake-Strings | `br04-receipt-binding.test.ts` / R3 (6 Tests, alle failing-first: Doku-Mutation, manifestDigest, dirty, Kandidat, Validator, resamples=7); bestehende R2-B3-Tests weiter gruen |
| Ratio-Mindestcluster: Minimum nur VOR Ratio-Filterung geprueft (3 Bloecke Ref [1,0,0]/Cand [2,2,2] -> Ratio ok statt insufficient-clusters) | `br04StatisticsV1.ts` `bootstrapPairedV1`: Mindestzahl NACH Filterung auf positive Cluster erneut pruefen (Differenz bleibt ok, Ratio `insufficient-clusters` mit TopLevelClusters=1) | `br04-ratio-minimum.test.ts` / R3 (Statistik- + Bundle-Ebene, je failing-first) |
| B6-Folgen: nur Nullref-Ratio-Golden; Populationen nur per Fingerprint identifizierbar | `br04ContractV1.ts`: `populationLabel` auf `Br04MetricCellV1` + `Br04PairedComparisonV1`; `br04AggregateV1.ts`: `populationLabelV1()` (Szenario@Version/Seed/Tags); `br04MarkdownReportV1.ts`: `population`-Spalten in Summary/Comparison | `br04-ratio-seed-golden.test.ts` / R3 (positiv variierend 10/20/40 vs 12/18/44: eigene Ratio-Streams, Unit ratio, Geomean 1.059104500597819, Pin `sha256:86529f51...8044b1530`; Label-Asserts auf Zellen, Vergleichen, Report) |
| Golden-Digest | `h01AggregateDigest` erneuert -> `sha256:442f74d270f3f8e1aabea91f9def1972275786c8f41a1848031398f71dbd3328` (Fixture unveraendert, nur fixierter Vertragsinhalt: Partitionierung/Labels; H02-Determinismus weiter byte-identisch) | `br04-hierarchy-bootstrap.test.ts` H02 gruen |

## Bewusst nicht geaendert (Owner-Sache / kein Repro)

- Gate-Allowlist-Test (Scopeguard): keine Allowlist-/Gate-Aenderung. Folge: der Test meldet genau die vier neuen
  R3-Testdateien (plus spaeter diese zwei Evidence-Dateien) als Owner-Allowlist-Punkt (Praezedenz: R2-Amendment `a3e540c`).
- `predeclared-time-blocks` = Iterations-Resampling, Pair-Cell-Kollisionen jenseits Tripel-Identitaet: wie R2 ohne
  separaten Repro nicht angeruehrt.
- Kein Push/PR/Merge/Rebase/Amend/Reset; kein `gate:br03`; kein E2E/Browser/Hardware.

## Befehle (Exitcodes)

- `tsc --noEmit` -> PASS (Exit 0)
- `vitest run tests/unit/benchmark/aggregate` -> 15 Dateien / 101 Tests PASS
- `vitest run` (voll) -> 918/919 PASS; einziger Fail: `br03-gate-allowlist-v1.test.ts`, ausschliesslich wegen der
  neuen R3-Dateien (Owner-Allowlist ausstehend, Praezedenz R2)
