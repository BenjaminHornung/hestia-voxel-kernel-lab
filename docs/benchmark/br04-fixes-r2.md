# BR04 R2 Fix-Evidence (Paket P-BR04-FIX, Befunde B1–B6 + Metadaten/Ledger)

- Basis: `agent/br-04-benchmark-aggregator` @ `a3e540ce1a8558f1810b273d2c395996aadc774d` (verifiziert: HEAD + clean vor Arbeitsbeginn)
- Worktree: `C:\IFI_SourceCode\Temp\hestia-voxel-kernel-lab\.worktrees\br04-fixes` (derselbe Branch, nur lokal, kein Push)
- Autoritative Quelle: Audit `WELTRAUM_IMPLEMENTIERUNGS_AUDIT_2026-09-08.md`, Abschnitt 4 (vollständig gelesen) + BR04-Abschlussbericht §§6.1–6.3, 9.7, 9.9, 11 (über `origin/docs/br01-source-pack-v1`)
- Regressionen laufen echte Vertragsfixtures (reale `BENCHMARK_METRIC_REGISTRY_V1`, reale Szenario-IDs, Kebab-Case-Dimensionen, dokument-eingebettete Runs) durch **Crosswalk → Aggregator → Report**

## Befund → Fix → Test

| Befund | Fix (Datei) | Regressionstest |
|---|---|---|
| B1: gültige BR01-Dimensionen (`memory-kind`, `observation-window-id`, `stale-reason`, `drop-kind`, `checkpoint-id`) als `REQUIRED_TAG_MISSING` verworfen | `br04CrosswalkV1.ts`: `BR04_DIMENSION_ALIAS_V1` + `normalizeDimensionKeyV1()` als **einzige** Namensgrenze (XW-Name-01); `groupByTags`/`pairingKeySuffix` laufen durch dieselbe Abbildung; BR01-Verträge unverändert | `br04-crosswalk.test.ts` / R2 B1: `memory.bytes@1` mit `memory-kind`/`checkpoint-id` wird akzeptiert, Tags `memoryKind`/`checkpointId`, Maximum 1048576 |
| B2: inkompatible Populationen in einer Zelle (nur Hardwarezelle + Phase + Kandidat) | `br04ContractV1.ts`: `Br04RunProjectionV1` + `scenarioId/scenarioVersion/workloadSeed/environmentFingerprint`; `br04CrosswalkV1.ts`: Szenario-Bindung + `environmentFingerprint = sha256(run.environment)`; `br04AggregateV1.ts`: `compatibilityKeyV1` (Env, Phase, Kandidat, Szenario, Version, Seed, Source-Tree/Build/Fixture, Env-Fingerprint, metrische Tag-Signatur aus `groupByTags`) für absolute Zellen **und** Paar-Gruppierung; Fingerprint hasht den vollen Schlüssel | `br04-crosswalk.test.ts` / R2 B2: Seeds 7/8 → 2 Zellen (Maxima 1/1000); Szenarien getrennt; `memory-kind` js-heap/embedder-heap getrennt; `br04-paired-golden.test.ts` / B2: Seed-Divergenz der Arme → incomplete mit `compatibility-key-diverged` |
| B3: `input.run`-Kopie ungebunden (Wert 5→12345 unter fremder Evidence akzeptiert) | `br04CrosswalkV1.ts` `projectRunV1`: Run wird aus dem validierten Dokument abgeleitet (kanonischer Digest-Vergleich, sonst `RUN_DOCUMENT_MISMATCH`); neu fail-closed: `RUN_BINDING_MISMATCH` (Receipt↔Run), `SAMPLE_BINDING_MISMATCH`, `SCENARIO_MISMATCH`, `SCENARIO_VERSION_MISMATCH`, `ELIGIBILITY_CONFLICT`, `BOOTSTRAP_POLICY_INVALID` (Methoden-/Seed-/PRNG-Konstanten) | `br04-crosswalk.test.ts` / R2 B3 (zwei Tests): Tamper-Repro + alle sechs Bindungsprüfungen |
| B4: fehlender Arm trennt das Paar (`unobserved:<slot>`) statt incomplete | `br04AggregateV1.ts` `buildPairedComparisonsV1` plan-first: Paar-Zellen aus Plan-Slots (Triple `balanceBlockId/pairCellId/pairOrdinal`), Kontext vom beobachteten Arm geerbt; Missing → `reference-/candidate-missing-or-invalid`, Divergenz → `environment-cell-diverged`/`phase-diverged`/`compatibility-key-diverged`/`group-tags-diverged`; Gegenlauf bleibt deskriptiv; kein Ersatzpaaren | `br04-paired-golden.test.ts` / B4 (Crosswalk-E2E): planned 1/complete 0/incomplete 1, Ref-Maximum 10, Ledger beidseitig `incomplete-pair`; `br04-validation-ledger.test.ts` / R2: `incompletePairs` mit Ursachen |
| B5: ungültiges Ratio killt gültige Differenz-CI (`no-data`) | `br04StatisticsV1.ts` `bootstrapPairedV1`: getrennte Replikat-Schleifen/Status für Difference (alle domänen-validen Paare) und Ratio (nur positive Paare); Aufrufer filtert zusätzlich per `checkDomainV1` (§9.9); leere Wertlisten → `scalar-unavailable`; Metriken ohne Messung erzeugen keine Vergleiche | `br04-paired-golden.test.ts` / B5: 3 Cluster, Ref 0/Cand 1 (`longtask.count@1`): Differenz-CI `ok` [1,1], Ratio `no-data` |
| B6: Ratio gibt `ratioDerived` an, nutzt aber `differenceDerived`; Ratio-Unit = Input-Unit | `br04StatisticsV1.ts`: Differenz zieht aus `differenceDerived.state`, Ratio aus `ratioDerived.state`; Ratio-Intervalle tragen Unit `'ratio'` | `br04-paired-golden.test.ts` / B6: Streams/Seed-Material verschieden, Unit `ratio`, Known-Answer `replicateVectorDigest = sha256:12d8ed70a040902b24b59ae42eefb205aaabef21414470f2678bf27e8ec1dd85` |
| Provenienz-Digest labelt statt zu binden | `aggregatorSourceDigest` per Kommentar als Methoden-Label-Hash deklariert (bindet Aggregat-Digest, nicht Bytes); `environmentFingerprintDigest` bindet jetzt den vollen Kompatibilitätsschlüssel | B2-Fingerprint-Asserts (2 verschiedene Fingerprints) |
| Ledger: `incompletePairs` leer, Disposition auf `pairCellId` reduziert | `Br04IncompletePairV1` + Details: `balanceBlockId/pairOrdinal/presentSlotIds/missingOrInvalidSlotIds/reasonCodes`; Dispositionen per Tripel-Schlüssel | `br04-validation-ledger.test.ts` / R2 + B4-Asserts |
| Claimstatus `eligible-measured` ohne Bestand | Nur bei ≥1 nicht-leerer Metric-Zelle, sonst `ineligible-no-valid-population` (neuer Union-Member); Report mit Hinweiszeile | `br04-markdown-report.test.ts` / R2-Metadaten-Test |
| ECDF `includesAllValidPoints=true` bei 3 Quantilen + Maximum | `ecdf`/`run-dotplot`/`ci-forest` → `false` (`paired-ratio` bleibt `true`); Vertragstyp zu `boolean` geweitet | derselbe R2-Metadaten-Test |
| Golden-Digest | `h01AggregateDigest` erneuert → `sha256:b584dc6c…5a7bfb8` (Fixture unverändert, nur fixierter Vertragsinhalt hat sich bewegt; Begründung im Fixture-Kommentar) | `br04-hierarchy-bootstrap.test.ts` H02 grün |

## Bewusst nicht geändert (Owner-Sache / kein Repro)

- Gate-Allowlist-Test (Scopeguard): keine Allowlist-/Gate-Änderung. Folge: der Test meldet genau die zwei neuen Evidence-Dateien dieses Pakets (siehe „Offen").
- `predeclared-time-blocks` = Iterations-Resampling (BL-01): dokumentierte Einschränkung, kein reproduzierter Fehler.
- Pair-Cell-Kollisionsfall über `pairCellId` hinaus: durch Tripel-Identität + Block/Ordinal in `incompletePairs` adressiert, kein separater Repro erfunden.
- Kein Push/PR/Merge/Rebase/Amend/Reset; kein `gate:br03`; kein E2E/Browser/Hardware.

## Befehle (Exitcodes)

- `npx tsc --noEmit` → PASS
- `npm run benchmark:aggregate:verify` → 11 Dateien / 87 Tests PASS (76 Basis + 11 neue R2-Asserts in allowlisted Dateien)
- `npm test` (voll) → siehe SUMMARY.json (`fullSuite`); einziger Fail: `br03-gate-allowlist-v1.test.ts`, ausschließlich wegen der zwei neuen Evidence-Dateien (Owner-Allowlist ausstehend, Präzedenz: Amendment `a3e540c`)
