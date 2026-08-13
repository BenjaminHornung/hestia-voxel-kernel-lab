# BR-01 Benchmark-Contracts und Provenienz - implementierungsreife Spezifikation

**Datum:** 2026-08-12  
**Repository:** `BenjaminHornung/hestia-voxel-kernel-lab`  
**Read-only Research-Basis:** `d95992df05952ac4be6221ca1809c1c9e3c0ac9d`  
**Implementierungsbasis:** noch nicht festgelegt; zwingend der später akzeptierte und integrierte WP04-SHA  
**Auftragsart:** Cloud-Planung und Reviewgrundlage, keine Implementierung  
**Abschlussstatus:** `READY_FOR_LATER_IMPLEMENTATION`

## 1. Ergebnis und Entscheidung

BR-01 ist nach akzeptierter WP04-Integration implementierbar, ohne offene P0- oder P1-Vertragsfrage. Das Paket besteht ausschließlich aus versionierten Datenverträgen, JSON-Schemata, enger Validierung, Source-/Build-Provenienz, kanonischer Serialisierung, Digestbildung, Scenario-Registry und zugehörigen Contract-Tests.

Verbindliche Entscheidungen:

1. `BenchmarkRunV1` verwendet JSON Schema Draft 2020-12 und einen gleichwertigen, engen TypeScript-Vertrag.
2. Alle äußeren Objekte sind geschlossen. Unbekannte Properties, unbekannte Versionen und unbekannte Enumwerte werden abgewiesen.
3. JSON-Artefakte im Evidence-Bundle werden nach RFC 8785 JCS serialisiert. Sie enthalten keine Pretty-Print-Whitespace und keinen abschließenden Zeilenumbruch.
4. Bundle- und Build-Digests verwenden SHA-256, eine versionierte Domain-Separation und längenpräfixierte Pfad-/Byteframes.
5. `bundle.sha256` ist die einzige Datei außerhalb des Bundle-Digest-Covers. Alle anderen regulären Dateien im Bundle müssen erfasst sein.
6. Ein Run bindet den tatsächlichen Commit, den Commit-Tree, einen nachweislich leeren Worktree-Status, Build, Fixture, Kandidat, Scenario, Environment und Runplan.
7. Ein pro Run berechneter `runBindingSha256` wird in jedem Sample wiederholt und semantisch nachgerechnet. Ein bloßes Umschreiben der Top-Level-Metadaten invalidiert damit die Samples.
8. Keine fehlende Capability oder Provenienz darf als `null`, leere Zeichenfolge, `0 ms` oder `0 bytes` erscheinen. Dafür gibt es diskriminierte Statusobjekte.
9. Es wird keine AJV-Runtime-Dependency eingeführt. `ajv@8.20.0` wird exakt gepinnt als Dev-Dependency empfohlen, ausschließlich für unabhängige Schema-/Fixture-Tests. Der Produkt-/Browserbundle-Pfad importiert AJV nicht.
10. BR-01 enthält keine Timinginstrumentierung, keine Browsersteuerung und keine Statistik.

## 2. Scope und Quellenstatus

### 2.1 Akzeptierte Projektentscheidungen

Vollständig ausgewertete Projektquellen: `WELTRAUM_PROJECT_INSTRUCTIONS_ADDENDUM.md`,
`WELTRAUM_PROJECT_MEMORY.md`, `WELTRAUM_RESEARCH_REGISTER.md`,
`WELTRAUM_RESEARCH_DECISION_LOG_2026-08-12.md`,
`WELTRAUM_RESEARCH_SYNTHESIS_2026-08-12.md`,
`07_benchmark_test_methodology_audit_report.md` und der aktuelle
`voxel-kernel-lab-wp04-agent-prompt.md`. Der WP04-Prompt dient nur der
Kompatibilität; er ist kein Beleg für einen bereits akzeptierten WP04-Stand.

- Decision D-004 akzeptiert Benchmark Protocol v1, Rohsample- und Provenienzregeln. Bestehende HUD-Zeiten bleiben Diagnostik.
- Decision D-005 setzt BR-01 bis BR-04 seriell zwischen WP04 und WP05.
- Die Synthese verlangt Repository-SHA, Build-Hash, Scenario, Browser, Hardware, Display und Energiezustand als Bindungen.
- Der aktuelle WP04-Agentenprompt verbietet den Beginn von BR-01 vor akzeptierter WP04-Integration und verlangt unveränderte WP02-/WP03-Goldens sowie unveränderte WP01-/WP03-Evidence.

Diese Punkte sind akzeptierte Projektwahrheit und keine neue Empfehlung dieses Berichts.

### 2.2 Commitgenaue Code-Evidence

Der geprüfte Commit ist [`d95992df05952ac4be6221ca1809c1c9e3c0ac9d`](https://github.com/BenjaminHornung/hestia-voxel-kernel-lab/commit/d95992df05952ac4be6221ca1809c1c9e3c0ac9d), Commitmessage `#VOXEL-LAB-003 Add deterministic greedy meshing comparison`.

Relevante Befunde:

- [`package.json`](https://github.com/BenjaminHornung/hestia-voxel-kernel-lab/blob/d95992df05952ac4be6221ca1809c1c9e3c0ac9d/package.json) verwendet exakte Dependency-Versionen, TypeScript 7.0.2, Vitest 4.1.10 und Node `^22.12.0 || >=24.0.0`. AJV ist nicht vorhanden.
- [`tsconfig.json`](https://github.com/BenjaminHornung/hestia-voxel-kernel-lab/blob/d95992df05952ac4be6221ca1809c1c9e3c0ac9d/tsconfig.json) ist strikt, enthält Node-Typen und erlaubt JSON-Module. Reine Contract-Typen können daher ohne DOM-/Three-Import implementiert werden.
- [`vitest.config.ts`](https://github.com/BenjaminHornung/hestia-voxel-kernel-lab/blob/d95992df05952ac4be6221ca1809c1c9e3c0ac9d/vitest.config.ts) erfasst nur `tests/unit/**/*.test.ts`. Ausführbare BR-01-Tests müssen deshalb unter `tests/unit/benchmark/` liegen. `tests/contracts/benchmark/` bleibt für unveränderliche Vektoren, nicht für Testdateien.
- [`src/main.ts`](https://github.com/BenjaminHornung/hestia-voxel-kernel-lab/blob/d95992df05952ac4be6221ca1809c1c9e3c0ac9d/src/main.ts) misst Fixture-, Halo- und Meshingdauer mit `performance.now()`. Diese bestehende Diagnostik wird von BR-01 weder importiert noch verändert.
- [`src/diagnostics/telemetry.ts`](https://github.com/BenjaminHornung/hestia-voxel-kernel-lab/blob/d95992df05952ac4be6221ca1809c1c9e3c0ac9d/src/diagnostics/telemetry.ts) aggregiert bereits p50/p95-Diagnostik. BR-01 darf sie nicht wiederverwenden, erweitern oder importieren.
- [`evidence/wp02/manifest.json`](https://github.com/BenjaminHornung/hestia-voxel-kernel-lab/blob/d95992df05952ac4be6221ca1809c1c9e3c0ac9d/evidence/wp02/manifest.json) enthält `basisSha` des Vorgängers, aber keinen tatsächlichen Source-Commit, Commit-Tree, Build-Digest, Schema-Identifier oder Bundle-Digest.
- [`evidence/wp03/manifest.json`](https://github.com/BenjaminHornung/hestia-voxel-kernel-lab/blob/d95992df05952ac4be6221ca1809c1c9e3c0ac9d/evidence/wp03/manifest.json) hat dieselbe Provenienzlücke. Seine Timingwerte sind korrekt als `diagnostic only` klassifiziert.
- Die vorhandenen Golden-Dateien [`wp02FixtureGolden.ts`](https://github.com/BenjaminHornung/hestia-voxel-kernel-lab/blob/d95992df05952ac4be6221ca1809c1c9e3c0ac9d/tests/contracts/wp02FixtureGolden.ts) und [`wp03GreedyGolden.ts`](https://github.com/BenjaminHornung/hestia-voxel-kernel-lab/blob/d95992df05952ac4be6221ca1809c1c9e3c0ac9d/tests/contracts/wp03GreedyGolden.ts) sind unversionierte Dateinamen mit versioniertem Inhalt nur bei WP02. BR-01 darf sie nicht umbenennen oder überschreiben.
- Das Repository besitzt am geprüften Commit keine LICENSE-Datei. Dieser Bericht übernimmt keinen Fremdcode.

### 2.3 Externe Primärquellen

- [JSON Schema Draft 2020-12](https://json-schema.org/draft/2020-12/) ist der verwendete Dialekt. Die veröffentlichten Core- und Validation-Spezifikationen datieren vom 16. Juni 2022.
- [RFC 8785 JCS](https://www.rfc-editor.org/rfc/rfc8785.html) definiert whitespacefreie JSON-Serialisierung, rekursive Property-Sortierung, ECMAScript-kompatible Primitive und UTF-8-Ausgabe. JCS verändert Unicode-Strings ausdrücklich nicht durch Unicode-Normalisierung.
- [NIST FIPS 180-4](https://csrc.nist.gov/pubs/fips/180-4/upd1/final) definiert SHA-256 als Secure Hash Algorithm.
- [`git status --porcelain`](https://git-scm.com/docs/git-status) ist laut Git-Dokumentation für Skripte stabil; `--untracked-files=all` erfasst einzelne ungetrackte Dateien und `--ignore-submodules=none` ignoriert Submodule nicht.
- [`<rev>^{tree}`](https://git-scm.com/docs/gitrevisions) dereferenziert einen Commit zu seinem Tree-Objekt.

### 2.4 Technische Inferenz und Sicherheitsgrenze

Die nachfolgenden Datenstrukturen, Digestframes und Pfadregeln sind projektspezifische technische Festlegungen. Sie werden aus den akzeptierten Zielen und den Primärquellen abgeleitet.

Ein Digest beweist Integrität nach seiner Veröffentlichung. Er beweist nicht, dass ein privilegierter, böswilliger Generator ehrliche Samples erfasst hat. Gegen absichtliche Neugenerierung gefälschter Bundles ist später eine externe, nicht vom Messagenten kontrollierte Attestation oder ein unveränderlicher Artefaktspeicher nötig. BR-01 schafft die dafür zu signierende Bindung, implementiert aber keine Attestation.

## 3. Exakter Ziel-Dateibaum

Keine dieser Dateien wird durch diesen Cloud-Auftrag angelegt.

```text
src/benchmark/
  contracts/
    versions.ts
    typesV1.ts
    scenarioRegistryV1.ts
    validateV1.ts
    index.ts
    schemas/
      benchmark-run-v1.schema.json
      benchmark-artifact-manifest-v1.schema.json
      benchmark-bundle-manifest-v1.schema.json
      benchmark-scenario-definition-v1.schema.json
  provenance/
    canonicalJsonV1.ts
    canonicalPathV1.ts
    fileSetDigestV1.ts
    sourcePreflightV1.ts
    bundleV1.ts
    index.ts

tests/contracts/benchmark/
  jcs-v1.golden.ts
  digest-v1.golden.ts
  scenario-registry-v1.golden.ts

tests/fixtures/benchmark/v1/
  positive/
    ... mindestens 17 JSON-Fixtures
  negative/
    ... mindestens 68 JSON-/Bundle-Fixtures
  bundles/
    valid-minimal/
    valid-mixed-artifacts/
    tampered-*/

tests/unit/benchmark/
  schema-v1.test.ts
  validation-v1.test.ts
  canonical-json-v1.test.ts
  bundle-digest-v1.test.ts
  source-preflight-v1.test.ts
  scenario-registry-v1.test.ts

docs/benchmark/
  benchmark-protocol-v1.md
  benchmark-bundle-digest-v1.md
  benchmark-scenario-registry-v1.md
  dependency-decision-v1.md

package.json
package-lock.json
```

Pfadbegründung:

| Pfad | Zweck und Grenze |
|---|---|
| `src/benchmark/contracts/` | Renderer-, DOM-, Clock- und Worker-neutrale Datentypen, Registry und enge semantische Validierung. |
| `schemas/` | Tatsächlich ausführbare, versionierte Draft-2020-12-Schemata. Keine Schemas als bloße Doku-Snippets. |
| `src/benchmark/provenance/` | JCS, Pfadnormalisierung, Source-Preflight und Digest. Keine Messung oder Browsersteuerung. |
| `tests/contracts/benchmark/` | Unveränderliche kanonische Bytes und erwartete Digests. Änderungen sind Golden-Änderungen. |
| `tests/fixtures/benchmark/v1/` | Positive und negative Nutzdaten getrennt von Testcode. `v1` wird bei v2 nicht überschrieben. |
| `tests/unit/benchmark/` | Ausführbare Vitest-Dateien innerhalb des bestehenden Include-Patterns. |
| `docs/benchmark/` | Menschlich reviewbare Normtexte. JSON-Schema und TypeScript bleiben trotzdem maschinelle Wahrheit. |
| `package*.json` | Ausschließlich exakte AJV-Dev-Dependency und ihr Lockfile-Diff. Keine Runtime-Dependency. |

`BenchmarkSourceProvenanceV1`, `BenchmarkEnvironmentManifestV1`,
`BenchmarkExecutionDescriptorV1` und `BenchmarkRawSampleV1` sind in v1 keine
eigenständigen Dateien. Sie sind geschlossene `$defs` des Run-Schemas und werden
nur als Teil von `BenchmarkRunV1` serialisiert. Ihre eigenen
`schemaVersion`-Literale erlauben spätere Extraktion oder Migration, ohne v1 still
umzudeuten. Artifact-, Bundle- und Scenario-Definition sind dagegen
eigenständige Dokumente und erhalten eigene Schemadateien.

Nicht zulässig in BR-01:

- Änderungen an `src/main.ts`, `src/diagnostics/telemetry.ts`, Renderer, Meshern oder Voxelzustand;
- Änderungen an `tests/contracts/wp02FixtureGolden.ts`, `tests/contracts/wp03GreedyGolden.ts` oder späteren WP04-Goldens;
- Änderungen unter `evidence/wp01/**`, `evidence/wp02/**`, `evidence/wp03/**` oder später `evidence/wp04/**`;
- neue E2E-Dateien, Browserrouten oder UI.

## 4. Versionierungsmodell

### 4.1 Literale Versionen

```ts
export type BenchmarkProtocolVersion = 'benchmark-protocol-v1';

export type BenchmarkSchemaVersionV1 =
  | 'benchmark-source-provenance-v1'
  | 'benchmark-scenario-definition-v1'
  | 'benchmark-environment-manifest-v1'
  | 'benchmark-execution-descriptor-v1'
  | 'benchmark-raw-sample-v1'
  | 'benchmark-run-v1'
  | 'benchmark-artifact-manifest-v1'
  | 'benchmark-bundle-manifest-v1';

export type BenchmarkDigestAlgorithmVersion =
  | 'hestia-benchmark-bundle-sha256-v1'
  | 'hestia-benchmark-build-sha256-v1'
  | 'hestia-benchmark-fileset-sha256-v1';
```

Regeln:

1. Unbekannte Protocol-, Schema-, Scenario- oder Digestversion ist ein Hard Fail.
2. Jede neue Property ist wegen `additionalProperties: false` eine Schemaänderung und erfordert eine neue Schemadatei.
3. Eine Änderung der Messsemantik, Phasen oder Vergleichbarkeit erfordert `benchmark-protocol-v2`.
4. Eine reine neue Dokumentform bei unveränderter Messsemantik kann `benchmark-...-v2` unter Protocol v1 verwenden, muss aber einen expliziten Migrationsvertrag besitzen.
5. Alte Schemas, Fixtures und Digestvektoren bleiben im Repository. Keine Datei mit `v1` wird inhaltlich zur Bedeutung von v2 umdefiniert.
6. Scenario-Semantikänderungen erzeugen eine neue Scenario-ID oder Scenario-Version. `mesh-golden-world-v1` bleibt für immer v1.

### 4.2 Golden-Governance

Eine Golden-Änderung ist nur zulässig als neue Datei oder neue explizite Version und benötigt:

1. alten und neuen Contract-Identifier;
2. semantische Begründung;
3. Diff der betroffenen Werte und Digests;
4. unveränderte unabhängige Oracle oder separat reviewte Oracle-Änderung;
5. unabhängige Freigabe;
6. `SUPERSEDES`-Eintrag in der Dokumentation, niemals stilles Überschreiben.

## 5. TypeScript-Vertrag v1

Der folgende Block ist der normative Typentwurf für `typesV1.ts`. Marken entstehen erst nach erfolgreicher Runtime-Validierung. Kein Typ importiert Three.js, DOM, Playwright oder Worker-APIs.

```ts
declare const benchmarkBrand: unique symbol;

export type Branded<T, Name extends string> = T & {
  readonly [benchmarkBrand]: Name;
};

export type NonEmptyString = Branded<string, 'NonEmptyString'>;
export type CanonicalId = Branded<string, 'CanonicalId'>;
export type CanonicalRelativePath = Branded<string, 'CanonicalRelativePath'>;
export type Sha256Digest = Branded<`sha256:${string}`, 'Sha256Digest'>;
export type GitSha1 = Branded<string, 'GitSha1'>;
export type UtcTimestampMs = Branded<string, 'UtcTimestampMs'>;
export type UInt32 = Branded<number, 'UInt32'>;
export type SafePositiveInteger = Branded<number, 'SafePositiveInteger'>;
export type NonEmptyReadonlyArray<T> = readonly [T, ...T[]];

export type BenchmarkProtocolVersion = 'benchmark-protocol-v1';

export type BenchmarkScenarioIdV1 =
  | 'mesh-golden-world-v1'
  | 'mesh-density-sweep-v1'
  | 'scheduler-steady-v1'
  | 'scheduler-burst-v1'
  | 'brush-stress-v1'
  | 'navigation-leak-v1'
  | 'backend-fixture-v1';

export type BenchmarkExecutionPhaseV1 =
  | 'cold'
  | 'warmup'
  | 'measurement'
  | 'stress'
  | 'trace'
  | 'leak';

export type BenchmarkInvalidReason =
  | 'source-dirty'
  | 'source-sha-mismatch'
  | 'source-tree-mismatch'
  | 'build-digest-mismatch'
  | 'fixture-contract-mismatch'
  | 'candidate-contract-mismatch'
  | 'scenario-contract-mismatch'
  | 'run-plan-mismatch'
  | 'environment-incomplete'
  | 'browser-version-mismatch'
  | 'required-capability-missing'
  | 'document-hidden'
  | 'document-unfocused'
  | 'background-tabs-present'
  | 'power-state-mismatch'
  | 'thermal-throttling'
  | 'clock-invalid'
  | 'sample-invalid'
  | 'gpu-disjoint'
  | 'context-lost'
  | 'console-error'
  | 'page-error'
  | 'request-failure'
  | 'http-error'
  | 'process-crash'
  | 'operator-abort'
  | 'infrastructure-failure';

export interface BenchmarkInvalidReasonV1 {
  readonly code: BenchmarkInvalidReason;
  readonly detail: NonEmptyString;
  readonly phase: BenchmarkExecutionPhaseV1;
}

export type BenchmarkCapabilityStatus =
  | { readonly status: 'supported' }
  | {
      readonly status: 'unsupported';
      readonly reason: 'api-not-supported' | 'adapter-feature-missing';
      readonly detail: NonEmptyString;
    }
  | {
      readonly status: 'unavailable';
      readonly reason: 'permission-denied' | 'capture-failed';
      readonly detail: NonEmptyString;
    }
  | {
      readonly status: 'not-requested';
      readonly reason: 'phase-does-not-request';
    };

export interface BenchmarkBuildBindingV1 {
  readonly algorithmVersion: 'hestia-benchmark-build-sha256-v1';
  readonly rootPath: 'dist';
  readonly sha256: Sha256Digest;
  readonly fileCount: SafePositiveInteger;
  readonly totalBytes: SafePositiveInteger;
}

export interface BenchmarkFixtureContractBindingV1 {
  readonly id: CanonicalId;
  readonly version: SafePositiveInteger;
  readonly semanticSha256: Sha256Digest;
  readonly sourceFileSetSha256: Sha256Digest;
  readonly sourcePaths: NonEmptyReadonlyArray<CanonicalRelativePath>;
}

export interface BenchmarkCandidateBindingV1 {
  readonly id: CanonicalId;
  readonly version: SafePositiveInteger;
  readonly sourceFileSetSha256: Sha256Digest;
  readonly sourcePaths: NonEmptyReadonlyArray<CanonicalRelativePath>;
}

export interface BenchmarkSourceProvenanceV1 {
  readonly schemaVersion: 'benchmark-source-provenance-v1';
  readonly repositoryUrl:
    'https://github.com/BenjaminHornung/hestia-voxel-kernel-lab';
  readonly commitSha: GitSha1;
  readonly commitTreeSha: GitSha1;
  readonly worktree: {
    readonly state: 'clean';
    readonly statusCommand:
      'git status --porcelain=v2 -z --untracked-files=all --ignore-submodules=none';
    readonly statusOutputSha256:
      'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
    readonly submodules: readonly [];
  };
  readonly build: BenchmarkBuildBindingV1;
  readonly fixture: BenchmarkFixtureContractBindingV1;
  readonly candidate: BenchmarkCandidateBindingV1;
}

export type BenchmarkSourcePreflightFailureCodeV1 = Extract<
  BenchmarkInvalidReason,
  | 'source-dirty'
  | 'source-sha-mismatch'
  | 'source-tree-mismatch'
  | 'build-digest-mismatch'
  | 'fixture-contract-mismatch'
  | 'candidate-contract-mismatch'
  | 'infrastructure-failure'
>;

export type BenchmarkSourcePreflightResultV1 =
  | {
      readonly status: 'accepted';
      readonly provenance: BenchmarkSourceProvenanceV1;
    }
  | {
      readonly status: 'rejected';
      readonly code: BenchmarkSourcePreflightFailureCodeV1;
      readonly detail: NonEmptyString;
    };

export type BenchmarkBackendV1 = 'three-webgl2' | 'raw-webgpu';
export type BenchmarkMesherV1 =
  | 'visible'
  | 'greedy'
  | 'greedy-ao'
  | 'not-applicable';

export type BenchmarkScenarioParameterV1 =
  | { readonly key: 'seed'; readonly value: UInt32 }
  | { readonly key: 'backend'; readonly value: BenchmarkBackendV1 }
  | { readonly key: 'mesher'; readonly value: BenchmarkMesherV1 }
  | { readonly key: 'chunk-edge'; readonly value: 32 | 64 }
  | { readonly key: 'worker-count'; readonly value: number }
  | { readonly key: 'duration-ms'; readonly value: number }
  | { readonly key: 'edit-interval-ms'; readonly value: number }
  | { readonly key: 'burst-size'; readonly value: number }
  | { readonly key: 'burst-interval-ms'; readonly value: number }
  | { readonly key: 'edit-count'; readonly value: 100 | 1_000 }
  | {
      readonly key: 'density-case';
      readonly value:
        | 'empty'
        | 'one-percent'
        | 'ten-percent'
        | 'fifty-percent'
        | 'ninety-percent'
        | 'full'
        | 'checkerboard';
    }
  | { readonly key: 'stabilization-cycles'; readonly value: 20 }
  | { readonly key: 'measurement-cycles'; readonly value: 100 }
  | { readonly key: 'camera-contract-sha256'; readonly value: Sha256Digest }
  | { readonly key: 'feature-contract-sha256'; readonly value: Sha256Digest }
  | { readonly key: 'command-stream-sha256'; readonly value: Sha256Digest };

export type BenchmarkScenarioParameterDomainV1 =
  | { readonly kind: 'uint32' }
  | {
      readonly kind: 'safe-integer-range';
      readonly minimum: number;
      readonly maximum: number;
    }
  | {
      readonly kind: 'enum';
      readonly values: NonEmptyReadonlyArray<string | number>;
    }
  | { readonly kind: 'sha256' };

export interface BenchmarkScenarioParameterContractV1 {
  readonly key: BenchmarkScenarioParameterV1['key'];
  readonly required: true;
  readonly domain: BenchmarkScenarioParameterDomainV1;
}

export interface BenchmarkScenarioCapabilityContractV1 {
  readonly id: CanonicalId;
  readonly requirement: 'must-support' | 'must-declare';
}

export type BenchmarkSampleKindV1 =
  | 'duration'
  | 'counter'
  | 'memory'
  | 'frame'
  | 'long-task'
  | 'gpu'
  | 'liveness';

export interface BenchmarkScenarioMetricContractV1 {
  readonly name: CanonicalId;
  readonly kind: BenchmarkSampleKindV1;
  readonly unit: BenchmarkSampleUnitV1;
  readonly requirement:
    | { readonly kind: 'required' }
    | {
        readonly kind: 'when-capability-supported';
        readonly capabilityId: CanonicalId;
      };
}

export type BenchmarkComparisonAxisV1 =
  | 'candidate'
  | 'backend'
  | 'mesher'
  | 'chunk-edge'
  | 'worker-count';

export interface BenchmarkScenarioDefinitionV1 {
  readonly schemaVersion: 'benchmark-scenario-definition-v1';
  readonly protocolVersion: BenchmarkProtocolVersion;
  readonly id: BenchmarkScenarioIdV1;
  readonly version: 1;
  readonly fixtureContractId: CanonicalId;
  readonly fixtureContractVersion: SafePositiveInteger;
  readonly allowedPhases: NonEmptyReadonlyArray<BenchmarkExecutionPhaseV1>;
  readonly parameterContracts:
    readonly BenchmarkScenarioParameterContractV1[];
  readonly metricContracts: readonly BenchmarkScenarioMetricContractV1[];
  readonly capabilityContracts:
    readonly BenchmarkScenarioCapabilityContractV1[];
  readonly comparisonAxes: NonEmptyReadonlyArray<BenchmarkComparisonAxisV1>;
  readonly fairnessKeys: readonly CanonicalId[];
}

export interface BenchmarkScenarioBindingV1 {
  readonly id: BenchmarkScenarioIdV1;
  readonly version: 1;
  readonly definitionSha256: Sha256Digest;
  readonly fixture: BenchmarkFixtureContractBindingV1;
  readonly parameters: readonly BenchmarkScenarioParameterV1[];
}

export interface BenchmarkEnvironmentManifestV1 {
  readonly schemaVersion: 'benchmark-environment-manifest-v1';
  readonly hardwareProfileId: CanonicalId;
  readonly gateRole:
    | 'correctness-only'
    | 'performance-primary'
    | 'guardrail'
    | 'informational';
  readonly os: {
    readonly name: NonEmptyString;
    readonly version: NonEmptyString;
    readonly architecture: NonEmptyString;
  };
  readonly cpu: {
    readonly vendor: NonEmptyString;
    readonly model: NonEmptyString;
    readonly physicalCores: SafePositiveInteger;
    readonly logicalCores: SafePositiveInteger;
    readonly ramBytes: SafePositiveInteger;
  };
  readonly gpu: {
    readonly vendor: NonEmptyString;
    readonly device: NonEmptyString;
    readonly driver: NonEmptyString;
    readonly graphicsBackend: NonEmptyString;
  };
  readonly browser: {
    readonly product: NonEmptyString;
    readonly version: NonEmptyString;
    readonly channel: NonEmptyString;
    readonly userAgent: NonEmptyString;
    readonly executableSha256: Sha256Digest;
    readonly headless: boolean;
    readonly flags: readonly string[];
  };
  readonly display: {
    readonly cssWidth: SafePositiveInteger;
    readonly cssHeight: SafePositiveInteger;
    readonly devicePixelRatio: number;
    readonly refreshHz: number;
    readonly vsync: 'enabled' | 'disabled' | 'platform-default';
  };
  readonly power: {
    readonly source: 'ac' | 'battery';
    readonly profile: NonEmptyString;
    readonly battery:
      | { readonly status: 'not-applicable' }
      | { readonly status: 'reported'; readonly percent: number }
      | {
          readonly status: 'unavailable';
          readonly reason: NonEmptyString;
        };
  };
  readonly runtimeState: {
    readonly visibility: 'visible' | 'hidden';
    readonly focus: 'focused' | 'unfocused';
    readonly backgroundTabs: number;
    readonly competingLoad:
      | { readonly status: 'none' }
      | {
          readonly status: 'documented';
          readonly detail: NonEmptyString;
        };
    readonly thermalState: 'nominal' | 'throttled' | 'not-observable';
  };
  readonly capabilities: readonly {
    readonly id: CanonicalId;
    readonly value: BenchmarkCapabilityStatus;
  }[];
}

export type BenchmarkRunValidityV1 =
  | { readonly status: 'valid' }
  | {
      readonly status: 'invalid';
      readonly reasons: NonEmptyReadonlyArray<BenchmarkInvalidReasonV1>;
    };

export type BenchmarkRunOriginV1 =
  | { readonly kind: 'planned' }
  | {
      readonly kind: 'infrastructure-rerun';
      readonly replacesRunId: CanonicalId;
      readonly approvalId: CanonicalId;
      readonly reason: 'infrastructure-failure';
    };

export interface BenchmarkExecutionDescriptorV1 {
  readonly schemaVersion: 'benchmark-execution-descriptor-v1';
  readonly phase: BenchmarkExecutionPhaseV1;
  readonly processOrdinal: number;
  readonly iteration: number;
  readonly runPlanId: CanonicalId;
  readonly runPlanSha256: Sha256Digest;
  readonly order: {
    readonly scheme: 'single-candidate' | 'abba' | 'baab' | 'latin-square';
    readonly orderSeed: UInt32;
    readonly blockId: CanonicalId;
    readonly sequencePosition: number;
    readonly candidateId: CanonicalId;
  };
  readonly pageState: {
    readonly visibility: 'visible' | 'hidden';
    readonly focus: 'focused' | 'unfocused';
    readonly backgroundTabs: number;
  };
  readonly measurementEligibility: 'eligible' | 'ineligible';
  readonly origin: BenchmarkRunOriginV1;
  readonly validity: BenchmarkRunValidityV1;
}

export type BenchmarkSampleUnitV1 =
  | 'ms'
  | 'bytes'
  | 'count'
  | 'ratio'
  | 'revision'
  | 'hertz'
  | 'percent';

export type BenchmarkSampleObservationV1 =
  | {
      readonly clock: 'performance-time-origin';
      readonly realmId: CanonicalId;
      readonly timeOriginEpochMs: number;
      readonly startMs: number;
    }
  | {
      readonly clock: 'gpu-query';
      readonly realmId: CanonicalId;
      readonly startTickDecimal: NonEmptyString;
      readonly timestampPeriodNs: number;
    };

export type BenchmarkSampleResultV1 =
  | { readonly status: 'valid'; readonly value: number }
  | {
      readonly status: 'invalid';
      readonly reason: BenchmarkInvalidReasonV1;
    };

export interface BenchmarkRawSampleV1 {
  readonly schemaVersion: 'benchmark-raw-sample-v1';
  readonly sampleId: CanonicalId;
  readonly ordinal: number;
  readonly kind: BenchmarkSampleKindV1;
  readonly name: CanonicalId;
  readonly realm: 'main' | 'worker' | 'gpu' | 'browser';
  readonly observedAt: BenchmarkSampleObservationV1;
  readonly unit: BenchmarkSampleUnitV1;
  readonly result: BenchmarkSampleResultV1;
  readonly dimensions: readonly {
    readonly key: CanonicalId;
    readonly value: string | number | boolean;
  }[];
  readonly runBindingSha256: Sha256Digest;
}

export interface BenchmarkRunV1 {
  readonly schemaVersion: 'benchmark-run-v1';
  readonly protocolVersion: BenchmarkProtocolVersion;
  readonly runId: CanonicalId;
  readonly createdUtc: UtcTimestampMs;
  readonly source: BenchmarkSourceProvenanceV1;
  readonly scenario: BenchmarkScenarioBindingV1;
  readonly environment: BenchmarkEnvironmentManifestV1;
  readonly execution: BenchmarkExecutionDescriptorV1;
  readonly runBindingSha256: Sha256Digest;
  readonly samples: readonly BenchmarkRawSampleV1[];
}

export type BenchmarkArtifactRoleV1 =
  | 'raw-run-json'
  | 'summary-json'
  | 'summary-markdown'
  | 'screenshot'
  | 'trace'
  | 'failure-log'
  | 'heap-snapshot'
  | 'gpu-capture';

export type BenchmarkArtifactSerializationV1 =
  | 'jcs-rfc8785'
  | 'utf8-lf-final-newline'
  | 'binary-exact';

export interface BenchmarkArtifactEntryV1 {
  readonly path: CanonicalRelativePath;
  readonly role: BenchmarkArtifactRoleV1;
  readonly mediaType: NonEmptyString;
  readonly serialization: BenchmarkArtifactSerializationV1;
  readonly byteLength: SafePositiveInteger;
  readonly sha256: Sha256Digest;
  readonly runIds: NonEmptyReadonlyArray<CanonicalId>;
}

export interface BenchmarkArtifactManifestV1 {
  readonly schemaVersion: 'benchmark-artifact-manifest-v1';
  readonly protocolVersion: BenchmarkProtocolVersion;
  readonly artifacts: readonly BenchmarkArtifactEntryV1[];
}

export interface BenchmarkBundleManifestV1 {
  readonly schemaVersion: 'benchmark-bundle-manifest-v1';
  readonly protocolVersion: BenchmarkProtocolVersion;
  readonly bundleId: CanonicalId;
  readonly createdUtc: UtcTimestampMs;
  readonly claimClass:
    | 'correctness'
    | 'diagnostic'
    | 'performance-gate'
    | 'informational';
  readonly canonicalJson: 'rfc8785-jcs';
  readonly pathPolicy: 'hestia-relative-posix-lower-v1';
  readonly digestAlgorithmVersion: 'hestia-benchmark-bundle-sha256-v1';
  readonly artifactManifest: {
    readonly path: 'artifact-manifest.json';
    readonly byteLength: SafePositiveInteger;
    readonly sha256: Sha256Digest;
  };
  readonly runs: NonEmptyReadonlyArray<{
    readonly runId: CanonicalId;
    readonly path: CanonicalRelativePath;
    readonly sha256: Sha256Digest;
  }>;
  readonly excludedFromBundleDigest: readonly ['bundle.sha256'];
}
```

### 5.1 Wichtige Typsemantik

- `0` kann ein echter Counterwert sein. Es ist nur gültig in `result: {status: 'valid', value: 0}`. Eine fehlende Capability wird niemals durch einen Null- oder Nullwertsample dargestellt.
- Negative Null, `NaN`, `Infinity`, `-Infinity`, unsichere Integer und leere Identifiers werden vor Serialisierung abgewiesen.
- Arrays mit semantischen Sets, etwa Paths, Capabilities und Dimensions, sind kanonisch sortiert und haben eindeutige Schlüssel. JSON Schema allein kann diese Cross-Field-Regel nicht vollständig ausdrücken; `validateV1.ts` erzwingt sie.
- `BenchmarkArtifactManifestV1.artifacts` listet ausschließlich Nutzartefakte. Es listet weder sich selbst, `bundle-manifest.json` noch `bundle.sha256`.

## 6. Normatives JSON Schema für `BenchmarkRunV1`

Die folgende Datei ist vollständig und als `src/benchmark/contracts/schemas/benchmark-run-v1.schema.json` zu übernehmen. Die beiden Manifest-Schemata und das Scenario-Definition-Schema verwenden dieselben `$defs` für IDs, Digests, Pfade und Timestamps und spiegeln die TypeScript-Interfaces aus Abschnitt 5.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://hestia.invalid/schemas/benchmark-run-v1.schema.json",
  "title": "Hestia Benchmark Run v1",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "schemaVersion",
    "protocolVersion",
    "runId",
    "createdUtc",
    "source",
    "scenario",
    "environment",
    "execution",
    "runBindingSha256",
    "samples"
  ],
  "properties": {
    "schemaVersion": { "const": "benchmark-run-v1" },
    "protocolVersion": { "const": "benchmark-protocol-v1" },
    "runId": { "$ref": "#/$defs/id" },
    "createdUtc": { "$ref": "#/$defs/utcTimestampMs" },
    "source": { "$ref": "#/$defs/source" },
    "scenario": { "$ref": "#/$defs/scenario" },
    "environment": { "$ref": "#/$defs/environment" },
    "execution": { "$ref": "#/$defs/execution" },
    "runBindingSha256": { "$ref": "#/$defs/sha256" },
    "samples": {
      "type": "array",
      "items": { "$ref": "#/$defs/sample" }
    }
  },
  "allOf": [
    {
      "if": {
        "properties": {
          "execution": {
            "type": "object",
            "properties": {
              "validity": {
                "type": "object",
                "properties": { "status": { "const": "valid" } },
                "required": ["status"]
              }
            },
            "required": ["validity"]
          }
        },
        "required": ["execution"]
      },
      "then": {
        "properties": {
          "samples": { "type": "array", "minItems": 1 }
        }
      }
    }
  ],
  "$defs": {
    "id": {
      "type": "string",
      "pattern": "^[a-z0-9][a-z0-9._-]{0,127}$"
    },
    "nonEmpty": {
      "type": "string",
      "minLength": 1,
      "maxLength": 2048
    },
    "sha256": {
      "type": "string",
      "pattern": "^sha256:[0-9a-f]{64}$"
    },
    "gitSha1": {
      "type": "string",
      "pattern": "^[0-9a-f]{40}$"
    },
    "path": {
      "type": "string",
      "maxLength": 512,
      "pattern": "^(?!/)(?!.*(?:^|/)\\.\\.?(?:/|$))(?!.*//)(?!.*\\\\)[a-z0-9](?:[a-z0-9._/-]*[a-z0-9._-])?$"
    },
    "utcTimestampMs": {
      "type": "string",
      "pattern": "^[0-9]{4}-(0[1-9]|1[0-2])-([0-2][0-9]|3[01])T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]\\.[0-9]{3}Z$"
    },
    "positiveInteger": {
      "type": "integer",
      "minimum": 1,
      "maximum": 9007199254740991
    },
    "uint32": {
      "type": "integer",
      "minimum": 0,
      "maximum": 4294967295
    },
    "finiteNonNegative": {
      "type": "number",
      "minimum": 0
    },
    "fixture": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "id",
        "version",
        "semanticSha256",
        "sourceFileSetSha256",
        "sourcePaths"
      ],
      "properties": {
        "id": { "$ref": "#/$defs/id" },
        "version": { "$ref": "#/$defs/positiveInteger" },
        "semanticSha256": { "$ref": "#/$defs/sha256" },
        "sourceFileSetSha256": { "$ref": "#/$defs/sha256" },
        "sourcePaths": {
          "type": "array",
          "minItems": 1,
          "uniqueItems": true,
          "items": { "$ref": "#/$defs/path" }
        }
      }
    },
    "candidate": {
      "type": "object",
      "additionalProperties": false,
      "required": ["id", "version", "sourceFileSetSha256", "sourcePaths"],
      "properties": {
        "id": { "$ref": "#/$defs/id" },
        "version": { "$ref": "#/$defs/positiveInteger" },
        "sourceFileSetSha256": { "$ref": "#/$defs/sha256" },
        "sourcePaths": {
          "type": "array",
          "minItems": 1,
          "uniqueItems": true,
          "items": { "$ref": "#/$defs/path" }
        }
      }
    },
    "source": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "schemaVersion",
        "repositoryUrl",
        "commitSha",
        "commitTreeSha",
        "worktree",
        "build",
        "fixture",
        "candidate"
      ],
      "properties": {
        "schemaVersion": { "const": "benchmark-source-provenance-v1" },
        "repositoryUrl": {
          "const": "https://github.com/BenjaminHornung/hestia-voxel-kernel-lab"
        },
        "commitSha": { "$ref": "#/$defs/gitSha1" },
        "commitTreeSha": { "$ref": "#/$defs/gitSha1" },
        "worktree": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "state",
            "statusCommand",
            "statusOutputSha256",
            "submodules"
          ],
          "properties": {
            "state": { "const": "clean" },
            "statusCommand": {
              "const": "git status --porcelain=v2 -z --untracked-files=all --ignore-submodules=none"
            },
            "statusOutputSha256": {
              "const": "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
            },
            "submodules": {
              "type": "array",
              "maxItems": 0
            }
          }
        },
        "build": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "algorithmVersion",
            "rootPath",
            "sha256",
            "fileCount",
            "totalBytes"
          ],
          "properties": {
            "algorithmVersion": {
              "const": "hestia-benchmark-build-sha256-v1"
            },
            "rootPath": { "const": "dist" },
            "sha256": { "$ref": "#/$defs/sha256" },
            "fileCount": { "$ref": "#/$defs/positiveInteger" },
            "totalBytes": { "$ref": "#/$defs/positiveInteger" }
          }
        },
        "fixture": { "$ref": "#/$defs/fixture" },
        "candidate": { "$ref": "#/$defs/candidate" }
      }
    },
    "scenarioParameter": {
      "oneOf": [
        {
          "type": "object",
          "additionalProperties": false,
          "required": ["key", "value"],
          "properties": {
            "key": { "const": "seed" },
            "value": { "$ref": "#/$defs/uint32" }
          }
        },
        {
          "type": "object",
          "additionalProperties": false,
          "required": ["key", "value"],
          "properties": {
            "key": { "const": "backend" },
            "value": { "enum": ["three-webgl2", "raw-webgpu"] }
          }
        },
        {
          "type": "object",
          "additionalProperties": false,
          "required": ["key", "value"],
          "properties": {
            "key": { "const": "mesher" },
            "value": {
              "enum": ["visible", "greedy", "greedy-ao", "not-applicable"]
            }
          }
        },
        {
          "type": "object",
          "additionalProperties": false,
          "required": ["key", "value"],
          "properties": {
            "key": { "const": "chunk-edge" },
            "value": { "enum": [32, 64] }
          }
        },
        {
          "type": "object",
          "additionalProperties": false,
          "required": ["key", "value"],
          "properties": {
            "key": { "const": "worker-count" },
            "value": {
              "type": "integer",
              "minimum": 0,
              "maximum": 64
            }
          }
        },
        {
          "type": "object",
          "additionalProperties": false,
          "required": ["key", "value"],
          "properties": {
            "key": { "enum": [
              "duration-ms",
              "edit-interval-ms",
              "burst-size",
              "burst-interval-ms"
            ] },
            "value": { "$ref": "#/$defs/positiveInteger" }
          }
        },
        {
          "type": "object",
          "additionalProperties": false,
          "required": ["key", "value"],
          "properties": {
            "key": { "const": "edit-count" },
            "value": { "enum": [100, 1000] }
          }
        },
        {
          "type": "object",
          "additionalProperties": false,
          "required": ["key", "value"],
          "properties": {
            "key": { "const": "density-case" },
            "value": { "enum": [
              "empty",
              "one-percent",
              "ten-percent",
              "fifty-percent",
              "ninety-percent",
              "full",
              "checkerboard"
            ] }
          }
        },
        {
          "type": "object",
          "additionalProperties": false,
          "required": ["key", "value"],
          "properties": {
            "key": { "const": "stabilization-cycles" },
            "value": { "const": 20 }
          }
        },
        {
          "type": "object",
          "additionalProperties": false,
          "required": ["key", "value"],
          "properties": {
            "key": { "const": "measurement-cycles" },
            "value": { "const": 100 }
          }
        },
        {
          "type": "object",
          "additionalProperties": false,
          "required": ["key", "value"],
          "properties": {
            "key": { "enum": [
              "camera-contract-sha256",
              "feature-contract-sha256",
              "command-stream-sha256"
            ] },
            "value": { "$ref": "#/$defs/sha256" }
          }
        }
      ]
    },
    "scenario": {
      "type": "object",
      "additionalProperties": false,
      "required": ["id", "version", "definitionSha256", "fixture", "parameters"],
      "properties": {
        "id": { "enum": [
          "mesh-golden-world-v1",
          "mesh-density-sweep-v1",
          "scheduler-steady-v1",
          "scheduler-burst-v1",
          "brush-stress-v1",
          "navigation-leak-v1",
          "backend-fixture-v1"
        ] },
        "version": { "const": 1 },
        "definitionSha256": { "$ref": "#/$defs/sha256" },
        "fixture": { "$ref": "#/$defs/fixture" },
        "parameters": {
          "type": "array",
          "items": { "$ref": "#/$defs/scenarioParameter" }
        }
      }
    },
    "capabilityStatus": {
      "oneOf": [
        {
          "type": "object",
          "additionalProperties": false,
          "required": ["status"],
          "properties": { "status": { "const": "supported" } }
        },
        {
          "type": "object",
          "additionalProperties": false,
          "required": ["status", "reason", "detail"],
          "properties": {
            "status": { "const": "unsupported" },
            "reason": {
              "enum": ["api-not-supported", "adapter-feature-missing"]
            },
            "detail": { "$ref": "#/$defs/nonEmpty" }
          }
        },
        {
          "type": "object",
          "additionalProperties": false,
          "required": ["status", "reason", "detail"],
          "properties": {
            "status": { "const": "unavailable" },
            "reason": { "enum": ["permission-denied", "capture-failed"] },
            "detail": { "$ref": "#/$defs/nonEmpty" }
          }
        },
        {
          "type": "object",
          "additionalProperties": false,
          "required": ["status", "reason"],
          "properties": {
            "status": { "const": "not-requested" },
            "reason": { "const": "phase-does-not-request" }
          }
        }
      ]
    },
    "environment": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "schemaVersion",
        "hardwareProfileId",
        "gateRole",
        "os",
        "cpu",
        "gpu",
        "browser",
        "display",
        "power",
        "runtimeState",
        "capabilities"
      ],
      "properties": {
        "schemaVersion": { "const": "benchmark-environment-manifest-v1" },
        "hardwareProfileId": { "$ref": "#/$defs/id" },
        "gateRole": { "enum": [
          "correctness-only",
          "performance-primary",
          "guardrail",
          "informational"
        ] },
        "os": {
          "type": "object",
          "additionalProperties": false,
          "required": ["name", "version", "architecture"],
          "properties": {
            "name": { "$ref": "#/$defs/nonEmpty" },
            "version": { "$ref": "#/$defs/nonEmpty" },
            "architecture": { "$ref": "#/$defs/nonEmpty" }
          }
        },
        "cpu": {
          "type": "object",
          "additionalProperties": false,
          "required": ["vendor", "model", "physicalCores", "logicalCores", "ramBytes"],
          "properties": {
            "vendor": { "$ref": "#/$defs/nonEmpty" },
            "model": { "$ref": "#/$defs/nonEmpty" },
            "physicalCores": { "$ref": "#/$defs/positiveInteger" },
            "logicalCores": { "$ref": "#/$defs/positiveInteger" },
            "ramBytes": { "$ref": "#/$defs/positiveInteger" }
          }
        },
        "gpu": {
          "type": "object",
          "additionalProperties": false,
          "required": ["vendor", "device", "driver", "graphicsBackend"],
          "properties": {
            "vendor": { "$ref": "#/$defs/nonEmpty" },
            "device": { "$ref": "#/$defs/nonEmpty" },
            "driver": { "$ref": "#/$defs/nonEmpty" },
            "graphicsBackend": { "$ref": "#/$defs/nonEmpty" }
          }
        },
        "browser": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "product",
            "version",
            "channel",
            "userAgent",
            "executableSha256",
            "headless",
            "flags"
          ],
          "properties": {
            "product": { "$ref": "#/$defs/nonEmpty" },
            "version": { "$ref": "#/$defs/nonEmpty" },
            "channel": { "$ref": "#/$defs/nonEmpty" },
            "userAgent": { "$ref": "#/$defs/nonEmpty" },
            "executableSha256": { "$ref": "#/$defs/sha256" },
            "headless": { "type": "boolean" },
            "flags": {
              "type": "array",
              "uniqueItems": true,
              "items": { "$ref": "#/$defs/nonEmpty" }
            }
          }
        },
        "display": {
          "type": "object",
          "additionalProperties": false,
          "required": ["cssWidth", "cssHeight", "devicePixelRatio", "refreshHz", "vsync"],
          "properties": {
            "cssWidth": { "$ref": "#/$defs/positiveInteger" },
            "cssHeight": { "$ref": "#/$defs/positiveInteger" },
            "devicePixelRatio": { "type": "number", "exclusiveMinimum": 0 },
            "refreshHz": { "type": "number", "exclusiveMinimum": 0 },
            "vsync": { "enum": ["enabled", "disabled", "platform-default"] }
          }
        },
        "power": {
          "type": "object",
          "additionalProperties": false,
          "required": ["source", "profile", "battery"],
          "properties": {
            "source": { "enum": ["ac", "battery"] },
            "profile": { "$ref": "#/$defs/nonEmpty" },
            "battery": {
              "oneOf": [
                {
                  "type": "object",
                  "additionalProperties": false,
                  "required": ["status"],
                  "properties": { "status": { "const": "not-applicable" } }
                },
                {
                  "type": "object",
                  "additionalProperties": false,
                  "required": ["status", "percent"],
                  "properties": {
                    "status": { "const": "reported" },
                    "percent": { "type": "number", "minimum": 0, "maximum": 100 }
                  }
                },
                {
                  "type": "object",
                  "additionalProperties": false,
                  "required": ["status", "reason"],
                  "properties": {
                    "status": { "const": "unavailable" },
                    "reason": { "$ref": "#/$defs/nonEmpty" }
                  }
                }
              ]
            }
          }
        },
        "runtimeState": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "visibility",
            "focus",
            "backgroundTabs",
            "competingLoad",
            "thermalState"
          ],
          "properties": {
            "visibility": { "enum": ["visible", "hidden"] },
            "focus": { "enum": ["focused", "unfocused"] },
            "backgroundTabs": { "type": "integer", "minimum": 0 },
            "competingLoad": {
              "oneOf": [
                {
                  "type": "object",
                  "additionalProperties": false,
                  "required": ["status"],
                  "properties": { "status": { "const": "none" } }
                },
                {
                  "type": "object",
                  "additionalProperties": false,
                  "required": ["status", "detail"],
                  "properties": {
                    "status": { "const": "documented" },
                    "detail": { "$ref": "#/$defs/nonEmpty" }
                  }
                }
              ]
            },
            "thermalState": { "enum": ["nominal", "throttled", "not-observable"] }
          }
        },
        "capabilities": {
          "type": "array",
          "uniqueItems": true,
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": ["id", "value"],
            "properties": {
              "id": { "$ref": "#/$defs/id" },
              "value": { "$ref": "#/$defs/capabilityStatus" }
            }
          }
        }
      }
    },
    "invalidReason": {
      "type": "object",
      "additionalProperties": false,
      "required": ["code", "detail", "phase"],
      "properties": {
        "code": { "enum": [
          "source-dirty",
          "source-sha-mismatch",
          "source-tree-mismatch",
          "build-digest-mismatch",
          "fixture-contract-mismatch",
          "candidate-contract-mismatch",
          "scenario-contract-mismatch",
          "run-plan-mismatch",
          "environment-incomplete",
          "browser-version-mismatch",
          "required-capability-missing",
          "document-hidden",
          "document-unfocused",
          "background-tabs-present",
          "power-state-mismatch",
          "thermal-throttling",
          "clock-invalid",
          "sample-invalid",
          "gpu-disjoint",
          "context-lost",
          "console-error",
          "page-error",
          "request-failure",
          "http-error",
          "process-crash",
          "operator-abort",
          "infrastructure-failure"
        ] },
        "detail": { "$ref": "#/$defs/nonEmpty" },
        "phase": { "enum": ["cold", "warmup", "measurement", "stress", "trace", "leak"] }
      }
    },
    "validity": {
      "oneOf": [
        {
          "type": "object",
          "additionalProperties": false,
          "required": ["status"],
          "properties": { "status": { "const": "valid" } }
        },
        {
          "type": "object",
          "additionalProperties": false,
          "required": ["status", "reasons"],
          "properties": {
            "status": { "const": "invalid" },
            "reasons": {
              "type": "array",
              "minItems": 1,
              "items": { "$ref": "#/$defs/invalidReason" }
            }
          }
        }
      ]
    },
    "execution": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "schemaVersion",
        "phase",
        "processOrdinal",
        "iteration",
        "runPlanId",
        "runPlanSha256",
        "order",
        "pageState",
        "measurementEligibility",
        "origin",
        "validity"
      ],
      "properties": {
        "schemaVersion": { "const": "benchmark-execution-descriptor-v1" },
        "phase": { "enum": ["cold", "warmup", "measurement", "stress", "trace", "leak"] },
        "processOrdinal": { "type": "integer", "minimum": 0 },
        "iteration": { "type": "integer", "minimum": 0 },
        "runPlanId": { "$ref": "#/$defs/id" },
        "runPlanSha256": { "$ref": "#/$defs/sha256" },
        "order": {
          "type": "object",
          "additionalProperties": false,
          "required": ["scheme", "orderSeed", "blockId", "sequencePosition", "candidateId"],
          "properties": {
            "scheme": { "enum": ["single-candidate", "abba", "baab", "latin-square"] },
            "orderSeed": { "$ref": "#/$defs/uint32" },
            "blockId": { "$ref": "#/$defs/id" },
            "sequencePosition": { "type": "integer", "minimum": 0 },
            "candidateId": { "$ref": "#/$defs/id" }
          }
        },
        "pageState": {
          "type": "object",
          "additionalProperties": false,
          "required": ["visibility", "focus", "backgroundTabs"],
          "properties": {
            "visibility": { "enum": ["visible", "hidden"] },
            "focus": { "enum": ["focused", "unfocused"] },
            "backgroundTabs": { "type": "integer", "minimum": 0 }
          }
        },
        "measurementEligibility": { "enum": ["eligible", "ineligible"] },
        "origin": {
          "oneOf": [
            {
              "type": "object",
              "additionalProperties": false,
              "required": ["kind"],
              "properties": { "kind": { "const": "planned" } }
            },
            {
              "type": "object",
              "additionalProperties": false,
              "required": ["kind", "replacesRunId", "approvalId", "reason"],
              "properties": {
                "kind": { "const": "infrastructure-rerun" },
                "replacesRunId": { "$ref": "#/$defs/id" },
                "approvalId": { "$ref": "#/$defs/id" },
                "reason": { "const": "infrastructure-failure" }
              }
            }
          ]
        },
        "validity": { "$ref": "#/$defs/validity" }
      }
    },
    "observation": {
      "oneOf": [
        {
          "type": "object",
          "additionalProperties": false,
          "required": ["clock", "realmId", "timeOriginEpochMs", "startMs"],
          "properties": {
            "clock": { "const": "performance-time-origin" },
            "realmId": { "$ref": "#/$defs/id" },
            "timeOriginEpochMs": { "$ref": "#/$defs/finiteNonNegative" },
            "startMs": { "$ref": "#/$defs/finiteNonNegative" }
          }
        },
        {
          "type": "object",
          "additionalProperties": false,
          "required": ["clock", "realmId", "startTickDecimal", "timestampPeriodNs"],
          "properties": {
            "clock": { "const": "gpu-query" },
            "realmId": { "$ref": "#/$defs/id" },
            "startTickDecimal": { "type": "string", "pattern": "^(0|[1-9][0-9]*)$" },
            "timestampPeriodNs": { "type": "number", "exclusiveMinimum": 0 }
          }
        }
      ]
    },
    "sampleResult": {
      "oneOf": [
        {
          "type": "object",
          "additionalProperties": false,
          "required": ["status", "value"],
          "properties": {
            "status": { "const": "valid" },
            "value": { "type": "number" }
          }
        },
        {
          "type": "object",
          "additionalProperties": false,
          "required": ["status", "reason"],
          "properties": {
            "status": { "const": "invalid" },
            "reason": { "$ref": "#/$defs/invalidReason" }
          }
        }
      ]
    },
    "sample": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "schemaVersion",
        "sampleId",
        "ordinal",
        "kind",
        "name",
        "realm",
        "observedAt",
        "unit",
        "result",
        "dimensions",
        "runBindingSha256"
      ],
      "properties": {
        "schemaVersion": { "const": "benchmark-raw-sample-v1" },
        "sampleId": { "$ref": "#/$defs/id" },
        "ordinal": { "type": "integer", "minimum": 0 },
        "kind": { "enum": [
          "duration",
          "counter",
          "memory",
          "frame",
          "long-task",
          "gpu",
          "liveness"
        ] },
        "name": { "$ref": "#/$defs/id" },
        "realm": { "enum": ["main", "worker", "gpu", "browser"] },
        "observedAt": { "$ref": "#/$defs/observation" },
        "unit": { "enum": ["ms", "bytes", "count", "ratio", "revision", "hertz", "percent"] },
        "result": { "$ref": "#/$defs/sampleResult" },
        "dimensions": {
          "type": "array",
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": ["key", "value"],
            "properties": {
              "key": { "$ref": "#/$defs/id" },
              "value": {
                "anyOf": [
                  { "type": "string" },
                  { "type": "number" },
                  { "type": "boolean" }
                ]
              }
            }
          }
        },
        "runBindingSha256": { "$ref": "#/$defs/sha256" }
      }
    }
  }
}
```

### 6.1 Schema- versus semantische Validierung

JSON Schema prüft Form, Required-Felder, Patterns, Enumwerte und geschlossene Objekte. `validateV1.ts` prüft zusätzlich zwingend:

1. tatsächliche Kalendergültigkeit von `createdUtc`, nicht nur Regex;
2. alle Zahlen finite und nicht `-0`;
3. Integer-Felder als sichere Integer;
4. `physicalCores <= logicalCores`;
5. Batterie `not-applicable` nur bei `source: ac`, `reported` nur bei `battery`;
6. eindeutige und kanonisch sortierte Capability-, Path-, Parameter-, Dimension- und Sample-Schlüssel;
7. Scenario-ID existiert in Registry, `version === 1`, Definition-Digest stimmt;
8. Parameterkeys stimmen exakt mit `parameterContracts` überein und jeder Wert erfüllt die dort gehashte Domain;
9. Scenario-Fixture entspricht bytegenau `source.fixture`;
10. `execution.order.candidateId === source.candidate.id`;
11. `runPlanId` und `runPlanSha256` entsprechen dem vorab erzeugten Plan;
12. `environment.runtimeState` und `execution.pageState` stimmen für Sichtbarkeit, Fokus und Hintergrundtabs exakt überein;
13. Warm-up und Trace sind immer `measurementEligibility: ineligible`;
14. Ein valider eligible Run ist sichtbar, fokussiert, hat null Hintergrundtabs, `competingLoad.status: none`, `thermalState: nominal` und keine invaliden Samples;
15. `performance-primary` oder `guardrail` mit `browser.headless: true` wird als Performancezelle abgewiesen;
16. Jede Registry-Capability ist genau einmal deklariert. `must-support` verlangt `status: supported`; `must-declare` erlaubt jeden diskriminierten Status;
17. Pflichtmetriken sind vorhanden und stimmen in Name, Kind und Unit mit `metricContracts` überein; bedingte Metriken sind genau dann Pflicht, wenn ihre Capability `supported` ist;
18. `duration`, `frame`, `long-task` und gültige GPU-Dauer verwenden `ms`; `memory` verwendet `bytes`;
19. gültige Bytes/Counts/Revisionen sind nichtnegative sichere Integer;
20. jeder Sample-Digest entspricht dem Run-Digest;
21. Sample-IDs und Ordinals sind eindeutig, Ordinals bilden `0..n-1` ohne Lücke;
22. invalides Resultat besitzt keinen Zahlenwert; valides Resultat besitzt keinen InvalidReason, und jeder Reason verwendet dieselbe Phase wie `execution.phase`;
23. `validity: valid` verlangt mindestens einen Sample und ausschließlich valide Samples; `validity: invalid` verlangt mindestens einen eindeutigen, sortierten Reason und darf null oder mehr Samples speichern, wobei jeder Sample-Reason auch im Run-Reasonset vorkommt;
24. jedes `*-sha256-match`-Liveness-Sample hat Wert `1`, Unit `count` und genau je eine kanonische Dimension `actual-sha256` sowie `expected-sha256`; eine Abweichung invalidiert den Run.

Die Testharness unterscheidet strikt vier Stufen: `parse`, `schema`,
`semantic` und `provenance-or-bundle`. Für `schema`-Fälle müssen AJV und
der strukturelle Teil von `validateV1.ts` dasselbe Ergebnis liefern. Ein
absichtlich nur semantisch ungültiger Fall muss dagegen das Schema bestehen
und erst im semantischen Validator scheitern. Preflight- und Bundlefälle sind
keine `BenchmarkRunV1`-Schemaparitätstests. So wird die Grenze der
Draft-2020-12-Sprache getestet, statt eine unmögliche Vollparität zu behaupten.

## 7. Run-Bindung und Vergleichbarkeit

### 7.1 `runBindingSha256`

Die Bindung ist kein Hash des gesamten Runs und damit nicht selbstreferenziell.

```text
projection = {
  schemaVersion,
  protocolVersion,
  runId,
  createdUtc,
  source,
  scenario,
  environment,
  execution
}

runBindingSha256 = sha256(JCS(projection))
```

`runBindingSha256` wird oben im Run gespeichert und in jedem Sample identisch wiederholt. Der Validator bildet die Projection neu und vergleicht alle Stellen.

### 7.2 Vergleichsschlüssel

Eine spätere Vergleichszelle darf Runs nur zusammenführen, wenn folgende Werte gleich sind:

```text
protocolVersion
scenario.id
scenario.version
scenario.definitionSha256
scenario.fixture.semanticSha256
scenario.fixture.sourceFileSetSha256
execution.runPlanSha256
environment.hardwareProfileId
environment.os
environment.cpu
environment.gpu
environment.browser
environment.display
environment.power
environment.runtimeState
execution.phase
```

Der Runplan aktiviert genau eine in der Registry erlaubte Vergleichsachse. Nur
der Wert dieser Achse und die dafür vorab benannten Candidate-Bindings dürfen
abweichen. Alle anderen `scenario.parameters` sind gleich. Das Fixture ist
keine Achse und bleibt immer bytegleich. Dadurch wird ein Laufpaar verworfen,
wenn Fixture und Kandidat gleichzeitig geändert wurden oder mehrere Achsen
unbemerkt variieren.

Repository-SHA und Build-Digest werden berichtet, aber nicht als Gleichheitsbedingung erzwungen, weil ein Baseline-/Candidate-Vergleich gerade verschiedene Commits oder Builds enthalten kann. Der Runplan muss jedoch die erwarteten Candidate-IDs und Source-Digests vor dem Lauf binden.

### 7.3 Schutz gegen alte, neu etikettierte Daten

Automatische Schutzschichten:

1. Raw JSON muss kanonische JCS-Bytes besitzen. Manuelle Neuformatierung scheitert.
2. Jede Top-Level-Bindung geht in `runBindingSha256` ein.
3. Jeder Sample wiederholt diese Bindung.
4. Artifact- und Bundle-Manifest binden Pfad, Länge und Digest der Raw-Datei.
5. `bundle.sha256` bindet beide Manifeste und alle Nutzdateien.
6. Eine bereits veröffentlichte externe Bundle-Attestation macht eine spätere Umetikettierung erkennbar.

Restgrenze: Ein Agent mit Schreibzugriff kann ein vollständig neues, intern konsistentes Lügenbundle erzeugen. Erst ein externer Signer oder immutable Store beweist, dass der veröffentlichte Digest zum tatsächlichen kontrollierten Lauf gehört. Performance-Gate-Bundles dürfen daher später ohne externe Attestation nicht den Status `performance-gate` erhalten.

## 8. Source-, Tree-, Build-, Fixture- und Candidate-Provenienz

### 8.1 Source-Preflight

`sourcePreflightV1.ts` führt ausschließlich lesende Prüfungen aus und akzeptiert den erwarteten, später freigegebenen WP04-SHA als Pflichtargument.

Normative Reihenfolge:

```text
1. git rev-parse --show-toplevel
2. git rev-parse --verify HEAD^{commit}
3. git rev-parse --verify HEAD^{tree}
4. git status --porcelain=v2 -z --untracked-files=all --ignore-submodules=none
5. Prüfe: HEAD == expectedAcceptedWp04Sha
6. Prüfe: Status-stdout ist exakt 0 Bytes
7. Prüfe: kein .gitmodules und keine Gitlink-Einträge für Protocol v1
8. Berechne Fixture- und Candidate-Fileset-Digests aus den sauberen Dateien
9. Erzeuge Produktionsbuild außerhalb dieses Moduls
10. Berechne Build-Fileset-Digest aus dist/
11. Wiederhole Schritte 2 bis 4 unmittelbar nach dem Build und vor dem Run
12. Prüfe erneut: Commit, Tree und leerer Status sind unverändert
```

Git wird ohne Shell mit festen Argumentarrays und dem verifizierten
Repository-Root als `cwd` gestartet. Commit und Tree müssen nach Entfernen
genau eines terminalen LF exakt 40 lowercase Hexzeichen sein. Status-stdout
wird als roher Bytebuffer behandelt, nie als Text normalisiert. Ein Timeout,
nichtnull Exitcode, unerwartetes stderr, Encodingfehler oder überzählige Ausgabe
ist `infrastructure-failure`.

Fehler in 5 bis 12 erzeugen keinen `BenchmarkRunV1`.
`BenchmarkSourcePreflightResultV1` liefert stattdessen `status: rejected` mit
geschlossenem Code und nichtleerem Detail. Dieser interne Resultattyp ist kein
Evidence-Artefakt und darf nicht als Benchmarkmessung gezählt werden.

### 8.2 Fixture-Bindung

Die Fixture-Bindung enthält zwei Digests:

- `semanticSha256`: SHA-256 über JCS des exportierten, JSON-sicheren Fixture-Contracts, etwa ID, Version, Seed, World-Hash, Palette-/AO-Contract und erwartete invarianten Werte;
- `sourceFileSetSha256`: Fileset-Digest über alle Registry-definierten Fixture- und Golden-Sourcepfade.

So wird sowohl ein still geänderter Contractwert als auch eine veränderte Fixture-Erzeugungsquelle erkannt.

### 8.3 Candidate-Bindung

Ein Kandidat besitzt ID, Version, sortierte Sourcepfade und einen Fileset-Digest. Beispiele:

```text
visible-v1
greedy-v1
greedy-ao-v1
raw-webgpu-volume-v1
```

Gleiche ID und Version mit anderem Source-Digest ist kein stilles Update, sondern ein neuer Candidate-Build. Der Runplan nennt die erwarteten Digests.

### 8.4 Build-Bindung

Der Build-Digest umfasst alle regulären Dateien unter `dist/`, nicht Verzeichnis-Metadaten. Absolute Pfade, mtime, Besitzer, Dateirechte und Erstellungsreihenfolge werden nicht gehasht. Symlinks und Spezialdateien sind unzulässig.

## 9. Kanonische Serialisierung

| Artefaktklasse | Kanonische Bytes |
|---|---|
| `bundle-manifest.json` | RFC 8785 JCS, UTF-8, kein BOM, kein abschließender LF |
| `artifact-manifest.json` | RFC 8785 JCS, UTF-8, kein BOM, kein abschließender LF |
| `raw/*.json` | RFC 8785 JCS, UTF-8, kein BOM, kein abschließender LF |
| `summary/*.json` | RFC 8785 JCS, UTF-8, kein BOM, kein abschließender LF |
| `summary/*.md` und Textlogs | gültiges UTF-8, kein BOM, nur LF, exakt ein LF am Dateiende |
| PNG, Trace-Binärdaten, Heap-/GPU-Captures | exakte Bytes, keine Transformation |

JCS-spezifisch:

- Objektkeys werden rekursiv nach RFC 8785 sortiert.
- Arrayreihenfolge wird niemals sortiert oder verändert.
- Strings werden nicht Unicode-normalisiert.
- Doppelte JSON-Properties sind verboten.
- Der Ingest weist doppelte Properties vor dem Parse ab und vergleicht danach `JCS(parse(bytes))` bytegenau mit den Eingabebytes. Damit werden Whitespace, CRLF, BOM und nichtkanonische Zahlen fail-closed erkannt.
- Pretty-Print ist nur eine abgeleitete menschliche Ansicht und niemals Digestquelle.

`canonicalJsonV1.ts` arbeitet ohne Locale und ohne implizite Konvertierung:

1. Akzeptiert werden nur `null`, Boolean, String, finite Number, Arrays und
   einfache Objekte mit `Object.prototype` oder `null` als Prototype.
2. Abgewiesen werden `undefined`, Function, Symbol, BigInt, nichtfinite Number,
   `-0`, zyklische Strukturen, Accessors, symbolische Keys und nicht einfache
   Objekte. Zahlen, die fachlich Integer sind, müssen zusätzlich safe sein.
3. Strings und Property-Namen mit ungepaarten UTF-16-Surrogaten werden
   abgewiesen. Unicode wird nicht normalisiert.
4. Arrayreihenfolge bleibt erhalten. Objektkeys werden nach ihren rohen
   UTF-16-Codeunits aufsteigend sortiert, wie RFC 8785 es für ECMAScript/JCS
   verlangt. Weder `localeCompare` noch UTF-8-Bytesortierung werden dafür
   verwendet.
5. Primitive und Escapes werden mit der ECMAScript-kompatiblen
   JSON-Serialisierung erzeugt. Eine eigene Number-Formatierung ist verboten.
6. Das Ergebnis wird genau einmal als UTF-8 ohne BOM encodiert. Es gibt keinen
   abschließenden LF.
7. Beim Byte-Ingest erkennt ein vorangestellter Token-Scan doppelte
   Objektkeys und ungültige Unicode-Escapes vor `JSON.parse`; danach muss
   `canonicalize(parsed)` byteidentisch zur Eingabe sein. Der Token-Scan ist
   nötig, damit Fehlergründe nicht vom verlustbehafteten Duplicate-Key-Verhalten
   von `JSON.parse` abhängen.

Kanonische Pflichtvektoren:

| Eingabe als Datenwert | Exakte UTF-8-Ausgabe |
|---|---|
| `{z: 0, a: 'é', n: 1e-7}` | `{"a":"é","n":1e-7,"z":0}` |
| `{composed: 'é', decomposed: 'e\u0301'}` | `{"composed":"é","decomposed":"é"}` ohne Normalisierung |

Die zweite Ausgabe enthält für `decomposed` die zwei Codepoints `U+0065`
und `U+0301`. Ein Fixture mit einem ungepaarten Surrogat ist negativ.

Timestamps und andere variable Werte:

- `createdUtc` wird genau einmal vom späteren Runner erfasst und danach als unveränderlicher Eingabewert behandelt.
- Eine Rebuild-Verifikation generiert keinen neuen Timestamp.
- Timestamps sind Teil des Covers. Eine Änderung verändert den Digest.
- Filesystem-mtime, aktuelle Verifikationszeit und temporäre Pfade sind nie Teil der serialisierten Verträge.
- Ein anderer echter Run darf andere IDs und Timestamps haben und erzeugt erwartungsgemäß einen anderen Digest.

## 10. Digest-Vertrag v1

### 10.1 Pfadregeln

Ein kanonischer Bundlepfad:

1. ist relativ zum Bundle-Root;
2. verwendet ausschließlich `/`;
3. beginnt nicht mit `/`;
4. enthält keine leeren, `.`- oder `..`-Segmente;
5. enthält keinen Backslash, Doppelpunkt, NUL oder Drive-Präfix;
6. verwendet nur Kleinbuchstaben-ASCII, Ziffern, `.`, `_`, `-` und `/`;
7. ist nach Validierung bytegenau eindeutig;
8. kollidiert daher auch nicht nur durch Groß-/Kleinschreibung auf Windows.

Pfadnormalisierung wandelt Backslashes nicht still um. Nichtkanonische Eingabe wird abgewiesen.

Sortierung: aufsteigend nach den unsigned UTF-8-Bytes des gesamten Pfads, ohne Locale. Wegen des ASCII-Pfadvertrags entspricht dies stabiler ASCII-Ordnung.

### 10.2 Fileset-Frame

Hilfsfunktionen:

```text
u32be(n) = 4 Byte unsigned Big Endian
u64be(n) = 8 Byte unsigned Big Endian
utf8(s)  = UTF-8 ohne BOM
```

`u32be` und `u64be` sind Netzwerkbyteordnung. File Count und Pfadlänge werden
vor dem Schreiben gegen `2^32 - 1` geprüft. Inhaltslänge wird als `bigint`
gegen `2^64 - 1` geprüft. Negative, gebrochene, gerundete oder überlaufende
Werte werden abgewiesen. Kein Frame darf durch JavaScript-Number-Rundung
entstehen. Ein Pfad ist zusätzlich auf 512 UTF-16-Codeunits begrenzt; wegen des
ASCII-Vertrags ist dies zugleich seine maximale Bytezahl.
Alle drei BR-01-Domains verlangen mindestens eine Datei.

Bundle-Input:

```text
SHA256 input =
  utf8("hestia-benchmark-bundle-sha256-v1\0")
  || u32be(numberOfCoveredFiles)
  || for each covered file in canonical path order:
       u32be(pathByteLength)
       || utf8(canonicalPath)
       || u64be(contentByteLength)
       || exactContentBytes
```

Build-Input ist identisch, aber mit Domain:

```text
hestia-benchmark-build-sha256-v1\0
```

Beliebige andere Source-Filesets verwenden:

```text
hestia-benchmark-fileset-sha256-v1\0
```

Der ausgegebene String ist immer `sha256:` plus 64 lowercase Hexzeichen.

### 10.3 Bundle-Struktur und Cover

```text
benchmark-bundle/
  bundle-manifest.json
  artifact-manifest.json
  raw/
    <run-id>.json
  summary/
    summary.json       # erst ab BR-04, optional
    summary.md         # erst ab BR-04, optional
  artifacts/
    ...                # optional, rollenabhängig
  bundle.sha256
```

Innerhalb des Covers:

- `bundle-manifest.json`;
- `artifact-manifest.json`;
- jede in `artifact-manifest.json` genannte Nutzdatei.

Außerhalb des Covers:

- ausschließlich `bundle.sha256`.

Nicht zulässig:

- weitere unmanifestierte reguläre Dateien;
- fehlende manifestierte Dateien;
- Symlinks, Sockets, Devices oder FIFOs;
- das Listen von `artifact-manifest.json`, `bundle-manifest.json` oder `bundle.sha256` als Nutzartefakt;
- doppelte oder pfadkollidierende Entries;
- leere Nutzartefakte.

`bundle.sha256` enthält exakt eine ASCII-Zeile:

```text
hestia-benchmark-bundle-sha256-v1 sha256:<64-lowercase-hex>\n
```

### 10.4 Rebuild-Prozess

1. Alle Nutzartefakte kanonisch erzeugen und danach read-only behandeln.
2. Für jede Nutzdatei exakte Länge und einfachen `sha256(fileBytes)` bilden.
3. `artifact-manifest.json` mit kanonisch sortierten Entries erzeugen und als JCS schreiben.
4. Digest und Länge dieses Artifact-Manifests bilden.
5. `bundle-manifest.json` erzeugen, dabei Artifact-Manifest und Raw-Run-Referenzen binden, und als JCS schreiben.
6. Tatsächliche Dateimenge gegen die erlaubte Menge prüfen.
7. Bundle-Fileset-Digest über alle Dateien außer `bundle.sha256` bilden.
8. `bundle.sha256` exakt schreiben.
9. Keine Datei aus 1 bis 5 danach mehr verändern.

### 10.5 Verify-Prozess

1. `bundle.sha256` streng parsen, keine zusätzliche Zeile oder Whitespace erlauben.
2. Bundle- und Artifact-Manifest als kanonisches JCS prüfen.
3. Beide Schemas und danach semantische Regeln validieren.
4. Pfade, Rollen, Serialization, Einzigartigkeit, Länge und Per-File-Digests prüfen.
5. tatsächliche Verzeichnisdateien gegen die erwartete Menge vergleichen.
6. jeden JSON-/Text-Kanonisierungsvertrag prüfen.
7. Bundle-Digest aus den unveränderten Bytes neu bilden.
8. konstantzeitnah den erwarteten und tatsächlichen 32-Byte-Digest vergleichen.
9. Bei irgendeinem Fehler keine Teilfreigabe und keine automatische Reparatur.

## 11. Artifact- und Bundle-Manifestregeln

### 11.1 `BenchmarkArtifactManifestV1`

- `artifacts` ist streng nach `path` sortiert.
- `raw-run-json`, `summary-json` verwenden `jcs-rfc8785`.
- `summary-markdown` und Text-`failure-log` verwenden `utf8-lf-final-newline`.
- PNG, Heap-, GPU- und echte Binärtraceprodukte verwenden `binary-exact`.
- `runIds` ist sortiert, eindeutig und nie leer.
- Media Type und Extension müssen rollenkompatibel sein.
- `byteLength >= 1`; ein fehlendes Artefakt kann nicht als Null-Byte-Datei getarnt werden.

### 11.2 `BenchmarkBundleManifestV1`

- `artifactManifest.path` ist in v1 exakt `artifact-manifest.json`.
- `runs` enthält jeden Raw-Run genau einmal und verweist auf einen Artifact-Entry der Rolle `raw-run-json`.
- `excludedFromBundleDigest` ist exakt `['bundle.sha256']`.
- `performance-gate` ist semantisch nur zulässig, wenn alle Runs eligible und valide sind und eine externe Attestation vorhanden ist. Da BR-01 noch keinen Attestation-Vertrag implementiert, erzeugen BR-01-Tests nur `correctness`, `diagnostic` oder `informational`.
- Summary-Artefakte sind in BR-01 schemafähig, werden aber nicht erzeugt oder aggregiert.

## 12. Scenario Registry v1

BR-01 legt ausschließlich Contract-Entries an. `scenarioRegistryV1.ts` exportiert für jeden Entry `{definition, lifecycle}`. Nur `definition` geht in `definitionSha256` ein. `lifecycle.status` ist in BR-01 immer `contract-only` und darf später auf `implemented` wechseln, ohne die fachliche Definition umzudeuten.

Normative Domain-Kurzschrift in der folgenden Tabelle:

- `u32` bedeutet `{kind: 'uint32'}`;
- `int[a,b]` bedeutet `{kind: 'safe-integer-range', minimum: a, maximum: b}`;
- `enum[...]` enthält exakt die sortierten Werte in Klammern;
- `sha256` bedeutet `{kind: 'sha256'}`.

| Scenario | Fixture Contract v1 | Exakte `parameterContracts` | Phasen | Erlaubte Vergleichsachsen |
|---|---|---|---|---|
| `mesh-golden-world-v1` | `wp04-golden-world-v1`, gebunden an akzeptierte WP02-/WP04-Goldens | seed:u32; backend:enum[raw-webgpu,three-webgl2]; mesher:enum[greedy,greedy-ao,visible]; chunk-edge:enum[32]; worker-count:int[0,64] | cold, measurement, trace, warmup | candidate, mesher |
| `mesh-density-sweep-v1` | `density-volume-suite-v1`, leer, 1 %, 10 %, 50 %, 90 %, voll, Checkerboard | seed:u32; backend:enum[raw-webgpu,three-webgl2]; mesher:enum[greedy,greedy-ao,visible]; chunk-edge:enum[32,64]; worker-count:int[0,64]; density-case:enum[checkerboard,empty,fifty-percent,full,ninety-percent,one-percent,ten-percent] | cold, measurement, trace, warmup | candidate, chunk-edge, mesher |
| `scheduler-steady-v1` | `scheduler-edit-stream-v1`, ein deterministischer Edit alle 250 ms | seed:u32; backend:enum[raw-webgpu,three-webgl2]; mesher:enum[greedy-ao]; chunk-edge:enum[32]; worker-count:int[1,64]; duration-ms:enum[60000]; edit-interval-ms:enum[250]; command-stream-sha256:sha256 | measurement, stress, trace, warmup | candidate, worker-count |
| `scheduler-burst-v1` | `scheduler-edit-stream-v1`, 20 deterministische Edits alle 2.000 ms | seed:u32; backend:enum[raw-webgpu,three-webgl2]; mesher:enum[greedy-ao]; chunk-edge:enum[32]; worker-count:int[1,64]; duration-ms:enum[60000]; burst-size:enum[20]; burst-interval-ms:enum[2000]; command-stream-sha256:sha256 | measurement, stress, trace, warmup | candidate, worker-count |
| `brush-stress-v1` | `brush-command-stream-v1` | seed:u32; backend:enum[raw-webgpu,three-webgl2]; mesher:enum[greedy-ao]; chunk-edge:enum[32]; worker-count:int[1,64]; edit-count:enum[100,1000]; command-stream-sha256:sha256 | stress, trace, warmup | candidate, worker-count |
| `navigation-leak-v1` | `navigation-route-sequence-v1`, exakt WP01, WP02, WP03 Visible, WP03 Greedy, WP04, blank | stabilization-cycles:enum[20]; measurement-cycles:enum[100] | leak, trace | candidate |
| `backend-fixture-v1` | `backend-parity-world-v1`, identische Voxel-, AO-, Material-, Kamera- und Featurecontracts | seed:u32; backend:enum[raw-webgpu,three-webgl2]; mesher:enum[greedy-ao]; chunk-edge:enum[32]; worker-count:int[0,64]; camera-contract-sha256:sha256; feature-contract-sha256:sha256 | cold, measurement, trace, warmup | backend, candidate |

Die IDs `wp04-golden-world-v1` und `backend-parity-world-v1` sind BR-01-
Contract-IDs. Ihre `sourcePaths`, semantischen Inhalte und Digests werden erst
aus dem akzeptierten integrierten WP04-Stand erzeugt. Sie dürfen nicht aus dem
Research-SHA vorweggenommen werden. Fehlen die akzeptierten Goldens, stoppt die
spätere Implementierung vor Erzeugung der Registry-Goldens.

Exakte `metricContracts`:

| Scenario | Pflichtmetriken `name:kind:unit` | Capability-bedingte Metriken |
|---|---|---|
| `mesh-golden-world-v1` | `world-mesh-ms:duration:ms`, `chunk-mesh-ms:duration:ms`, `quad-count:counter:count`, `geometry-bytes:memory:bytes`, `coverage-sha256-match:liveness:count` | keine |
| `mesh-density-sweep-v1` | `chunk-mesh-ms:duration:ms`, `quad-count:counter:count`, `geometry-bytes:memory:bytes`, `coverage-sha256-match:liveness:count` | keine |
| `scheduler-steady-v1` | `queue-depth:counter:count`, `active-worker-count:counter:count`, `adoption-ms:duration:ms`, `latest-revision-visible:liveness:revision`, `heartbeat-gap-ms:duration:ms` | `long-task-ms:long-task:ms` wenn `long-tasks` supported |
| `scheduler-burst-v1` | `queue-depth:counter:count`, `queue-drain-ms:duration:ms`, `dropped-job-count:counter:count`, `stale-result-count:counter:count`, `latest-revision-visible:liveness:revision`, `heartbeat-gap-ms:duration:ms` | `long-task-ms:long-task:ms` wenn `long-tasks` supported |
| `brush-stress-v1` | `input-to-revision-submit-ms:duration:ms`, `latest-revision-visible:liveness:revision`, `world-sha256-match:liveness:count`, `queue-depth:counter:count`, `queue-drain-ms:duration:ms` | `long-task-ms:long-task:ms` wenn `long-tasks` supported |
| `navigation-leak-v1` | `js-heap-bytes:memory:bytes`, `embedder-heap-bytes:memory:bytes`, `backing-storage-bytes:memory:bytes`, `dom-document-count:counter:count`, `dom-node-count:counter:count`, `event-listener-count:counter:count`, `active-worker-count:counter:count`, `gpu-resource-count:counter:count` | keine |
| `backend-fixture-v1` | `draw-submit-cpu-ms:duration:ms`, `raf-interval-ms:frame:ms`, `memory-bytes:memory:bytes`, `image-contract-sha256-match:liveness:count` | `gpu-time-ms:gpu:ms` wenn die zum Backend gehörende Timestamp-Capability supported ist |

Exakte `capabilityContracts`:

| Scenario-Gruppe | Capability Contracts |
|---|---|
| beide Mesh-Szenarien | `performance-time-origin:must-support`, `webgl2:must-declare`, `webgpu:must-declare` |
| Scheduler und Brush | zusätzlich `dedicated-worker:must-support`, `long-tasks:must-declare` |
| Navigation | `cdp-runtime-heap-usage:must-support`, `cdp-memory-dom-counters:must-support`, `cdp-system-info:must-declare` |
| Backend | `performance-time-origin:must-support`, `webgl2:must-declare`, `webgpu:must-declare`, `webgl-disjoint-timer-query:must-declare`, `webgpu-timestamp-query:must-declare` |

Wenn der Parameter `backend` `three-webgl2` ist, muss `webgl2` supported sein;
bei `raw-webgpu` muss `webgpu` supported sein. Eine nicht unterstützte
Timestamp-Capability wird ehrlich als unsupported erfasst; die bedingte
GPU-Metrik fehlt dann und darf nicht durch CPU- oder rAF-Werte ersetzt werden.

Alle Definitionen enthalten dieselben sortierten `fairnessKeys`:
`browser-build`, `browser-flags`, `display`, `fixture-semantic-sha256`,
`fixture-source-fileset-sha256`, `gpu`, `hardware-profile`, `os`, `phase`,
`power`, `run-plan-sha256` und `scenario-definition-sha256`. Der Runplan darf
pro Vergleich genau eine erlaubte Vergleichsachse aktivieren. Alle anderen
Parameter und Fairnesswerte müssen gleich bleiben. Das Fixture ist nie eine
Vergleichsachse.

Registry-Invarianten:

1. IDs und Versionen sind einzigartig.
2. Definitionen sind JSON-sicher und JCS-kanonisch hashbar.
3. Parameter-, Metric-, Capability-, Phase-, Axis- und Fairnesslisten sind nach ID beziehungsweise Literal sortiert und eindeutig.
4. `parameterContracts` besitzen keine überlappenden Keys und alle Enums sind nichtleer, sortiert und eindeutig.
5. Jeder bedingte Metric Contract verweist auf genau einen vorhandenen `must-declare` Capability Contract.
6. Keine Registryfunktion importiert Runtime-Scenario-Code.
7. Ein `contract-only` Entry darf nicht ausgeführt werden. Der spätere Runner muss das Fehlen der Implementierung als Hard Fail behandeln.
8. `backend-fixture-v1` bindet identische Qualitätsfeatures. Ein Backend darf AO, Kanten, Sichtweite oder Auflösung nicht asymmetrisch deaktivieren.

## 13. Dependencyentscheidung

### 13.1 Vergleich

| Variante | Stärken | Risiken / Kosten | Urteil |
|---|---|---|---|
| Nur eigene enge Validierung, keine zusätzliche Dependency | null Browserbundle, vollständige Kontrolle über Cross-Field-Regeln, wenig Supply-Chain-Fläche | Das echte JSON Schema könnte ungetestet vom Handvalidator abweichen; Draft-Details müssten selbst nachgebaut werden | Allein nicht ausreichend |
| AJV als Runtime-Dependency | Vollständige Draft-2020-12-Validierung; etabliertes Projekt | unnötige Browser-/Runtime-Fläche, Codegenerierung, zusätzliche Transitives, Schema deckt Cross-Field-/Digestregeln trotzdem nicht vollständig ab | Für BR-01 abgelehnt |
| Eigener enger Runtime-Validator plus AJV nur als exakt gepinnte Dev-Dependency | Browserbundle bleibt frei; echte Schemata werden unabhängig geprüft; Cross-Field-Regeln bleiben projektspezifisch | Lockfile- und Dev-Supply-Chain-Zuwachs; die strukturellen Validatorstufen benötigen Paritätstests | **Ausgewählt** |

### 13.2 Lizenz, Bundle und Wartung

Aktueller Primärquellenstand am 2026-08-12:

- [AJV](https://github.com/ajv-validator/ajv) unterstützt Draft 2020-12 und Browser/Node.
- [AJV-Lizenz](https://github.com/ajv-validator/ajv/blob/master/LICENSE) ist MIT.
- [AJV v8.20.0](https://registry.npmjs.org/ajv/8.20.0) ist laut npm-Registry die aktuelle Version. Das Paket meldet rund 1.033.496 entpackte Bytes, 466 Dateien und vier direkte Transitives. Diese Werte sind Package-Footprint, kein Browserbundle-Messwert.
- AJV dokumentiert [Standalone-/Precompile-Optionen](https://ajv.js.org/guide/managing-schemas.html#standalone-validation-code), die für BR-01 nicht nötig sind.

Implementierungsentscheidung:

```json
{
  "devDependencies": {
    "ajv": "8.20.0"
  }
}
```

Regeln:

1. exakte Version ohne `^` oder `~`, passend zum bestehenden Repositorystil;
2. Import ausschließlich aus `tests/unit/benchmark/**`;
3. Draft-2020-12-Instanz mit `strict: true`, `allErrors: true`, ohne Datenmutation, Type-Coercion, Defaults oder Property-Removal;
4. keine Remote-Schemaauflösung;
5. keine `format`-Dependency: UTC wird durch Pattern plus eigenen Kalendercheck validiert;
6. Lockfile-Review auf aufgelöste Versionen und Lizenzen. Unerwartete nichtpermissive Lizenz ist Stop-Gate;
7. statischer Test verbietet `ajv`-Imports unter `src/**`;
8. kein `ajv-formats`, kein AJV-CLI, kein Standalone-Codegenerator in BR-01.

## 14. Pflicht-Testmatrix

### 14.1 Genau spezifizierte Mindestmenge von 17 positiven Fällen

| ID | Positiver Fall |
|---|---|
| P01 | Minimaler valider `measurement`-Run mit einem Duration-Sample |
| P02 | Valider `cold`-Run mit eigenem Prozessordinal |
| P03 | Valider `warmup`-Run mit `measurementEligibility: ineligible` |
| P04 | Valider `stress`-Run mit Counter- und Liveness-Samples |
| P05 | Valider `trace`-Run, explizit nicht gatefähig |
| P06 | Valider `leak`-Run für `navigation-leak-v1` |
| P07 | Unterstützte WebGL2-Capability ohne Detailfeld |
| P08 | Explizit unsupported WebGPU-Timestamp-Capability ohne Nullsample |
| P09 | Invalider Run mit mindestens einem Reason und null Samples |
| P10 | Gültiger Counterwert 0 als echte Messung, nicht als Missing-Sentinel |
| P11 | JCS mit nicht-ASCII String, ohne Unicode-Normalisierung |
| P12 | Gültiges Bundle nur mit einem Raw-Run |
| P13 | Gültiges Bundle mit Raw JSON, Summary JSON, Markdown und PNG-Binärfixture |
| P14 | Kanonische Pfadsortierung über mehrere Verzeichnistiefen |
| P15 | Rebuild mit identischen Inputs erzeugt identische Bytes und Digest |
| P16 | Infrastruktur-Rerun mit dokumentierter Ersetzung und Approval-ID |
| P17 | Alle sieben Scenario-Definitionen validieren und haben stabile Digests |

Jeder positive JSON-Fall muss sowohl gegen AJV als auch gegen den engen Validator bestehen.

### 14.2 Genau spezifizierte Mindestmenge von 68 negativen Fail-closed-Fällen

| ID | Negativer Fall | Erwartung |
|---|---|---|
| N01 | unbekannte `schemaVersion` | reject |
| N02 | unbekannte `protocolVersion` | reject |
| N03 | zusätzliche Top-Level-Property | reject |
| N04 | fehlende `commitSha` | reject |
| N05 | Commit-SHA mit 39/41 Zeichen | reject |
| N06 | uppercase Commit-SHA | reject |
| N07 | `worktree.state = dirty` | reject `source-dirty` |
| N08 | nichtleerer Porcelain-Digest statt SHA-256 der leeren Bytes | reject |
| N09 | `.gitmodules`/Submodule in v1 | reject |
| N10 | Commit-Tree stimmt nicht zu Commit | reject `source-tree-mismatch` |
| N11 | Build-Digest falsches Format | reject |
| N12 | Build-Dateianzahl 0 | reject |
| N13 | Fixture-Semantic-Digest fehlt | reject |
| N14 | Fixture-Source-Digest stimmt nicht | reject `fixture-contract-mismatch` |
| N15 | Candidate-Digest stimmt nicht | reject `candidate-contract-mismatch` |
| N16 | Scenario-Fixture ungleich Source-Fixture | reject |
| N17 | unbekannte Scenario-ID | reject |
| N18 | Scenario-Version 2 unter v1-ID | reject |
| N19 | Definition-Digest stimmt nicht zur Registry | reject |
| N20 | Required-Parameter fehlt | reject |
| N21 | zusätzlicher oder doppelter Parameter | reject |
| N22 | Runplan-Digest stimmt nicht | reject `run-plan-mismatch` |
| N23 | Order-Candidate ungleich Source-Candidate | reject |
| N24 | fehlendes CPU-/GPU-/Browserfeld | reject `environment-incomplete` |
| N25 | Hardwarefeld `null`, leer oder als `unknown` getarnt | reject |
| N26 | DPR 0 oder Refresh 0 | reject |
| N27 | eligible Run bei hidden Dokument | reject `document-hidden` |
| N28 | eligible Run unfokussiert | reject `document-unfocused` |
| N29 | eligible Run mit Hintergrundtab | reject `background-tabs-present` |
| N30 | eligible Performance-Run headless | reject |
| N31 | Warm-up oder Trace als eligible | reject |
| N32 | gültiger Run ohne Samples | reject |
| N33 | invalider Run ohne Reason | reject |
| N34 | valides Sample ohne Wert | reject |
| N35 | invalides Sample mit Zahlenwert oder ohne Reason | reject |
| N36 | Duration negativ, `NaN`, Infinity oder `-0` | reject `sample-invalid` |
| N37 | Duration mit Unit `bytes` | reject |
| N38 | doppelter Sample-Identifier | reject |
| N39 | Lücke oder Duplikat in Sample-Ordinals | reject |
| N40 | Sample-Runbinding ungleich Top-Level-Bindung | reject |
| N41 | Top-Level-Metadaten eines alten Runs geändert, Samples unverändert | reject |
| N42 | doppelter JSON-Key in Rawbytes | reject vor Schema |
| N43 | Pretty-Print-/Whitespace-JSON statt JCS | reject vor Schema |
| N44 | UTF-8-BOM in JSON oder Markdown | reject |
| N45 | CRLF oder fehlender/doppelter finaler LF in Markdown | reject |
| N46 | absoluter Artifact-Pfad | reject |
| N47 | `../`, `./`, `//`, Backslash oder Drive-Prefix im Pfad | reject |
| N48 | uppercase Pfad oder Case-Kollision | reject |
| N49 | doppelter Artifact-Pfad | reject |
| N50 | Artifact-Manifest listet sich selbst oder `bundle.sha256` | reject |
| N51 | manifestierte Datei fehlt | reject |
| N52 | unmanifestierte Datei vorhanden | reject |
| N53 | ByteLength stimmt nicht | reject |
| N54 | Per-File-Digest stimmt nicht | reject |
| N55 | Artifact-Rolle und Serialization/Extension widersprechen sich | reject |
| N56 | Symlink oder Spezialdatei im Bundle | reject |
| N57 | `bundle.sha256` hat zweite Zeile, falsche Domain oder uppercase Hex | reject |
| N58 | ein Byte in Raw JSON manipuliert | reject Bundle-Digest |
| N59 | ein Byte im Binärartefakt manipuliert | reject File- und Bundle-Digest |
| N60 | Timestamp nach Bundlebildung geändert | reject Bundle-Digest |
| N61 | Scenario-Parameter außerhalb seiner Registry-Domain | reject semantic |
| N62 | Runtime-State und Execution-Page-State widersprechen sich | reject semantic |
| N63 | eligible Run mit dokumentierter konkurrierender Last | reject semantic |
| N64 | eligible Performance-Run mit `thermalState: not-observable` | reject semantic |
| N65 | Pflichtmetrik fehlt oder besitzt falsches Kind/Unit | reject semantic |
| N66 | bedingte GPU-Metrik trotz supported Capability fehlt oder ersetzt wird | reject semantic |
| N67 | kanonischer Pfad endet mit Slash | reject schema/path |
| N68 | JCS-String oder Property-Name enthält ungepaarten Surrogat | reject parse/canonicalization |

Jede Fixture besitzt in der Testtabelle ein maschinenlesbares
`expectedStage`: N01 bis N08, N11 bis N13, N17, N18, N24 bis N26 und N32 bis
N35 sind primäre `schema`-Fälle. N09, N10, N14, N15 und N22 sind
`provenance-or-bundle`. N16, N19 bis N21, N23, N27 bis N31, N37 bis N41 und
N61 bis N66 sind `semantic`. N42 bis N45 und N68 sind `parse` oder
Kanonisierung. N46 bis N60 sowie N67 laufen durch Path-/Bundle-Verifikation,
wobei schemafähige Manifestfehler zusätzlich bereits am Schema scheitern
dürfen. N36 wird als vier getrennte Dateien für negativ, `NaN`, Infinity und
`-0` realisiert; damit liegt die tatsächliche negative Fixturezahl über 68.

### 14.3 Digest-Goldenvektoren

Die Referenzvektoren werden aus den in Abschnitt 10 definierten Frames gebildet.
`one` enthält `raw/a.json` mit exakt den zwei ASCII-Bytes `{}`. `two`
enthält, absichtlich in umgekehrter Eingabereihenfolge, `raw/b.bin` mit den
Bytes `00 ff 7f` und `raw/a.json` mit den UTF-8-Bytes von `{"x":"é"}`.

| Vektor | Domain | Erwarteter Digest |
|---|---|---|
| `one` | bundle | `sha256:89e96222ca56b9f5b644335e77bb6ab3cfea13609e0597bc3993dda397479ff9` |
| `one` | build | `sha256:c4dcbcc31d13804dfd9aef002180bfdfa506a032aecc8c03f1de81083ba7b848` |
| `one` | fileset | `sha256:4c04d3132c6d1a83c2aa9e88bd306438042db860b6eda928c33102ad36cbdacd` |
| `two` | bundle | `sha256:1698d25ed954db053205d9e0dd0fcbefcd5742e42c200a304f850810127019a9` |
| `two` | build | `sha256:972c3791b68448520059bd6f9c5e157a6c19a92d485ef7ce5bbff57b8c6ecf74` |
| `two` | fileset | `sha256:8b674729c9e5dfc263daff41f4a7cbecded86d11341af0f7ca83017e9396d120` |

Zusätzliche Pflichtvektoren:

1. leere Payloadmenge ist für Bundle, Build und Source-Filesets unzulässig und wird vor dem Hashen abgewiesen;
2. `two` in kanonischer und umgekehrter Eingabereihenfolge ergibt denselben Digest;
3. `raw/a.json` zu `raw/c.json` bei gleichen `{}`-Bytes ändert den Bundle-Digest auf `sha256:f6bd6deae2c31205b331162f8ca15e88531b719aff75c01acdcb0a3c8d8f64ef`;
4. ByteLength-Frames trennen Pfad `a` plus Inhalt `bc` (`sha256:d38dad033b1f42291988482a8b79b92bd2b771098781194830d5481f69eb3edf`) von Pfad `ab` plus Inhalt `c` (`sha256:125577fe4e63cf690a207be12a105318dc2f0ee92861a5ad8d8417c6209ed6a1`) unter der Fileset-Domain;
5. JSON- und Binärbytes werden exakt unterschieden;
6. `bundle.sha256` beeinflusst den Bundle-Digest nicht;
7. jede andere zusätzliche Datei beeinflusst oder invalidiert das Bundle;
8. RFC-8785-Zahlen-/Unicode-Testvektoren werden lokal als erwartete Bytes nachgebildet, ohne Fremdimplementierung zu kopieren;
9. Build-, Bundle- und Fileset-Domain mit identischem Fileset ergeben die drei verschiedenen `one`-Digests aus der Tabelle.

## 15. Akzeptanz- und Stop-Gates

### 15.1 Akzeptanz

BR-01 ist erst fertig, wenn:

- alle vier Schemata gegen Draft 2020-12 kompilieren;
- mindestens 17 positive und 68 negative Fälle wie oben existieren;
- AJV und der strukturelle Validator bei allen `schema`-Fixtures dasselbe Ergebnis liefern; `semantic`-Fixtures müssen das Schema bestehen und im Vollvalidator scheitern;
- JCS-, Pfad-, Per-File-, Fileset- und Bundle-Digest-Goldens bestehen;
- Source-Preflight dirty, falschen SHA und falschen Tree fail-closed abweist;
- Registry genau die sieben v1-Einträge enthält, alle `contract-only`;
- `src/**` keinen AJV-, Three-, DOM-, Playwright-, Worker- oder Telemetrieimport im BR-01-Pfad besitzt;
- bestehende WP02-/WP03-/WP04-Goldens und WP01-/WP04-Evidence byteidentisch bleiben;
- `package-lock.json` ausschließlich durch die exakt gepinnte AJV-Dev-Dependency und ihre aufgelösten Transitives geändert wird;
- Dokumentation und maschinelle Verträge dieselben Versionsliterale verwenden;
- `git diff --check` und der relevante Build-/Unit-Gate erfolgreich sind;
- kein Evidence-, E2E-, Browser- oder Benchmarklauf für BR-01 nötig oder behauptet wird.

### 15.2 Harte Scope-Stop-Gates

BR-01 darf nicht enthalten:

- `performance.now()` oder eine andere Dauererfassung;
- `PerformanceObserver`, Event Timing oder Long Tasks;
- Playwright-, CDP- oder Browserprozesssteuerung;
- Perzentile, Mittelwerte, Bootstrap, Konfidenzintervalle oder Aggregation;
- Browserroute, HUD, Screenshotcapture oder Evidence-Erzeugung;
- Mesher-, Renderer-, Voxel-, Palette-, AO- oder Produktlogik;
- Worker, Scheduler, Queue, Revisionadoption oder WP05-Code;
- WebGPU-/WebGL-Timerquery-Implementierung;
- Änderung alter Goldens oder Evidence;
- Runtime-Dependency auf AJV oder eine andere Schemaengine.

Wenn eine dieser Funktionen zur Erfüllung vermeintlich nötig erscheint, stoppt der Implementierungsagent und meldet Scope-Drift.

## 16. Implementierungsreihenfolge für den späteren Agenten

1. akzeptierten integrierten WP04-SHA verifizieren und isolierten Branch erstellen;
2. Versionen, Marken und Typen implementieren;
3. Scenario-Definitionen und stabile Registry-Digests implementieren;
4. JSON-Schemata hinzufügen;
5. engen Validator mit strukturierten Fehlern implementieren;
6. JCS- und Path-Canonicalization implementieren;
7. Fileset-/Build-/Bundle-Digest implementieren;
8. Source-Preflight hinter injizierbarem Command-Runner implementieren;
9. positive/negative Fixtures und Digestvektoren implementieren;
10. AJV exakt als Dev-Dependency hinzufügen und strukturelle Parität plus getrennte Semantiktests aktivieren;
11. Doku schreiben und Scope-Gates prüfen;
12. build/unit/diff-check, Commit und Push; kein E2E, keine Evidence, kein Merge, kein BR-02.

## 17. Offene Owner-Entscheidungen

Keine der folgenden Entscheidungen blockiert die spätere BR-01-Implementierung:

1. **Explizite Lizenz des öffentlichen Voxel-Labs.** D-014 bleibt offen. Vor externer Wiederverwendung, Contributions oder Release muss der Owner eine Lizenz festlegen.
2. **Ablage und Attestation echter Performance-Bundles.** Vor dem ersten `performance-gate` muss entschieden werden, ob Bundles nur als CI-Artefakte, in einem externen immutable Store oder zusätzlich committed publiziert werden und wer den Digest attestiert.
3. **Konkrete H1-/H2-/H3-Hardwareprofile.** Diese Namen und Geräte werden vor blockierenden Performancebudgets benötigt, nicht für BR-01-Verträge.
4. **Zielbrowser außerhalb Chrome/Edge.** Die Contract-Struktur ist browserneutral; die Produkt-Supportentscheidung bleibt später offen.

Nicht als Owner-Entscheidung offen:

- AJV wird für BR-01 nur als exakt gepinnte Dev-Dependency verwendet.
- `bundle.sha256` ist die einzige Digest-Ausnahme.
- JCS und der längenpräfixierte SHA-256-Filesetvertrag sind v1-normativ.

## 18. Bekannte Grenzen und spätere Arbeit

- BR-01 erzeugt keine Samples und kann keine Performanceaussage begründen.
- BR-02 implementiert später In-Browser-Telemetrie und muss diese Contracts konsumieren, nicht duplizieren.
- BR-03 erzeugt Runpläne, Environment-Capture, Browserprozesse und externe Attestation.
- BR-04 aggregiert. Summary-Typen sind in BR-01 nur als Artifact-Rollen reserviert.
- BR-05 ergänzt GPU-/Memory-/Leak-spezifische Samples, ohne v1-Felder als Nullwerte zu missbrauchen. Falls die vorhandenen Sampleunions nicht reichen, ist ein neues Schema nötig.
- Eine externe Signatur-/Attestation-Spezifikation ist bewusst nicht Teil von BR-01.

## 19. Quellen- und Lizenzverzeichnis

| Quelle | Verwendeter Stand | Rolle | Lizenz-/Nutzungsstatus |
|---|---|---|---|
| WELTRAUM Project Instructions, Memory, Register, Decision Log und Synthesis | bereitgestellte Stände vom 2026-08-12 | akzeptierte Projektwahrheit, Roadmap und Governance | projektinterne Quellen; nur analysiert |
| `07_benchmark_test_methodology_audit_report.md` | bereitgestellter Abschlussbericht | Benchmark Protocol v1, Szenarien und Methodik | projektinterne Researchquelle; keine Fremdcodeübernahme |
| `voxel-kernel-lab-wp04-agent-prompt.md` | aktueller bereitgestellter Prompt | spätere WP04-Kompatibilität und Scope-Grenze | Planungsquelle, kein Beleg für akzeptierten WP04-Code |
| [Hestia Voxel Kernel Lab](https://github.com/BenjaminHornung/hestia-voxel-kernel-lab/tree/d95992df05952ac4be6221ca1809c1c9e3c0ac9d) | `d95992d...` | Code-/Manifest-Evidence | Im geprüften Tree keine LICENSE; nur read-only analysiert |
| [JSON Schema Draft 2020-12](https://json-schema.org/draft/2020-12/) | 2020-12, publiziert 2022-06-16 | Schemasprache | Spezifikationsreferenz, keine Codeübernahme |
| [RFC 8785](https://www.rfc-editor.org/rfc/rfc8785.html) | RFC 8785 | JSON-Kanonisierung | IETF-Dokument, Algorithmus spezifiziert; keine Referenzcodekopie |
| [NIST FIPS 180-4](https://csrc.nist.gov/pubs/fips/180-4/upd1/final) | August 2015 | SHA-256 | Standardreferenz |
| [Git status](https://git-scm.com/docs/git-status) und [Git revisions](https://git-scm.com/docs/gitrevisions) | aktuelle offizielle Doku, geprüft 2026-08-12 | Clean-Tree/Commit-Tree | Dokumentationsreferenz |
| [AJV](https://github.com/ajv-validator/ajv) | v8.20.0 | Dev-only unabhängige Schemavalidierung | MIT; Copyright-/Lizenzhinweis gemäß MIT beachten |

## 20. Copy-and-paste-Handoff-Prompt für genau einen lokalen Implementierungsagenten

```text
Du bist genau ein lokaler Codex-Write-Agent. Implementiere ausschließlich BR-01
"Benchmark-Contracts und Provenienz" im Repository:

BenjaminHornung/hestia-voxel-kernel-lab

WICHTIGE BASISREGEL:
- Verwende NICHT d95992df05952ac4be6221ca1809c1c9e3c0ac9d als automatische
  Implementierungsbasis.
- Fordere vom Owner/Koordinator zuerst den ausdrücklich akzeptierten und bereits
  in integration/voxel-kernel-lab-v1 integrierten WP04-SHA als {ACCEPTED_WP04_SHA}.
- Fetch remote read-only, verifiziere:
  origin/integration/voxel-kernel-lab-v1 == {ACCEPTED_WP04_SHA}
  und merge-base == {ACCEPTED_WP04_SHA}.
- Bei jeder Abweichung stoppen.

PARALLELITÄT UND GIT:
- Maximal ein Write-Agent im Repository.
- Erzeuge einen isolierten Worktree und Branch agent/br-01-benchmark-contracts
  exakt von {ACCEPTED_WP04_SHA}.
- Kein Write auf main oder Integrationsbranch.
- Kein Merge, Rebase, Squash oder Force Push.
- Weltraum-Spiel nicht verändern.
- Commit und non-force Push, danach stoppen.
- Vorgesehene Commitmessage:
  #VOXEL-LAB-BR-001 Add benchmark contracts and provenance

LIES VOR ÄNDERUNGEN:
1. AGENTS.md
2. die vollständige Datei BR01_benchmark_contracts_provenance_specification.md,
   deren Abschnitte 3 bis 15 normativ sind; ist sie nicht lokal bereitgestellt,
   vor jeder Änderung stoppen und sie anfordern
3. tests/contracts/wp02FixtureGolden.ts
4. tests/contracts/wp03GreedyGolden.ts
5. die integrierten WP04-Goldens und das WP04-Manifest am akzeptierten SHA
6. package.json, package-lock.json, tsconfig.json, vitest.config.ts

ZIELDATEIEN:
src/benchmark/contracts/
  versions.ts
  typesV1.ts
  scenarioRegistryV1.ts
  validateV1.ts
  index.ts
  schemas/
    benchmark-run-v1.schema.json
    benchmark-artifact-manifest-v1.schema.json
    benchmark-bundle-manifest-v1.schema.json
    benchmark-scenario-definition-v1.schema.json

src/benchmark/provenance/
  canonicalJsonV1.ts
  canonicalPathV1.ts
  fileSetDigestV1.ts
  sourcePreflightV1.ts
  bundleV1.ts
  index.ts

tests/contracts/benchmark/
tests/fixtures/benchmark/v1/
tests/unit/benchmark/
docs/benchmark/

Ändere package.json und package-lock.json ausschließlich für:
  devDependency "ajv": "8.20.0"
Kein ^ oder ~. Importiere AJV ausschließlich unter tests/unit/benchmark/**.
Kein ajv-formats, AJV-CLI oder Standalone-Codegenerator.

NORMATIVE CONTRACTS:
- BenchmarkProtocolVersion = benchmark-protocol-v1
- geschlossene Draft-2020-12-Schemata mit additionalProperties=false
- alle Versionen unbekannt => Hard Fail
- keine Three.js-, DOM-, Playwright-, Worker- oder Renderer-Typen in Contracts
- keine null/0-Sentinels für fehlende Provenienz oder Capabilities
- diskriminierte Capability- und InvalidReason-Verträge
- runBindingSha256 = SHA-256 über JCS von Version, Run-ID, Timestamp,
  Source, Scenario, Environment und Execution; keine Samples und nicht das
  Digestfeld selbst
- jeder Sample muss denselben neu berechneten runBindingSha256 tragen
- Scenario-Fixture muss exakt Source-Fixture entsprechen
- Order-Candidate muss exakt Source-Candidate entsprechen
- Runtime-State und Execution-Page-State müssen exakt übereinstimmen
- eligible verlangt visible, focused, 0 Backgroundtabs, keine konkurrierende
  Last und thermalState nominal
- Parameter-, Metric-, Capability-, Comparison-Axis- und Fairnessverträge
  exakt nach Abschnitt 12 implementieren
- Paths/Keys/IDs/Samples sortiert und eindeutig; Zahlen finite, safe, nicht -0

SOURCE PREFLIGHT:
- Erwarteten {ACCEPTED_WP04_SHA} als Pflichtargument verwenden.
- HEAD^{commit} und HEAD^{tree} erfassen.
- Exakt diesen Statusbefehl binden:
  git status --porcelain=v2 -z --untracked-files=all --ignore-submodules=none
- Nur 0 Byte stdout ist clean. SHA-256 der leeren Bytes ist:
  sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
- Protocol v1 weist Submodule/.gitmodules ab.
- Command-Ausführung für Unit Tests injizierbar machen. Tests dürfen das echte
  Repository nicht verändern.

CANONICAL JSON:
- RFC 8785 JCS, UTF-8, kein BOM, kein Whitespace, kein finaler LF.
- Keine Unicode-Normalisierung.
- Objektkeys nach rohen UTF-16-Codeunits, niemals localeCompare oder
  UTF-8-Sortierung; Arrays unverändert.
- ungepaarte Surrogate, Accessors, BigInt, undefined, nichtfinite Zahlen,
  -0, Zyklen und nicht einfache Objekte fail-closed.
- Ein Token-Scan weist doppelte Keys vor JSON.parse ab; danach muss
  parse + JCS byteidentisch sein. Nichtkanonische Zahlen/Whitespace fail-closed.
- Markdown/Text: UTF-8, kein BOM, LF-only, exakt ein finaler LF.
- Binärartefakte: exakte Bytes.

PATH POLICY:
- relative lowercase ASCII POSIX paths;
- nur a-z, 0-9, Punkt, Unterstrich, Bindestrich und Slash;
- kein absoluter Pfad, Backslash, Doppelpunkt, NUL, leeres Segment, . oder ..;
- maximal 512 Zeichen und kein abschließender Slash;
- keine stille Umwandlung; sortiere nach unsigned UTF-8-Bytes ohne Locale.

DIGEST V1:
- SHA-256.
- Bundle-Domain: hestia-benchmark-bundle-sha256-v1\0
- Build-Domain: hestia-benchmark-build-sha256-v1\0
- Fileset-Domain: hestia-benchmark-fileset-sha256-v1\0
- Danach u32be(fileCount).
- Pro kanonisch sortierter Datei:
  u32be(pathByteLength) || utf8(path) || u64be(contentByteLength) || bytes
- u32/u64 vor Serialisierung ohne Number-Rundung auf Overflow prüfen;
  Inhaltslängen als bigint framen.
- Output: sha256:<64 lowercase hex>.
- Bundle cover enthält bundle-manifest.json, artifact-manifest.json und alle
  Nutzartefakte.
- Einzige Ausnahme: bundle.sha256.
- bundle.sha256 exakt:
  hestia-benchmark-bundle-sha256-v1 sha256:<hex>\n
- Unmanifestierte/fehlende Datei, Symlink, Spezialdatei, Pfadduplikat oder
  Manipulation => Hard Fail. Keine Auto-Reparatur.

SCENARIO REGISTRY, NUR CONTRACT-ONLY:
- mesh-golden-world-v1
- mesh-density-sweep-v1
- scheduler-steady-v1
- scheduler-burst-v1
- brush-stress-v1
- navigation-leak-v1
- backend-fixture-v1
Implementiere `parameterContracts`, `metricContracts`, `capabilityContracts`,
`comparisonAxes` und `fairnessKeys` bytegenau nach Abschnitt 12 der
Spezifikation. Binde die dort genannten BR-01-Fixture-Contract-IDs an die
tatsächlichen akzeptierten WP04-Sourcepfade und Goldens. Fehlen diese, stoppe.
Implementiere keinerlei Laufzeitlogik. Hash nur die fachliche Definition,
nicht den Lifecycle-Status. Contract-only darf nicht ausgeführt werden.

TESTS:
- mindestens 17 positive Fixtures;
- mindestens 68 negative Fail-closed-Fixtures aus der Spezifikation;
- AJV und struktureller Validator müssen bei `schema`-Fixtures übereinstimmen;
- `semantic`-Fixtures müssen AJV bestehen und im Vollvalidator fail-closed scheitern;
- JCS-, Unicode-, Zahl-, Pfad-, Framing-, Domain- und Digest-Goldens;
- Tamper, dirty source, falscher SHA/Tree/Buildhash, unbekannte Version,
  Environment-Missing, ungültige Samples, Self-Reference, Traversal,
  Duplicate Artifact, unmanifestierte Datei und Binary-Tamper;
- statischer Test: kein AJV-Import unter src/**.

UNVERÄNDERLICH:
- tests/contracts/wp02FixtureGolden.ts
- tests/contracts/wp03GreedyGolden.ts
- alle integrierten WP04-Goldens
- evidence/wp01/** bis evidence/wp04/**
- bestehende Runtime-, Renderer-, Mesher-, Voxel-, Palette- und AO-Logik

HARTE STOP-GRENZE:
BR-01 enthält KEIN:
- performance.now oder andere Dauererfassung
- PerformanceObserver/Event Timing/Long Tasks
- Playwright/CDP/Browserrunner/E2E
- Perzentile, Mittelwert, Bootstrap, CI oder Aggregator
- Evidence-Erzeugung, Screenshot oder HUD
- Worker/Scheduler/Queue/Revisionadoption/WP05
- Produktlogik, WebGPU-Timer oder GPU-/Memory-Messung
- Runtime-Dependency auf AJV

VERIFIKATION:
- npm ci
- npm run build
- npm test
- git diff --check
- prüfe byteidentische alte Goldens/Evidence
- prüfe, dass package-lock nur AJV-Dev-Dependency und erwartete Transitives ändert
- KEIN test:e2e und KEIN evidence script für BR-01
- keine Benchmark- oder Performancebehauptung

VOR COMMIT:
- technisches Self-Review gegen jeden Contract und Stop-Gate
- keine offenen P0/P1/P2
- git status --short und exakten Diff dokumentieren

ABSCHLUSSAUSGABE:
1. Basis-SHA {ACCEPTED_WP04_SHA}
2. Worktree/Branch
3. finaler Commit/Remote-Branch
4. geänderte Dateien nach Contracts/Schemas/Provenance/Tests/Docs/Dependency
5. Schema- und TypeScript-Versionen
6. Digest-Goldenwerte und Testfallzahlen
7. AJV-Version, aufgelöste Transitives und Lizenzreview
8. build/unit/diff-check Ergebnisse
9. Bestätigung: alte Goldens und Evidence byteidentisch
10. Bestätigung: kein E2E, keine Evidence, keine Messung, kein WP05, kein Produktrepo
11. offene Findings
12. finales git status --short
13. kein Merge durchgeführt

Beginne nicht BR-02. Stoppe nach Commit und Push.
```
