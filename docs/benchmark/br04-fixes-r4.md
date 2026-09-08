# BR04 R4 Fix-Evidence (Paket P-BR04-FIX3: einheitlicher Populationskey + nachpruefbare Bundle-Bindung)

- Basis: `agent/br-04-benchmark-aggregator` @ `ac6712e6a01c9586fdd8e8d92c2a7a8c3ebc5bb8` (verifiziert: HEAD + clean vor Arbeitsbeginn)
- Worktree: `C:\IFI_SourceCode\Temp\hestia-voxel-kernel-lab\.worktrees\br04-fixes` (derselbe Branch, nur lokal, kein Push)
- Autoritative Quelle: Fokusaudit 08.09.2026, Abschnitte 2-3, als je Repro + Korrekturvorgabe in der Paketstellung
  (je failing-first belegt: 3 neue Tests scheitern pre-Fix, bestehen post-Fix).
- Regressionen laufen echte Vertragsfixtures (reale `BENCHMARK_METRIC_REGISTRY_V1`, reale Szenario-IDs,
  Kebab-Case-Dimensionen, dokument-eingebettete Runs mit echt nachberechneten Dokument-Digests) durch
  **Crosswalk -> Aggregator -> Report**.

## Befund -> Fix -> Test

| Befund | Fix (Datei) | Regressionstest |
|---|---|---|
| Abschnitt 2, einheitlicher Populationskey: `groupCellDataV1` ergaenzte den Gruppenschluessel nur bei `partitions.size > 1` um den Partitionkey (`split`-bedingtes `compatTag`); vergleichbar bedingte Identitaeten in der Paargruppierung (`split`-bedingter Gruppenkey-Anteil, `:tag=`-Suffix nur bei Split). Folge: Run 1 (js-heap=1 + embedder-heap=1000) + Run 2 (js-heap=2) ergaben 3 statt 2 Populationen; gemischte und einfache Runs derselben Population gruppierten auseinander, auch gepaart | `br04AggregateV1.ts`: `compatTag` IMMER `${ref} ${signature} ${partitionKey}` aus derselben kanonischen Projektion (Metrik + volles beobachtetes Tag-Tupel); `partitionKey` immer gesetzt (Typ `string`, `runScopeId`/`pooledScopeId` immer mit Key); Paargruppen ohne `split`: Gruppenkey immer mit `partitionKey ?? ''`, `comparisonId`-Suffix immer bei beobachteter Partition. `canonicalGroupKey` (Bootstrap-Seed) unveraendert, da die Signatur bereits partitionsgenau ist | `br04-same-run-partition.test.ts` / R4 (2 Tests, je failing-first: absolut gemischt+einfach -> 2 Populationen, js-heap nRuns=2 Maximum=2; gepaart gemischte + einfache Pair-Cells -> 2 Vergleiche, js-heap-Vergleich pairs.complete=2 statt Split-Duplikat) |
| Abschnitt 3, nachpruefbare Bundle-Bindung: gueltiges Bundle ueber Crosswalk erzeugen, DANACH projizierten Messwert 5->12345 aendern, nur Container-/Manifesthash konsistent neu berechnen (Receipt/Quelldigests unveraendert) -> `validateAndAggregateBundleV1` direkt beliefert lieferte `valid` mit Maximum=12345, da die Projektion an keine validierte Bindung geknuepft war | `br04ContractV1.ts`: `br01ValidationReceipt.validatedProjectionDigest` (Pflichtfeld, mit Vertrauensgrenzen dokumentiert). `br04CrosswalkV1.ts` `projectRunV1`: Digest ueber die projizierte `run` mit demselben Kanonisierer berechnen und einbetten. `br04AggregateV1.ts` `validateAndAggregateBundleV1`: Digest aus der tatsaechlichen Projektion nachberechnen, Mismatch -> `PROJECTION_DIGEST_MISMATCH` (fail-closed; nicht-kanonische Inhalte meldet weiter `CANONICAL_SERIALIZATION_FAILED`). `br04FixtureBuildersV1.ts`: synthetische Builder binden ihre Projektion identisch. Hinweis: synthetischer API-Grenztest, kein Produktions-Manipulationsnachweis (vollstaendig konsistente Neufaelschung aller Digests bleibt ausserhalb des Bedrohungsmodells; Vertrauensgrenze ist direkt konsumierter Crosswalk-Output) | `br04-receipt-binding.test.ts` / R4 (1 Test, failing-first: Crosswalk-Bundle 5->12345 + Manifest-Neuberechnung -> `invalid`, Aggregat null, `PROJECTION_DIGEST_MISMATCH`, Maximum 12345 erscheint nie) |
| Golden-Erneuerung (Fix-Folge, kein Befund) | Fixtures unveraendert; nur fixierter Vertragsinhalt verschiebt Digests: `h01AggregateDigest` -> `sha256:f7d229a5aa1855779613bcac4e70d2a3dcc912ba24c65e3876fd13dadd4e4234` (einheitliche Keys + Receipt-Feld); Ratio-Seed-`replicateVectorDigest` -> `sha256:45c1e8d01ae08264f1c4e384d4f7fa2dedfdf9a1ffbb521095d442cb326ed880` (seedabhaengig, bekannte Antwort 1.059104500597819 unveraendert). B6-Differenz-Pin stabil (konstante Differenzen, seedunabhaengig); H02-Determinismus weiter byte-identisch | `br04GoldenDigestsV1.ts` (R4-Vermerk), `br04-ratio-seed-golden.test.ts` (R4-Vermerk), `br04-hierarchy-bootstrap.test.ts` H02 gruen |

## Bewusst nicht geaendert (Owner-Sache / kein Repro)

- Gate-Allowlist-Test (Scopeguard): keine Allowlist-/Gate-Aenderung. R4 legt KEINE neuen Testdateien an (neue Tests in
  bestehenden Dateien); neu sind nur diese zwei Evidence-Dateien. Folge: der Test meldet die sechs R3-Pfade plus diese
  zwei R4-Evidence-Dateien als Owner-Allowlist-Punkt (Praezedenz: R2-Amendment `a3e540c`).
- `canonicalGroupKey` (Bootstrap-Seed-Material) unveraendert: die Signatur ist bereits partitionsgenau; kein Repro fuer
  Seed-Kollisionen bei nicht-groupBy-Tag-Differenzen.
- Partitionsmengen-Divergenz zwischen Armen (`group-tags-diverged`) unveraendert: kein Repro, der partielle
  Partitions-Paarung verlangt.
- Kein Push/PR/Merge/Rebase/Amend/Reset; kein `gate:br03`; kein E2E/Browser/Hardware.

## Befehle (Exitcodes)

- `./node_modules/.bin/tsc --noEmit` -> PASS (Exit 0)
- `npm run benchmark:aggregate:verify` -> 15 Dateien / 104 Tests PASS (inkl. 3 neuer R4-Tests)
- `npm test` (voll) -> 921/922 PASS; einziger Fail: `br03-gate-allowlist-v1.test.ts`, ausschliesslich wegen der
  sechs R3-Pfade plus der zwei neuen R4-Evidence-Dateien (Owner-Allowlist ausstehend, Praezedenz R2)
