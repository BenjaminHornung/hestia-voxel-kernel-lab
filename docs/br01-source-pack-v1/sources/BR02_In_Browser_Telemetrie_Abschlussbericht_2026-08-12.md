# BR-02 In-Browser-Telemetrie

## Implementierungsreife Spezifikation und Abschlussbericht

| Feld | Wert |
| --- | --- |
| Arbeitspaket | BR-02 In-Browser-Telemetrie |
| Datum | 2026-08-12 |
| Planungsbasis | `BenjaminHornung/hestia-voxel-kernel-lab` |
| Kanonischer Audit-SHA | `d95992df05952ac4be6221ca1809c1c9e3c0ac9d` |
| Ausführungsart | Cloud, Recherche und Spezifikation, GitHub read-only |
| Ergebnis | Implementierungsvertrag, keine Implementierung |
| Abschlussstatus | `READY_FOR_LATER_IMPLEMENTATION` |

## 1. Kurzentscheidung

BR-02 soll einen kleinen, typisierten und begrenzten Rohdatensink im Browser bereitstellen. Er erfasst Main-Thread-, Browser- und später Worker-Marker, normalisiert Zeitstempel über `performance.timeOrigin + performance.now()`, korreliert Arbeit über unveränderliche IDs und exportiert eine kanonische JSON-Datei über einen nur in Benchmark-Builds sichtbaren Einmal-Download. BR-02 bildet weder Perzentile noch Konfidenzintervalle und steuert keine Cold-, Warm-up- oder Prozessmatrix.

Die entscheidenden Grenzen sind festgelegt:

1. `rafIntervalMs`, Main-App-Work, Draw-Submit-CPU, Long Tasks, Event Timing und Workerphasen bleiben verschiedene Messgrößen.
2. Browsernäherungen tragen explizit `browser-approximation`; Cross-Realm-Differenzen tragen `normalized-cross-realm`.
3. Eine nicht unterstützte API erzeugt eine Capability mit `unsupported`, niemals einen Messwert 0.
4. Rohwerte werden nicht gerundet. `toFixed`, HUD-Text und bereits aggregierte Werte sind keine Exportquelle.
5. Der Messpuffer ist bounded append-only. Er überschreibt keine alten Ereignisse und meldet jeden Overflow im Exportkopf und mindestens einmal als Invalidation-Ereignis.
6. Während des zeitkritischen Fensters findet keine JSON-Serialisierung statt.
7. Ein verstecktes Dokument, Fokusverlust oder eine schwere Clock-Anomalie invalidiert den Lauf unwiderruflich. Die Rohdaten bleiben erhalten.
8. Der gewöhnliche Production-Build kompiliert BR-02 auf `telemetry-disabled`; Full-Collector und Export-UI werden entfernt. Der interne Benchmark-Build enthält die drei A/B-Modi.

`READY_FOR_LATER_IMPLEMENTATION` bedeutet nicht, dass jetzt implementiert werden darf. Der spätere Write-Agent darf erst nach akzeptierter und integrierter WP04 sowie nach akzeptiertem und integriertem BR-01 auf dessen exaktem Integrations-SHA starten.

## 2. Scope und Aussageklassen

### 2.1 Enthalten

- TypeScript-Verträge für Rohereignisse, Spans, Browserentries, Capabilities, Invalidierungen, Puffer und Export
- Clock- und Realm-Normalisierung
- Operation-, Revision-, Request-, Chunk-, Mesher- und Adoptionskorrelation
- Instrumentierungsplan für den heutigen Lab-Pfad und den späteren WP05-Pfad
- bounded Buffer, Backpressure, Exportgrenze und Datenschutz
- A/B-Vertrag für späteres Overhead-Messen
- konkrete Unit-, Browser- und Build-Vertragsfälle
- Implementierungs-Handoff auf Basis des später akzeptierten BR-01-Integrations-SHA

### 2.2 Nicht enthalten

- kein Code- oder Repository-Edit
- kein Playwright-Process-Runner und keine CDP-Hardwareerfassung
- kein Worker oder Scheduler
- keine Perzentile, Konfidenzintervalle oder Performance-Gates
- keine GPU-Timestamps, Pixelbestätigung, Memory- oder Leakmessung
- keine Cold-/Warm-Prozesssteuerung
- keine Tests, Builds, Browserläufe oder Benchmarks in diesem Auftrag

### 2.3 Kennzeichnung

- **Projektfakt:** durch die gelesenen Projektartefakte oder den exakten Repository-Snapshot belegt.
- **Plattformfakt:** durch eine aktuelle offizielle Primärspezifikation belegt.
- **Vertragsentscheidung:** normative Festlegung dieses Berichts für BR-02.
- **Technische Inferenz:** aus belegtem Ist-Stand abgeleitete, noch nicht implementierte Folgerung.
- **Offen:** außerhalb des BR-02-Vertrags oder erst durch spätere Messung entscheidbar.

## 3. Evidenzbasis und Audit des Ist-Stands

### 3.1 Vollständig gelesene Projektquellen

- `07_benchmark_test_methodology_audit_report.md`
- `wp05_worker_scheduler_abschlussbericht.md`
- `WELTRAUM_RESEARCH_SYNTHESIS_2026-08-12.md`
- `WELTRAUM_PROJECT_MEMORY.md`
- `WELTRAUM_RESEARCH_DECISION_LOG_2026-08-12.md`
- `WELTRAUM_PROJECT_INSTRUCTIONS_ADDENDUM.md`
- `WELTRAUM_RESEARCH_REGISTER.md`
- der BR-02-Auftrag

### 3.2 Read-only geprüfter Repository-Stand

Der Snapshot [`d95992d`](https://github.com/BenjaminHornung/hestia-voxel-kernel-lab/tree/d95992df05952ac4be6221ca1809c1c9e3c0ac9d) wurde ausschließlich read-only geprüft. Relevante Fakten:

- [`src/diagnostics/telemetry.ts`](https://github.com/BenjaminHornung/hestia-voxel-kernel-lab/blob/d95992df05952ac4be6221ca1809c1c9e3c0ac9d/src/diagnostics/telemetry.ts) bildet aktuell Total, p50 und p95 und hält ein begrenztes Fenster von rAF-Intervallen. Das ist Diagnostik, kein Rohtelemetrievertrag.
- [`src/main.ts`](https://github.com/BenjaminHornung/hestia-voxel-kernel-lab/blob/d95992df05952ac4be6221ca1809c1c9e3c0ac9d/src/main.ts) misst Fixture-, Halo- und Mesherabschnitte mit `performance.now()`, verliert danach aber Einzelmarker, Realm- und Korrelationskontext.
- [`src/render-three/threeVoxelRenderer.ts`](https://github.com/BenjaminHornung/hestia-voxel-kernel-lab/blob/d95992df05952ac4be6221ca1809c1c9e3c0ac9d/src/render-three/threeVoxelRenderer.ts) berechnet im rAF-Loop Callbackabstände, aktualisiert Controls, ruft `renderer.render` auf und schreibt gerundete Werte ins HUD. Ein rAF-Abstand ist weder App-Dauer noch GPU-Dauer.
- [`src/voxel/chunkHalo.ts`](https://github.com/BenjaminHornung/hestia-voxel-kernel-lab/blob/d95992df05952ac4be6221ca1809c1c9e3c0ac9d/src/voxel/chunkHalo.ts) erstellt 34³-Halos synchron im aufrufenden Realm.
- Die Visible- und Greedy-Mesher sind reine, synchrone CPU-Funktionen. Am Audit-SHA existiert kein Worker oder Scheduler.
- [`AGENTS.md`](https://github.com/BenjaminHornung/hestia-voxel-kernel-lab/blob/d95992df05952ac4be6221ca1809c1c9e3c0ac9d/AGENTS.md) verlangt serielle Work-Packages, einen Write-Agenten, keine ungeplanten Abhängigkeiten und keine Übernahme aus Weltraum-Spiel.
- [`package.json`](https://github.com/BenjaminHornung/hestia-voxel-kernel-lab/blob/d95992df05952ac4be6221ca1809c1c9e3c0ac9d/package.json) enthält Three.js, Vite, TypeScript, Vitest und Playwright. Für BR-02 ist keine neue Abhängigkeit erforderlich.
- Im geprüften Baum ist keine `LICENSE`-Datei vorhanden. Dieser Bericht kopiert keinen Fremdcode und leitet daraus keine Lizenzfreigabe für eine spätere Distribution ab.

### 3.3 Projektvorgaben, die BR-02 übernimmt

- Benchmark Protocol v1 bewahrt Rohsamples und trennt Cold, Warm-up, Measurement, Stress und Trace. BR-02 speichert die von BR-01 gelieferte Phase nur als Metadatum und steuert sie nicht.
- BR-01 bis BR-04 liegen seriell zwischen integrierter WP04 und WP05.
- WP05 plant einen dedizierten Meshing-Worker, eine Queue-Obergrenze von 128, genau einen In-flight-Request, Transferables und strikte stale-result rejection. BR-02 antizipiert nur die Telemetriegrenze und implementiert nichts davon.
- `operationId`, `worldRevision`, `requestId`, `authorityEpoch`, Chunk und Meshermodus müssen bis zur Adoption und ersten Draw-Submission nachvollziehbar bleiben.

## 4. Aktuelle Plattformfakten

Stand der Prüfung ist 2026-08-12. Verfügbarkeiten werden trotzdem zur Laufzeit pro Realm geprüft, da Zielbrowser und Versionen variieren können.

| API | Belegter Kern | BR-02-Folge |
| --- | --- | --- |
| [High Resolution Time Level 3](https://www.w3.org/TR/hr-time-3/) | `performance.now()` ist monoton innerhalb eines Time Origins; `performance.timeOrigin` erlaubt die im Standard gezeigte Cross-Realm-Normalisierung. User Agents dürfen Werte aus Sicherheitsgründen vergröbern oder jittern. | Rohdoubles unverändert speichern, Realm angeben, keine Wandzeitdifferenzen, keine Sub-Millisekundenpräzision versprechen. |
| [Performance Timeline](https://www.w3.org/TR/performance-timeline/) | `PerformanceObserver` ist auf Window und Worker exponiert. `supportedEntryTypes` ist pro Global zu prüfen. `buffered: true` kann vorhandene Entries liefern; Observer können verworfene Entries über `droppedEntriesCount` melden. | Support pro Realm erfassen, `takeRecords()` vor Seal, Observer-Drops als Counter und Invalidation melden. |
| [Long Tasks](https://www.w3.org/TR/longtasks-1/) | Window-only, Schwelle 50 ms, Dauer mit grober Auflösung, eingeschränkte Attribution. | Kein Worker-Long-Task-Wert, keine Funktionsattribution erfinden, fehlender Entry-Type ist `unsupported`. |
| [Event Timing](https://www.w3.org/TR/event-timing/) | Window-only, nur bestimmte vertrauenswürdige diskrete Events, Dauer als grobe Näherung bis zum Rendering-Update; kontinuierliche Events wie `pointermove` und `wheel` fehlen. | Input Delay und Processing getrennt speichern; Dauer als Browsernäherung; Target, Selector, Text, Key und Koordinaten nicht exportieren. |
| [User Timing](https://www.w3.org/TR/user-timing/) | Marks und Measures sind auf Window und Worker verfügbar und für Seitenskripte lesbar. Details werden strukturiert geklont. | Nicht als primärer Sink. Optionaler Debug-Mirror nur mit festen, datenschutzsicheren Namen; anschließend löschen. Standardmäßig aus. |
| [HTML Animation Frames](https://html.spec.whatwg.org/multipage/imagebitmap-and-animations.html#animation-frames) | rAF liefert einen High-Resolution-Timestamp für eine Rendering-Gelegenheit. Versteckte Dokumente können vom Rendering-Update ausgenommen werden. Der aktuelle Living Standard kennt rAF auch für geeignete Dedicated Worker. | Window-rAF-Abstände sind Scheduling-/Präsentationsnähe. WP05 braucht kein Worker-rAF; eine vorhandene, ungenutzte Oberfläche ist `not-active`, eine fehlende `unsupported`, nie 0. |
| [HTML Page Visibility](https://html.spec.whatwg.org/multipage/interaction.html#page-visibility) | `visibilityState` ist `visible` oder `hidden`; `visibilitychange` meldet Wechsel. Die ältere Page-Visibility-Level-2-TR ist eingestellt und verweist auf HTML. | Initialzustand und jeden Wechsel erfassen; `hidden` invalidiert einen aktiven Messlauf. |
| [HTML Focus](https://html.spec.whatwg.org/multipage/interaction.html#dom-document-hasfocus) | `document.hasFocus()` sagt, ob Keyevents durch oder an das Dokument geroutet werden. Focus und Visibility sind nicht dasselbe. | Initialzustand plus Window-`focus`/`blur` erfassen und im Handler erneut lesen; Fokusverlust invalidiert einen aktiven Messlauf. |

Normative Capability-Regel: Eine API ist nur `supported`, wenn die benötigte Oberfläche im betreffenden Realm vorhanden ist und ihre Initialisierung erfolgreich war. Bei `PerformanceObserver` muss zusätzlich der konkrete Entry-Type in `supportedEntryTypes` enthalten sein. Abwesenheit ist `unsupported`; `NotAllowedError` ist `permission-denied`; `SecurityError` ist `blocked`; sonstige Initialisierungsfehler sind `error`. Keine dieser Situationen erzeugt einen Dauer-, Counter- oder Gauge-Wert 0 als Ersatz.

## 5. Normative Begriffe und feste Konstanten

`MUSS`, `DARF NICHT`, `SOLL` und `KANN` sind in diesem Bericht normativ.

```ts
export const TELEMETRY_SCHEMA_VERSION = 1 as const;
export const TELEMETRY_CONTRACT_ID = 'br-02-in-browser-telemetry-v1' as const;

export const TELEMETRY_LIMITS_V1 = {
  segmentCapacityRecords: 256,
  maxDataRecords: 65_536,
  maxDataChargeBytes: 16 * 1024 * 1024,
  maxCanonicalExportBytes: 17 * 1024 * 1024,
  controlReserveRecords: 16,
  controlReserveChargeBytes: 16 * 1024,
  maxOpenSpans: 4_096,
  maxTagsPerRecord: 12,
  maxSafeStringCodeUnits: 80,
  maxExportAttempts: 4,
  clockAnomalyToleranceMs: 4,
} as const;

export type TelemetryMode =
  | 'telemetry-disabled'
  | 'telemetry-enabled-minimal'
  | 'telemetry-enabled-full';

export type TelemetryMeasurementBasis =
  | 'direct-same-realm'
  | 'normalized-cross-realm'
  | 'browser-approximation';
```

Die Werte sind Contract-v1-Defaults und Teil jedes Exports. Eine spätere Änderung benötigt eine neue Contract-Version oder einen von BR-01 explizit versionierten Planwert. Sie darf nicht still per Browser oder Route variieren.

## 6. Vollständiger TypeScript-Vertrag

Der folgende Vertrag beschreibt die exportierte Form. Implementierungsinterne Draft-Typen dürfen enger sein, dürfen aber keine exportierte Semantik verändern.

```ts
export type TelemetryRunId = string;
export type TelemetryRecordId = string;
export type TelemetrySpanId = string;
export type TelemetryOperationId = string;
export type TelemetryRequestId = string;

/** Run-lokal. Die aktuelle WP05-Planung verwendet genau worker:mesh:<generation>:0. */
export type TelemetryRealmId =
  | 'main:window:0'
  | `worker:mesh:${number}:${number}`;

export type TelemetrySource = 'application' | 'browser';
export type TelemetryScope = 'window' | 'dedicated-worker';

export interface NormalizedTimestamp {
  readonly realmId: TelemetryRealmId;
  readonly timeOriginMs: number;
  readonly nowMs: number;
  /** Wird exakt einmal als timeOriginMs + nowMs berechnet. */
  readonly absoluteMonotonicMs: number;
  readonly precision: 'user-agent-coarsened';
}

export interface TelemetryRealmDescriptor {
  readonly realmId: TelemetryRealmId;
  readonly scope: TelemetryScope;
  readonly workerGeneration: number | null;
  readonly workerOrdinal: number | null;
  readonly timeOriginMs: number;
  readonly registeredAt: NormalizedTimestamp;
  readonly crossOriginIsolated: boolean;
}

export interface TelemetryOperationContext {
  readonly operationId: TelemetryOperationId | null;
  readonly parentOperationId: TelemetryOperationId | null;
  readonly authorityEpoch: string | null;
  readonly worldRevision: number | null;
  readonly requestId: TelemetryRequestId | null;
  readonly chunkKey: string | null;
  readonly chunkCoord: readonly [number, number, number] | null;
  readonly mesherMode: 'visible' | 'greedy' | 'greedy-ao' | null;
  readonly workerGeneration: number | null;
  readonly attempt: number | null;
}

export type TelemetryTagKey =
  | 'scenarioId'
  | 'phase'
  | 'backend'
  | 'route'
  | 'fixture'
  | 'outcome'
  | 'errorCode'
  | 'inputKind'
  | 'priorityClass'
  | 'distanceBucket'
  | 'transferable'
  | 'correlation';

export type TelemetryTagValue = string | number | boolean | null;
export type TelemetryTags = Readonly<Partial<Record<TelemetryTagKey, TelemetryTagValue>>>;

export interface TelemetryRecordBase {
  readonly schemaVersion: typeof TELEMETRY_SCHEMA_VERSION;
  readonly runId: TelemetryRunId;
  readonly recordId: TelemetryRecordId;
  /** Monoton innerhalb des erzeugenden Realms, beginnend bei 0. */
  readonly realmSequence: number;
  /** Reihenfolge der Aufnahme in den Main-Puffer, beginnend bei 0. */
  readonly ingestSequence: number;
  readonly source: TelemetrySource;
  readonly timestamp: NormalizedTimestamp;
  readonly context: TelemetryOperationContext;
  readonly tags: TelemetryTags;
}

export type TelemetrySpanName =
  | 'run.total'
  | 'fixture.build'
  | 'halo.build'
  | 'mesh.cpu'
  | 'edge-products.build'
  | 'renderer.adoption'
  | 'main.frame-work'
  | 'draw-submit.cpu'
  | 'input-to-revision-submit'
  | 'scheduler.queue-wait'
  | 'snapshot.build'
  | 'main-to-worker.transit-wait'
  | 'worker.validation'
  | 'worker.mesh-cpu'
  | 'worker.transfer-products-build'
  | 'worker-to-main.transit-wait'
  | 'result.validation'
  | 'result.adoption';

export interface TelemetrySpanStart extends TelemetryRecordBase {
  readonly kind: 'span-start';
  readonly spanId: TelemetrySpanId;
  readonly parentSpanId: TelemetrySpanId | null;
  readonly name: TelemetrySpanName;
}

export interface TelemetrySpanEnd extends TelemetryRecordBase {
  readonly kind: 'span-end';
  readonly spanId: TelemetrySpanId;
  readonly name: TelemetrySpanName;
  readonly outcome: 'ok' | 'error' | 'cancelled' | 'stale' | 'rejected';
  readonly sanitizedErrorCode: string | null;
}

export interface TelemetryDurationSample extends TelemetryRecordBase {
  readonly kind: 'duration';
  readonly name: TelemetrySpanName;
  readonly spanId: TelemetrySpanId | null;
  readonly start: NormalizedTimestamp;
  readonly end: NormalizedTimestamp;
  readonly durationMs: number;
  readonly basis: TelemetryMeasurementBasis;
}

export type TelemetryCounterName =
  | 'telemetry.records-written'
  | 'telemetry.records-dropped'
  | 'telemetry.observer-callbacks'
  | 'telemetry.observer-entries-dropped'
  | 'mesh.input-bytes'
  | 'mesh.output-bytes'
  | 'mesh.quads'
  | 'scheduler.admitted'
  | 'scheduler.evicted'
  | 'scheduler.coalesced'
  | 'result.stale-dropped';

export interface TelemetryCounterSample extends TelemetryRecordBase {
  readonly kind: 'counter';
  readonly name: TelemetryCounterName;
  /** Append-only Delta, kein bereits aggregierter Stand. */
  readonly delta: number;
  readonly unit: 'count' | 'byte';
}

export type TelemetryGaugeName =
  | 'document.visibility'
  | 'document.focus'
  | 'scheduler.queue-depth'
  | 'scheduler.in-flight'
  | 'telemetry.open-spans'
  | 'telemetry.charged-bytes';

export type TelemetryGaugeValue = number | boolean | 'visible' | 'hidden' | 'focused' | 'not-focused';

export interface TelemetryGaugeSample extends TelemetryRecordBase {
  readonly kind: 'gauge';
  readonly name: TelemetryGaugeName;
  /** Zustands-Snapshot zu timestamp, kein Delta und keine Mutation älterer Samples. */
  readonly value: TelemetryGaugeValue;
  readonly unit: 'count' | 'byte' | 'state';
}

export interface TelemetryLongTaskSample extends TelemetryRecordBase {
  readonly kind: 'long-task';
  readonly name: 'browser.long-task';
  readonly start: NormalizedTimestamp;
  readonly durationMs: number;
  readonly basis: 'browser-approximation';
  readonly attributionClass:
    | 'self'
    | 'same-origin'
    | 'same-origin-ancestor'
    | 'same-origin-descendant'
    | 'cross-origin-ancestor'
    | 'cross-origin-descendant'
    | 'cross-origin-unreachable'
    | 'multiple-contexts'
    | 'unknown';
  /** Keine Container-URL, keine Container-ID und kein DOM-Name. */
  readonly attributionCount: number;
}

export interface TelemetryEventTimingSample extends TelemetryRecordBase {
  readonly kind: 'event-timing';
  readonly name: 'browser.event-timing';
  /** Ausschließlich der vom Browser gelieferte, validierte Eventtyp. */
  readonly eventName: string;
  readonly start: NormalizedTimestamp;
  readonly processingStart: NormalizedTimestamp;
  readonly processingEnd: NormalizedTimestamp;
  readonly durationMs: number;
  readonly inputDelayMs: number;
  readonly eventProcessingMs: number;
  readonly presentationDelayApproxMs: number | null;
  readonly interactionId: number;
  readonly cancelable: boolean;
  readonly correlation: 'matched' | 'unmatched' | 'ambiguous';
  readonly basis: 'browser-approximation';
}

export interface TelemetryFrameSample extends TelemetryRecordBase {
  readonly kind: 'frame';
  readonly name: 'browser.raf-interval';
  readonly previousCallback: NormalizedTimestamp | null;
  readonly callback: NormalizedTimestamp;
  /** Beim ersten Callback null, niemals ersatzweise 0. */
  readonly rafIntervalMs: number | null;
  readonly submittedWorldRevision: number | null;
  readonly basis: 'browser-approximation';
}

export type TelemetryCapabilityName =
  | 'high-resolution-time'
  | 'performance-observer'
  | 'long-task'
  | 'event-timing'
  | 'user-timing'
  | 'request-animation-frame'
  | 'page-visibility'
  | 'document-focus'
  | 'dedicated-worker'
  | 'benchmark-download';

export type TelemetryCapabilityStatus =
  | 'supported'
  | 'unsupported'
  | 'not-active'
  | 'permission-denied'
  | 'blocked'
  | 'error';

export interface TelemetryCapabilitySample extends TelemetryRecordBase {
  readonly kind: 'capability';
  readonly name: TelemetryCapabilityName;
  readonly scope: TelemetryScope;
  readonly status: TelemetryCapabilityStatus;
  readonly requiredByPlan: boolean;
  readonly sanitizedReasonCode: string | null;
}

export type TelemetryInvalidationReason =
  | 'initially-hidden'
  | 'visibility-lost'
  | 'initially-unfocused'
  | 'focus-lost'
  | 'clock-anomaly'
  | 'clock-order-indeterminate'
  | 'duplicate-record-id'
  | 'duplicate-span-start'
  | 'duplicate-span-end'
  | 'unmatched-span-start'
  | 'unmatched-span-end'
  | 'operation-context-conflict'
  | 'request-id-conflict'
  | 'observer-dropped-entries'
  | 'buffer-overflow'
  | 'record-too-large'
  | 'invalid-record'
  | 'required-capability-unavailable'
  | 'pagehide-before-seal'
  | 'unexpected-error';

export interface TelemetryInvalidationSample extends TelemetryRecordBase {
  readonly kind: 'invalidation';
  readonly name: 'telemetry.invalidation';
  readonly reason: TelemetryInvalidationReason;
  readonly effect: 'invalidate-run' | 'invalidate-span' | 'diagnostic-only';
  readonly relatedRecordId: TelemetryRecordId | null;
  readonly sanitizedDetailCode: string | null;
}

export type TelemetryRecord =
  | TelemetrySpanStart
  | TelemetrySpanEnd
  | TelemetryDurationSample
  | TelemetryCounterSample
  | TelemetryGaugeSample
  | TelemetryLongTaskSample
  | TelemetryEventTimingSample
  | TelemetryFrameSample
  | TelemetryCapabilitySample
  | TelemetryInvalidationSample;

/** Der Buffer, nicht der Call-Site-Aufrufer, vergibt ingestSequence. */
export type TelemetryRecordDraft = TelemetryRecord extends infer T
  ? T extends TelemetryRecord
    ? Omit<T, 'ingestSequence'>
    : never
  : never;

export interface TelemetryBufferLimits {
  readonly segmentCapacityRecords: number;
  readonly maxDataRecords: number;
  readonly maxDataChargeBytes: number;
  readonly maxCanonicalExportBytes: number;
  readonly controlReserveRecords: number;
  readonly controlReserveChargeBytes: number;
  readonly maxOpenSpans: number;
}

export interface TelemetryOverflowSummary {
  readonly overflowed: boolean;
  readonly firstDroppedAt: NormalizedTimestamp | null;
  readonly droppedRecords: number;
  readonly droppedChargeBytes: number;
  readonly rejectedOversizeRecords: number;
  readonly controlReserveExhausted: boolean;
}

export interface TelemetryAppendAccepted {
  readonly status: 'accepted';
  readonly ingestSequence: number;
  readonly chargedBytes: number;
}

export interface TelemetryAppendRejected {
  readonly status: 'rejected';
  readonly reason: 'sealed' | 'duplicate' | 'overflow' | 'record-too-large' | 'invalid-record';
}

export type TelemetryAppendResult = TelemetryAppendAccepted | TelemetryAppendRejected;

export interface TelemetryRunBuffer {
  readonly runId: TelemetryRunId;
  readonly mode: TelemetryMode;
  readonly limits: TelemetryBufferLimits;
  readonly state: 'open' | 'sealed';
  readonly dataRecordCount: number;
  readonly controlRecordCount: number;
  readonly chargedDataBytes: number;
  readonly overflow: TelemetryOverflowSummary;

  append(record: TelemetryRecordDraft): TelemetryAppendResult;
  seal(reason: 'completed' | 'invalidated' | 'pagehide' | 'error'): TelemetrySealedRun;
}

export interface TelemetrySealedRun {
  readonly runId: TelemetryRunId;
  readonly sealReason: 'completed' | 'invalidated' | 'pagehide' | 'error';
  readonly records: readonly TelemetryRecord[];
  readonly finalGauges: Readonly<Partial<Record<TelemetryGaugeName, TelemetryGaugeValue>>>;
  readonly invalidationReasons: readonly TelemetryInvalidationReason[];
  readonly overflow: TelemetryOverflowSummary;
}

export interface TelemetryExportAttempt {
  readonly attempt: number;
  /** initiated bedeutet Downloadstart ohne synchronen Fehler, nicht gespeicherte Datei. */
  readonly status: 'initiated' | 'unsupported' | 'permission-denied' | 'blocked' | 'error';
  readonly sanitizedReasonCode: string | null;
}

export interface TelemetryExportV1 {
  readonly schemaVersion: typeof TELEMETRY_SCHEMA_VERSION;
  readonly contractId: typeof TELEMETRY_CONTRACT_ID;
  readonly runId: TelemetryRunId;
  readonly br01PlanId: string;
  readonly sourceRevision: string;
  readonly telemetryMode: TelemetryMode;
  readonly phase: string;
  readonly scenarioId: string;
  /** Metadatum aus BR-01. Nie zur Dauerbildung verwenden. */
  readonly createdUtc: string;
  readonly limits: TelemetryBufferLimits;
  readonly clockContract: {
    readonly formula: 'absoluteMonotonicMs = timeOriginMs + nowMs';
    readonly rawValuesRounded: false;
    readonly clockAnomalyToleranceMs: number;
  };
  readonly realms: readonly TelemetryRealmDescriptor[];
  readonly records: readonly TelemetryRecord[];
  readonly finalGauges: Readonly<Partial<Record<TelemetryGaugeName, TelemetryGaugeValue>>>;
  readonly validity: {
    readonly invalidated: boolean;
    readonly reasons: readonly TelemetryInvalidationReason[];
  };
  readonly overflow: TelemetryOverflowSummary;
  readonly exportAttempts: readonly TelemetryExportAttempt[];
}
```

### 6.1 Laufzeitinvarianten, die TypeScript allein nicht ausdrückt

- IDs und alle exportierten Strings sind 1 bis 80 Code Units lang und entsprechen einer pro Feld definierten ASCII-Allowlist. Freitext wird nicht exportiert.
- `recordId` ist runweit eindeutig. Empfohlenes Format ist `<realmId>#<realmSequence>`.
- `realmSequence`, `ingestSequence`, Revisionen, Generationsnummern, Attempts, Interaktions-IDs und Zähler sind nichtnegative Safe Integers.
- Alle Zahlen sind endlich. Dauern, Deltas, Bytezahlen und Queue-Tiefen sind nichtnegativ. Ein Counter-Delta 0 wird nicht geschrieben.
- Tags enthalten höchstens 12 bekannte Keys. Unbekannte Keys oder nicht erlaubte Werte verwerfen den Record als `invalid-record` und erzeugen eine Invalidation über die Control Reserve.
- `NormalizedTimestamp.absoluteMonotonicMs` wird vom Clock-Adapter erzeugt, nie von einem Call-Site-Aufrufer geliefert.
- Das gemeinsame `timestamp` bezeichnet bei Punktrecords deren Marker und bei Intervalrecords deren logisches Ende. Span-Start nutzt den Start, Span-End das Ende, Duration das Ende, Long Task `start + duration`, Event Timing `start + duration` und Frame den rAF-Callback.
- Ein `TelemetryDurationSample` wird nur aus einem validierten atomaren Start-/Endpaar oder nach erfolgreichem Match zweier Spanrecords geschrieben. Bei langlebigen Spans bleiben Start- und End-Records die Rohwahrheit.
- Browserentries erhalten `source: 'browser'`; ihre Timestamp-Clock ist trotzdem `main:window:0`, weil sie in der Window-Performance-Timeline beobachtet werden. Es gibt kein erfundenes Browser-Clock-Realm.
- Capability-Samples stehen genau einmal in `records`. Der Export dupliziert sie nicht in einem zweiten Payload-Array; der Consumer filtert über `kind: 'capability'`.
- Browser-Target, DOM-Selector, Texteingabe, Keywert, Pointerkoordinate, URL, Container-ID, Dateipfad und Stacktrace sind verboten.

## 7. Clock-Vertrag

### 7.1 Exakte Normalisierung

Für jeden Marker gilt:

```text
absoluteMonotonicMs = timeOriginMs + nowMs
```

Der Clock-Adapter liest `performance.timeOrigin` beim Registrieren eines Realms genau einmal. Für einen normalen Marker liest er `performance.now()` genau einmal, validiert beide Operanden und berechnet die Summe einmal als JavaScript-Double. Call-Sites dürfen weder `Date.now()` noch einen selbst angelieferten absoluten Wert verwenden.

`absoluteMonotonicMs` sieht wie Epoch-Millisekunden aus, ist aber im Vertrag ausschließlich eine normalisierte Position auf der monotonen High-Resolution-Time-Achse derselben User-Agent-Ausführung. Eine Dauer entsteht nur aus zwei validierten normalisierten Markern. `createdUtc` ist Provenienzmetadatum und nimmt an keiner Subtraktion teil.

### 7.2 Präzision und Rohwerte

- BR-02 bewahrt die vom User Agent gelieferte Double-Präzision. Es gibt kein `Math.round`, `toFixed`, Integer-Cast oder HUD-Roundtrip.
- High Resolution Time nennt für die Clock-Vergröberung 100 Mikrosekunden als normale und 5 Mikrosekunden als cross-origin-isolated Basisauflösung, erlaubt dem User Agent aber ausdrücklich eine gröbere oder gejitterte Auflösung. Deshalb trägt jeder Timestamp `precision: 'user-agent-coarsened'`; BR-02 akzeptiert endliche Rohdoubles, verspricht aber keine bestimmte effektive Auflösung.
- Long-Task-Duration besitzt spezifikationsseitig Millisekundengranularität. Event-Timing-Duration wird auf 8-ms-Grenzen vergröbert. Diese Quellauflösungen werden nicht mit den feiner wirkenden Dezimalstellen eines JSON-Numbers verwechselt.
- Die 4-ms-Toleranz ist ausschließlich ein Anomalieklassifikator. Sie ist keine Rundungsstufe und wird nie auf gespeicherte Rohwerte angewendet.
- Gleiche aufeinanderfolgende `nowMs`-Werte sind bei vergröberten Clocks zulässig. Ein kleiner positiver oder ein Wert 0 ist kein Fehler.
- Event-Timing-Dauern behalten ihre browserseitige Granularität. BR-02 versucht nicht, sie aus anderen Markern künstlich zu verfeinern.

### 7.3 Validierungsalgorithmus

1. `timeOriginMs`, `nowMs` und ihre Summe MÜSSEN `Number.isFinite(...)` erfüllen.
2. `timeOriginMs` und `nowMs` MÜSSEN größer oder gleich 0 sein.
3. Die Summe MUSS bei erneuter Berechnung `Object.is(timeOriginMs + nowMs, absoluteMonotonicMs)` erfüllen. JSON-Roundtrip-Doubles bleiben dadurch prüfbar.
4. `timeOriginMs` MUSS im Realm konstant bleiben. Eine Änderung invalidiert den Lauf mit `clock-anomaly`.
5. Innerhalb eines Realms darf `absoluteMonotonicMs` nicht kleiner als der zuletzt akzeptierte Marker sein. Gleichheit ist zulässig; Regression invalidiert den Lauf.
6. Negative, `NaN`- oder unendliche Quelldaten werden nicht als Originalrecord aufgenommen. Falls eine sichere Clock noch lesbar ist, schreibt die Control Reserve eine `clock-anomaly`-Invalidation. Andernfalls bleibt der Fehler mindestens im nicht zeitgebundenen Exportkopf als Invalidation-Grund erhalten.

### 7.4 Realm-Registrierung und Worker-Handshake

Das Window-Realm ist run-lokal immer `main:window:0`. Ein späterer Meshing-Worker erhält `worker:mesh:<workerGeneration>:0`. Bei einem Worker-Restart steigt `workerGeneration`; Timestamps unterschiedlicher Generationen werden niemals demselben Realm zugeordnet.

Der spätere WP05-kompatible Handshake lautet:

1. Main erfasst `mainSend` und sendet Init-Daten einschließlich Run-ID, Worker-Generation und Telemetrievertragsversion.
2. Der Worker validiert Init, registriert sein eigenes `performance.timeOrigin`, erfasst `workerReceive` und sendet den vollständigen `TelemetryRealmDescriptor` sowie `workerReceive` zurück.
3. Main erfasst `mainReceive`.
4. `workerReceive.absoluteMonotonicMs` SOLL im Intervall `mainSend - 4 ms` bis `mainReceive + 4 ms` liegen.
5. Eine Abweichung bis einschließlich 4 ms außerhalb der kausalen Reihenfolge macht den betreffenden Cross-Realm-Span mit `clock-order-indeterminate` unbrauchbar, invalidiert aber nicht automatisch alle Same-Realm-Daten. Eine Abweichung von mehr als 4 ms oder eine Realm-Regression erzeugt `clock-anomaly` mit `invalidate-run`.

Der Handshake kalibriert keine Wandzeit und verschiebt keine Clock. Er prüft nur, ob die standardisierte Time-Origin-Normalisierung in der konkreten Ausführung kausal plausibel ist.

### 7.5 Cross-Realm-Spans und out-of-order Events

- Same-Realm-Dauer: `end.nowMs - start.nowMs`. Das bewahrt mehr Präzision als die Subtraktion zweier epochgroßer Summen. Die absoluten Marker bleiben zur Korrelation erhalten, ihre Differenz muss wegen IEEE-754-Rundung aber nicht bitgleich sein.
- Cross-Realm-Dauer: ausschließlich `end.absoluteMonotonicMs - start.absoluteMonotonicMs`; Basis `normalized-cross-realm`.
- Ist eine Cross-Realm-Differenz negativ, wird sie nie auf 0 geklemmt. Bei Betrag bis 4 ms entsteht `clock-order-indeterminate` für den Span und kein Duration-Sample. Bei größerem Betrag entsteht `clock-anomaly` für den Lauf.
- Ein Span-End darf wegen Message-Reihenfolge vor dem Start im Main-Puffer eintreffen. Er wird append-only gespeichert und in `pendingEnds` gehalten. Sobald der Start eintrifft, wird genau ein Duration-Sample erzeugt.
- Bei Seal erzeugt jeder ungepaarte Start oder jedes ungepaarte Ende eine Invalidation. Raw Start oder End bleibt erhalten.
- Ein zweiter Start oder ein zweites Ende für dieselbe `spanId` wird nicht als zweiter gültiger Marker akzeptiert. Die Control Reserve dokumentiert `duplicate-span-start` oder `duplicate-span-end`.

## 8. ID-, Operations- und Revisionsvertrag

### 8.1 ID-Erzeugung

IDs sind run-lokal, opak und enthalten keine Nutzerdaten. Main ist ID-Authority.

- `runId` kommt aus dem akzeptierten BR-01-Plan.
- `operationId`: `op-000001`, monoton pro Run.
- `spanId`: `<realmId>/sp-000001`, monoton pro Realm.
- `requestId`: wird später durch WP05 erzeugt und unverändert übernommen. Ist das dortige Format noch nicht fest integriert, verwendet der Scheduler eine run-lokal monotone, opaque ID.
- `recordId`: `<realmId>#<realmSequence>`.

Zufall, Datum, Dateipfad, Nutzername oder Chunkinhalt sind nicht Bestandteil einer ID. IDs sind keine kryptografischen Zugriffstoken.

### 8.2 Operationsebenen

Eine `operationId` bezeichnet genau einen unveränderlichen Kontext. Breite Abläufe verwenden Parent-Child-Operationen, statt dieselbe ID mit wechselndem Chunk oder Request wiederzuverwenden.

| Ebene | Beispiel | Kontext |
| --- | --- | --- |
| Root | Szenenaufbau oder vertrauenswürdige Eingabe | Operation, Phase, gewünschte Revision; Request und Chunk können null sein |
| Job | genau ein Chunk, Meshermodus und Revision | neue Operation mit Root als Parent |
| Dispatch-Versuch | genau eine `requestId`, Worker-Generation und Attempt | neue Operation mit Job als Parent |

Wiederholt auftauchende Events derselben Operation werden dedupliziert, indem ein Registry-Fingerprint aus allen nicht-null OperationContext-Feldern gebildet wird. Derselbe Fingerprint ist zulässig. Ein abweichender Wert für ein bereits festgelegtes Feld erzeugt `operation-context-conflict` und invalidiert den Lauf. Null darf nur beim Registrieren der Operation vorkommen; ein späteres stilles Auffüllen ist verboten. Benötigte Details werden durch eine Kindoperation repräsentiert.

### 8.3 Revision, Request und Adoption

- `worldRevision` ist eine nichtnegative Safe Integer und gehört zur Main-Authority. BR-02 erhöht oder interpretiert sie nicht.
- `requestId` bezeichnet genau einen Dispatch-Versuch in genau einer Worker-Generation. Wiederverwendung mit anderer Revision, anderem Chunk, anderer Generation oder anderem Meshermodus erzeugt `request-id-conflict`.
- `authorityEpoch`, `chunkKey`, `mesherMode`, `worldRevision`, `requestId`, `workerGeneration` und `attempt` werden durch Request, Resultvalidierung und Adoption unverändert weitergetragen.
- Ein Resultat darf nur als `result.adoption` enden, wenn die später von WP05 definierte Adoption-Bedingung erfüllt ist. Stale-, Duplicate-, Orphan- und alte Worker-Resultate erhalten einen terminalen Outcome, aber keinen angenommenen Adoptionsspan.
- Der erste `renderer.render`-Aufruf, dessen Renderzustand die angenommene `worldRevision` enthält, schreibt `submittedWorldRevision` und beendet `input-to-revision-submit`. Das ist eine Draw-Submission, keine Pixel- oder Photonbestätigung.
- Mehrere Chunks einer Revision haben eigene Job- und Dispatch-Operationen. Ein revisionsbezogener Root-Span endet erst an der ersten vertraglich definierten Draw-Submission der gewünschten Revision.

### 8.4 Event-Timing-Korrelation

Event Timing liefert keine App-`operationId`. Beim Eintritt in einen bereits vorhandenen App-Handler wird deshalb ein kleiner run-lokaler FIFO-Correlation-Record aus `(event.type, event.timeStamp, handlerSequence, operationId)` angelegt. Der spätere `PerformanceEventTiming`-Entry wird über Eventtyp und denselben Window-Time-Origin-Timestamp gematcht.

- genau ein Kandidat: `matched` und dessen OperationContext
- kein Kandidat: `unmatched`, OperationContext bleibt systemisch null
- mehrere gleichwertige Kandidaten durch Clock-Vergröberung: `ambiguous`, keine ID wird geraten

Der FIFO ist auf 256 Einträge begrenzt und läuft nach 10 Sekunden aus. Er speichert weder Target noch Key, Text, Pointerkoordinate oder Eventobjekt. Ein fehlendes Match ist kein Null-Latenzwert.

## 9. Messgrößen und semantische Trennung

| Name | Marker und Berechnung | Basis | Bedeutet ausdrücklich nicht | Fehlende Quelle |
| --- | --- | --- | --- | --- |
| `browser.raf-interval` | Differenz zweier rAF-Callback-Timestamps | `browser-approximation` | App-Dauer, Renderdauer, GPU-Zeit, Displaylatenz | erster Frame `null`; rAF-Capability sonst `unsupported` |
| `main.frame-work` | `performance.now()` vor und nach instrumentierter App-Arbeit im rAF, ohne `renderer.render` und ohne Telemetrieexport | `direct-same-realm` | gesamte Browserarbeit, Layout, Compositor oder GPU | kein Sample |
| `draw-submit.cpu` | unmittelbar vor und nach `renderer.render(...)` | `direct-same-realm` | GPU-Ausführung oder bestätigte Darstellung | kein Sample |
| `browser.long-task` | `PerformanceLongTaskTiming.startTime` und `.duration` | `browser-approximation` | exakte Funktions-, Worker- oder App-Attribution | Capability `unsupported`, kein 0-Record |
| `inputDelayMs` | `processingStart - startTime` aus Event Timing | `browser-approximation` | Handlerdauer | Event-Timing-Capability oder kein Entry |
| `eventProcessingMs` | `processingEnd - processingStart` | `browser-approximation` | asynchrone Folgearbeit | Event-Timing-Capability oder kein Entry |
| Event-Timing `durationMs` | browsergelieferte Dauer ab Eventzeit bis Rendering-Update | `browser-approximation` | Photon-on-screen-Latenz | kein Ersatzwert |
| `input-to-revision-submit` | App-Inputmarker bis erster Draw Submit der gewünschten Revision | Same Realm oder `normalized-cross-realm` über Kindspans | bestätigtes Pixel | kein Sample, falls Revision nie submitted |
| `scheduler.queue-wait` | Main-Enqueue bis Main-Dispatchentscheidung | `direct-same-realm` | Message-Transfer oder Workerwartezeit | WP05 `not-active` |
| `snapshot.build` | vor und nach `createChunkHaloSnapshot` oder äquivalenter Snapshotfunktion | `direct-same-realm` | Meshing oder Transfer | kein Sample |
| `main-to-worker.transit-wait` | unmittelbar vor `postMessage` auf Main bis Worker-Messagehandler beginnt | `normalized-cross-realm` | isolierte Structured-Clone- oder Transferzeit | Worker `not-active` oder Clock-Invalide |
| `worker.validation` | Worker vor und nach Requestvalidierung | `direct-same-realm` | Queuewait oder Meshing | Worker `not-active` |
| `worker.mesh-cpu` | direkt um die reine Mesherfunktion im Worker | `direct-same-realm` | Snapshotbau, Transfer oder Adoption | Worker `not-active` |
| `worker.transfer-products-build` | nach Meshing bis unmittelbar vor `postMessage`, nur Erzeugung der Transferprodukte | `direct-same-realm` | tatsächlicher Nachrichtentransport | Worker `not-active` |
| `worker-to-main.transit-wait` | Worker unmittelbar vor `postMessage` bis Main-Messagehandler beginnt | `normalized-cross-realm` | reine Transportzeit; enthält Main-Scheduling | Worker `not-active` oder Clock-Invalide |
| `result.validation` | Main vor und nach Struktur-, Revisions- und Stale-Validierung | `direct-same-realm` | Geometrieadoption | kein Sample |
| `result.adoption` | nach akzeptierter Validierung bis BufferGeometry, Bounds und Scene-State übernommen sind | `direct-same-realm` | Draw Submit oder GPU-Zeit | kein Sample bei stale/rejected |

Zwei zusätzliche Regeln verhindern Fehlinterpretationen:

1. Ein vorhandener Capability-Support und null beobachtete Entries sind verschiedene Tatsachen. BR-02 speichert die Capability und schlicht keine Sample-Reihe; es erzeugt keinen Counter 0 als Ersatz für unbekannte Ereignisse.
2. `main-to-worker.transit-wait` und `worker-to-main.transit-wait` sind absichtlich breit benannt. Browser-Thread-Scheduling, Messagezustellung und Main-Blockierung lassen sich damit nicht sauber isolieren.

## 10. Instrumentierungsstellen am heutigen Lab-Pfad

Alle Start- und Endmarker verwenden den Clock-Adapter. Fehlerpfade beenden offene Spans mit Outcome und schreiben nur einen sanitisierten Fehlercode.

| Ort | Startmarker | Endmarker | Realm | `operationId` | Tags | Fehlerfall | Mess-Overhead |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Bootstrap in `main.ts`, vor Szenenerzeugung | `run.total` start | nach erster vertraglicher Draw-Submission oder kontrolliertem Fehler | Main | Root-Run-Operation | Route, Phase, Szenario | Run-End `error`, sanitierter Code | 2 Clocks, 3 Records |
| `createVisibleFaceFixture()` | `fixture.build` start | direkt nach Rückgabe | Main | Kind des Run-Root | Fixture | `error` | 2 Clocks, 1 atomarer Duration-Record |
| `createLargeChunkFixture()` | `fixture.build` start | direkt nach Rückgabe | Main | Kind des Run-Root | Fixture | `error` | 2 Clocks, 1 atomarer Duration-Record |
| Schleife um `createChunkHaloSnapshot()` | `halo.build` start | Snapshot vollständig | Main | Kind pro Chunk und Mesherpfad | Chunk im Context | `error` | 2 Clocks, 1 Duration-Record pro Chunk |
| `meshVisibleFaces()` oder `meshGreedy()` | `mesh.cpu` start | reine Mesherfunktion zurück | Main | Kind pro Chunk und Mesher | Meshermodus im Context | `error` | 2 Clocks, 1 Duration-Record pro Mesh |
| WP03 Edge-Produktbau | `edge-products.build` start | alle Edge-Produkte erstellt | Main | Kind des Szenen-Root | Meshermodus | `error` | 2 Clocks, 1 atomarer Duration-Record |
| `ThreeVoxelRenderer`-Konstruktor, Geometrie-/Scene-Aufnahme | `renderer.adoption` start | alle produktiven und Debug-Geometrien übernommen, vor rAF-Start | Main | Kind pro Szenenaufbau | Backend | WebGL-/Geometriefehler | 2 Clocks, 1 atomarer Duration-Record |
| Eintritt jedes rAF-Callbacks | vorheriger rAF-Timestamp vorhanden | aktueller browsergelieferter Timestamp | Main/Browser | null oder aktive Renderoperation | Backend | erster Callback hat `null`-Intervall | 1 Clock für Record, kein Spanpaar |
| `controls.update()` und übrige App-Logik | `main.frame-work` start | unmittelbar vor `renderer.render` | Main | aktive Renderoperation oder null | Backend | `error` | 2 Clocks, 1 Duration-Record pro erfasstem Frame |
| `renderer.render(scene, camera)` | `draw-submit.cpu` start | direkt nach Rückkehr | Main | zuletzt adoptierte Operation oder null | Backend | `error` | 2 Clocks, 1 Duration-Record pro erfasstem Frame |
| erster Draw der gewünschten Revision | Input-Root bereits offen | nach Rückkehr aus `renderer.render` | Main | Input-Root | Correlation | nie erreicht: unmatched Start bei Seal | 1 Endclock plus Records |
| `PerformanceObserver` Long Task | Browser-Entry `startTime` | `startTime + duration` | Main/Browser | null | Attributionklasse | Observerfehler als Capability/Invalidation | kein zusätzlicher Clockread pro Entry |
| `PerformanceObserver` Event Timing | Entry `startTime` | Processingmarker und Dauer aus Entry | Main/Browser | korreliert oder null | Inputkind, Correlation | negative Ableitung wird verworfen | kein zusätzlicher Clockread pro Entry |
| Visibility- und Focus-Listener | Handler liest aktuellen Zustand | gleicher Punktrecord | Main/Browser | null | keine Nutzerdaten | `hidden`/Fokusverlust invalidiert | 1 Clock pro Wechsel |
| expliziter Download nach Seal | außerhalb des Messfensters | Download gestartet oder Fehler | Main | null | keine Messphase | separater ExportAttempt | Serialisierung zählt nicht zum Messfenster |

Die aktuellen HUD-Schreibvorgänge dürfen ihre gerundeten Werte weiter für Menschen anzeigen, sind aber keine Quelle für BR-02. Ein Implementierer darf die bestehende `FrameIntervalTelemetry` nicht still als Rohsink umetikettieren.

Am Audit-SHA existieren weder `worldRevision` noch `requestId` im Renderpfad. Ihre Contextfelder bleiben dort null; BR-02 erfindet dafür insbesondere nicht den Wert 0. Revision-Submit-Instrumentierung wird erst aktiv, wenn der akzeptierte Integrationsstand eine echte Revision führt.

## 11. Instrumentierungsstellen am späteren WP05-Pfad

Diese Tabelle definiert Kompatibilität, nicht die Implementierung von WP05.

| Ort | Startmarker | Endmarker | Realm | `operationId` | Tags | Fehlerfall | Mess-Overhead |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Vertrauenswürdiger Inputhandler | Event-`timeStamp` plus Handler-Eintritt | Root bleibt bis Revision-Submit offen | Main | neue Root-Operation | Inputkind ohne Key/Target | abgebrochen/rejected | 1 bis 2 Clocks, Registry-Eintrag |
| Scheduler Admission | vor Admission | accepted/coalesced/evicted/rejected | Main | Job-Kindoperation | Priorityklasse, DistanceBucket | terminaler Outcome | 2 Clocks, 1 Duration plus Counter |
| Schedulerqueue | Enqueue accepted | unmittelbar vor Dispatchentscheidung | Main | Job-Operation | Queue-Tiefe als Gauge | Eviction/Coalescing beendet ohne Dispatch | 2 Clocks, 3 Records |
| Halo-/Snapshotbau | vor Snapshotfunktion | vollständiger 34³-Puffer | Main | Dispatch-Kindoperation | Transferable | Snapshotfehler | 2 Clocks, 1 atomarer Duration-Record |
| `postMessage` Main nach Worker | Marker unmittelbar vor Aufruf | Worker-Handler-Eintritt | Cross-Realm | Dispatch-Operation | Transferable | `DataCloneError`, Workerfehler | je 1 Marker in Main und Worker |
| Worker Requestvalidierung | Handler-Eintritt | validiert oder rejected | Worker | Dispatch-Operation aus Message | Attempt | Protokoll-/Inputfehler | 2 Clocks, 1 atomarer Duration-Record |
| reine Worker-Mesherfunktion | nach Validierung | MeshResult vorhanden | Worker | Dispatch-Operation | Meshermodus | Mesherfehler | 2 Clocks, 1 atomarer Duration-Record |
| Transferprodukt-Erzeugung | nach Meshing | unmittelbar vor Worker-`postMessage` | Worker | Dispatch-Operation | Outputbytes als Counter | Allokations-/Serialisierungsfehler | 2 Clocks, 1 Duration plus Counter |
| Worker Result-`postMessage` nach Main | Marker unmittelbar vor Aufruf | Main-Handler-Eintritt | Cross-Realm | Dispatch-Operation | Outcome | Workercrash/Timeout | je 1 Marker in Worker und Main |
| Main Resultstrukturvalidierung | Handler-Eintritt | Form, IDs und Größen validiert | Main | Dispatch-Operation | Outcome | invalid result | 2 Clocks, 1 atomarer Duration-Record |
| Revision-/Generation-/Duplicate-Check | nach Strukturvalidierung | accepted oder terminal stale/rejected | Main | Dispatch-Operation | Outcome | stale, old generation, orphan, duplicate | 2 Clocks, 1 atomarer Duration-Record |
| Three.js-Geometrieadoption | accepted | Geometrie, Attribute, Bounds und Scene-State übernommen | Main | Dispatch-Operation | Backend | Adoptionsfehler | 2 Clocks, 1 atomarer Duration-Record |
| erster Draw Submit der Revision | vor `renderer.render` | nach Rückkehr | Main | adoptierte Dispatch-Operation und Rootbezug | Correlation | keine Submission vor Seal | bestehender Draw-Span, kein Extra-Render |
| Worker-Restart | neue Generation registriert | Ready-Handshake validiert | Main und Worker | Systemoperation | keine freien Strings | alte Generation invalid | wenige Control-Records außerhalb Mesh-CPU |

WP05-Resultnachrichten dürfen die vollständigen Worker-Rohrecords in einer bounded Batch mitführen oder über einen separaten Telemetrieport liefern. In beiden Fällen weist Main erst beim Ingest `ingestSequence` zu und bewahrt `realmSequence`, Realm-ID und Rohzeitstempel unverändert. BR-02 schreibt dem späteren Scheduler keine Queue-, Retry- oder Adoptionlogik vor.

## 12. Buffer-, Backpressure- und GC-Vertrag

### 12.1 Entscheidung: bounded append-only segments

BR-02 verwendet keinen überschreibenden Ringbuffer. Ein Ring würde frühe Input-, Queue- oder Clockmarker entfernen und spätere Dauern scheinbar orphanen. Stattdessen besteht der Datenpuffer aus lazily angelegten Segmenten mit je 256 Records. Ein Segment wird nur angehängt; alte Records werden nie verschoben, sortiert oder ersetzt.

V1 besitzt harte, duale Grenzen:

- höchstens 65.536 Datenrecords
- höchstens 16 MiB deterministische Data-Charge
- höchstens 17 MiB tatsächlich serialisierter kanonischer Export
- zusätzlich genau 16 Control-Records und 16 KiB Control-Charge
- höchstens 4.096 gleichzeitig offene Spans

Die Grenze, die zuerst erreicht wird, stoppt die Aufnahme weiterer Datenrecords. Das ist absichtlich ein sichtbarer Messfehler und keine adaptive Stichprobe.

### 12.2 Deterministische Byte-Charge ohne Serialisierung

`JSON.stringify` oder `TextEncoder.encode` pro Record ist im Messfenster verboten. Stattdessen implementiert BR-02 eine versionierte, konservative `chargeRecordV1(record)`-Funktion:

1. Für jeden Record-Kind existiert eine getestete feste Obergrenze für JSON-Keynamen, Interpunktion, Nullwerte und maximale Zahlenrepräsentationen.
2. Alle variablen Strings sind druckbares, feldspezifisch erlaubtes ASCII. Ihre Charge ist JSON-Anführungszeichen plus Stringlänge plus die vorab bekannte Escape-Reserve. Steuerzeichen und freie Unicode-Strings sind nicht zulässig.
3. Jede Zahl wird unabhängig von ihrem aktuellen Wert mit 24 Bytes belastet. Boolean, null und Arraytrenner besitzen feste Charges.
4. Tags werden mit Key- und Maximalwertcharge belastet. Maximal 12 Tags verhindern Objektwachstum.
5. Ein Unit-Test MUSS für jeden maximal ausgefüllten Record-Kind beweisen: `actualUtf8JsonBytes <= chargeRecordV1(record)`.

Die Charge ist ein harter Speicherbudget-Proxy, keine Messung der JavaScript-Heapbelegung. Eventzahl und kleine Segmente begrenzen zusätzlich den Objekt-Overhead. Exakte Heap- oder Leakmessung bleibt außerhalb von BR-02.

### 12.3 Append-Ablauf

1. Eingaberecord vollständig validieren und seine Charge berechnen.
2. Eindeutigkeit von `recordId` sowie alle ID- und Kontextinvarianten prüfen.
3. Würde Recordzahl oder Bytecharge die Datengrenze überschreiten, Originalrecord nicht aufnehmen.
4. Beim ersten solchen Drop einen Control-Record `buffer-overflow` aus der Reserve schreiben.
5. Für jeden Drop `TelemetryOverflowSummary.droppedRecords` und `droppedChargeBytes` erhöhen. Ein zu großer Einzelrecord erhöht zusätzlich `rejectedOversizeRecords`.
6. Weitere Drops erzeugen nicht je ein Ereignis, damit ein Fehlersturm die Reserve nicht erschöpft. Der Exportkopf trägt immer die exakten Endzähler.
7. Falls auch die Control Reserve erschöpft ist, wird `controlReserveExhausted: true` gesetzt. Dieser Header liegt außerhalb der Recordbudgets und kann daher nicht verschwiegen werden.

Ein Overflow invalidiert den Run. BR-02 darf nicht nachträglich alte Records löschen, die Grenzen erhöhen oder nur vermeintlich unwichtige Eventarten verwerfen.

### 12.4 Atomic Intervals und offene Spans

Kurze Same-Realm-Abschnitte, deren Start und Ende im selben synchronen Call-Site liegen, schreiben genau einen `TelemetryDurationSample`, der beide Rohzeitstempel enthält. Das gilt insbesondere für `main.frame-work` und `draw-submit.cpu`. Langlebige, asynchrone oder Cross-Realm-Abläufe schreiben Start, Ende und nach erfolgreichem Match ein Duration-Sample. Damit bleibt die kausale Rohspur erhalten, ohne pro Frame drei Records je Teilspan zu erzwingen.

Die Open-Span-Map ist auf 4.096 Einträge begrenzt. Ein weiterer Start wird als Overflow behandelt. Beim Seal werden offene Starts und pending Ends deterministisch in aufsteigender `spanId`-Reihenfolge geprüft; je eindeutiger Grund wird ein Control-Record geschrieben, alle Gründe erscheinen zusätzlich im Exportkopf.

### 12.5 Append-only Events und Gauges

| Datenart | Regel |
| --- | --- |
| Span Start/End, Duration, Browserentry, Capability, Invalidation | immer append-only |
| Counter | append-only Delta, nie ein mutierter Gesamtstand |
| Gauge | append-only Zustands-Snapshot bei Änderung und optional an Phasengrenzen |
| `finalGauges` | beim Append in einer kleinen festen Map aktualisierte Endsicht; ersetzt keine Gauge-Records |
| Overflow- und Dropstände | mutable, feste Headerstruktur außerhalb der Recordliste, weil weitere Drops keinen Ereignissturm erzeugen dürfen |

Automatische Diagnostics wie `records-written` dürfen nicht für jeden Record wiederum einen Record erzeugen. Solche Zähler werden gebündelt an Phasengrenzen oder nur in `finalGauges` geschrieben, um Rekursion zu vermeiden.

### 12.6 Seal und Exportzeitpunkt

Ein Run wird genau einmal sealed:

1. Messfenster endet mit einem Rohmarker oder einer Invalidation.
2. Browserobserver liefern über `takeRecords()` noch bereits vorhandene Einträge; danach `disconnect()`.
3. Pending Spanpaare werden aufgelöst, Unmatched-Fälle dokumentiert.
4. Recordsegmente und Final-Gauge-Sicht werden logisch unveränderlich.
5. Frühestens in einer nachfolgenden Task und üblicherweise erst nach explizitem Exportklick wird die kanonische Exportstruktur aufgebaut und einmal serialisiert.

`pagehide` vor regulärem Seal erzeugt `pagehide-before-seal` und versucht nur das in-memory Seal. BR-02 führt keine synchrone Unload-Serialisierung und kein Netzwerk-Beacon ein. Ist kein Download mehr möglich, darf keine erfolgreiche Evidence-Datei behauptet werden.

## 13. Browsercollector-Vertrag

### 13.1 Setup-Reihenfolge

Im Full-Modus werden Collector vor Szenario- und Fixture-Arbeit installiert:

1. Window-Realm und Clock registrieren.
2. Initiale Capability-Samples schreiben.
3. `document.visibilityState` und `document.hasFocus()` erfassen; Listener installieren.
4. Einen separaten `PerformanceObserver` für `longtask` mit `{ type: 'longtask', buffered: true }` anlegen, falls unterstützt.
5. Einen separaten Observer für `event` mit `{ type: 'event', buffered: true, durationThreshold: 16 }` anlegen, falls unterstützt.
6. Falls die konkrete TypeScript-DOM-Lib den aktuellen Observeroptions-Typ enger modelliert, ist ein lokal typisierter Adapter zulässig, kein `any` im Exportvertrag.
7. Run starten.

`type` und `entryTypes` werden nicht gemischt. Ein Collector abonniert nur den benötigten Entry-Type. Jeder Callback liest `droppedEntriesCount`; ein Wert größer 0 erzeugt ein Counter-Delta und `observer-dropped-entries`. Der Run wird invalidiert, weil Vollständigkeit der Rohspur nicht mehr bewiesen ist.

### 13.2 Long Tasks

- Verfügbarkeit: `PerformanceObserver.supportedEntryTypes.includes('longtask')` im Window.
- Sobald ein Worker-Realm existiert, ist Long Tasks dort `unsupported`, weil die API Window-only ist. Solange WP05 noch gar nicht aktiv ist, meldet Main nur die Systemcapability `dedicated-worker: not-active` und erfindet kein Worker-Realm. In keinem Fall entsteht eine Null-Dauer.
- Start ist `performance.timeOrigin + entry.startTime`; Ende ist Start plus browsergelieferte Duration.
- Nur die allowlist-basierte `entry.name`-Attributionsklasse und die Anzahl der Attributionseinträge werden übernommen.
- `containerType`, `containerName`, `containerId` und `containerSrc` werden niemals exportiert.
- Eine Long Task kann nicht zuverlässig einer einzelnen App-Funktion zugerechnet werden. OperationContext bleibt null, sofern kein eindeutiger, rein zeitlicher Overlap mit genau einem synchronen Rootspan vorliegt. Auch dann ist die Zuordnung nur ein Tag `correlation`, keine Kausalitätsbehauptung.

### 13.3 Event Timing

- Verfügbarkeit: Entry-Type `event` im Window. `first-input` ist für BR-02 nicht nötig, weil es eine separate, begrenzte Sicht desselben Problembereichs ist.
- Es werden nur browsergelieferte PerformanceEventTiming-Entries verarbeitet. Kontinuierliche Events werden nicht synthetisch als Event Timing nachgebaut.
- `inputDelayMs = processingStart - startTime`.
- `eventProcessingMs = processingEnd - processingStart`.
- `presentationDelayApproxMs = duration - inputDelayMs - eventProcessingMs`, aber nur wenn das Ergebnis endlich und nichtnegativ ist. Sonst bleibt das Feld null und der Entry erhält `clock-order-indeterminate`; es wird nie auf 0 geklemmt.
- `durationMs` bleibt der browsergelieferte, grob gerundete Wert. Er ist keine bestätigte Sichtbarkeit.
- `target`, `interactionRect`, DOM-Referenzen, Keyboardwerte, Eingabetext und Pointerdaten werden verworfen, bevor ein TelemetryRecord gebaut wird.

### 13.4 User Timing

Der BR-02-Rohsink ist maßgeblich. Ein User-Timing-Mirror ist in allen drei Defaultmodi deaktiviert. Er KANN in einem separaten Development-Diagnosebuild mit festen Namen wie `hestia:mesh-cpu:start` aktiviert werden, wenn:

- keine IDs, Tags oder `detail`-Nutzdaten enthalten sind,
- Marks nach dem zugehörigen Measure sofort mit `clearMarks` und `clearMeasures` gelöscht werden,
- seine Aktivierung als eigene Buildkonfiguration dokumentiert wird,
- daraus keine Benchmark-Evidence erzeugt wird.

Diese Begrenzung folgt daraus, dass beliebige Seitenskripte User-Timing-Entries lesen können.

### 13.5 Visibility und Focus

Visibility und Focus sind zwei getrennte State Machines.

- Vor Run-Start werden `document.visibilityState` und `document.hasFocus()` als Gauges geschrieben.
- `initially-hidden` oder `initially-unfocused` invalidiert den Run vor dem ersten Messmarker.
- Jeder `visibilitychange`-Handler liest den aktuellen Zustand neu. `hidden` erzeugt `visibility-lost` mit `invalidate-run`.
- Window-`blur` und `focus` lesen ebenfalls `document.hasFocus()` neu. `not-focused` erzeugt `focus-lost` mit `invalidate-run`.
- Eine Rückkehr zu sichtbar oder fokussiert schreibt den neuen Gauge, revalidiert denselben Run aber nicht. BR-03 muss für eine gültige Messung einen neuen Run starten.
- Export nach regulärem Seal darf den Fokus verlieren, ohne die bereits abgeschlossene Messung rückwirkend zu invalidieren.

## 14. Sichere Exportoberfläche ohne TestBridge

### 14.1 Aktivierungsgrenze

Die Exportoberfläche existiert nur, wenn beide Bedingungen erfüllt sind:

1. Buildzeit: ein Vite-Define wie `__HESTIA_BENCHMARK_TELEMETRY__ === true` hat Benchmark-Collector eingebunden.
2. Laufzeit: eine explizite Benchmarkroute beziehungsweise ein von BR-01 erlaubter Querywert wählt einen der drei Telemetriemodi.

Ein Queryparameter allein kann Collector in einem gewöhnlichen Production-Build nicht aktivieren. Ungültige Werte fallen nicht auf Full zurück, sondern auf `telemetry-disabled` und einen sanitisierten Konfigurationsfehler außerhalb eines Benchmarkexports.

### 14.2 Einmal-Download

Die Route zeigt nach Seal einen fokussierbaren Button mit stabiler Semantik, etwa `data-testid="telemetry-export"`. Ein expliziter Klick:

1. prüft, dass der Run sealed und noch kein Download ohne synchronen Fehler initiiert wurde,
2. baut in einer nachfolgenden Task `TelemetryExportV1` mit fester Propertyreihenfolge,
3. serialisiert genau einmal zu UTF-8-JSON,
4. erstellt `Blob` und Object-URL,
5. prüft außerhalb des Messfensters, dass die tatsächliche UTF-8-Bytezahl höchstens 17 MiB beträgt,
6. löst einen Download `telemetry-<runId>.json` aus,
7. widerruft die Object-URL und deaktiviert den Button nach fehlerfreier Initiierung.

Playwright kann in BR-03 später den Browserdownload abfangen. Das ist kein HUD-Scraping und braucht keine globale API.

### 14.3 Verbotene Oberflächen

- kein `window.TestBridge`, `window.telemetry`, symbolischer oder anderweitig global auffindbarer Mutationsdienst
- kein `postMessage`-Listener, der Voxel, Revision, Queue, Clock oder Collectorzustand mutiert
- kein allgemeiner RPC-Endpunkt
- kein Export über HUD-Text oder DOM-Parsing gerundeter Werte
- kein automatischer Upload und kein Netzwerkziel
- kein File-System-Access-API-Zwang

Der Button kann ausschließlich ein bereits sealed, unveränderliches Ergebnis ausgeben. Er kann keine Voxel erzeugen, ändern, remeshen oder rendern.

### 14.4 Exportfehler und Determinismus

Bis zu vier Exportversuche werden in einem kleinen, nach Seal getrennten `exportAttempts`-Array erfasst. Eine ohne synchronen Fehler angestoßene Browseraktion heißt `initiated`; BR-02 behauptet nicht, dass der Nutzer die Datei tatsächlich gespeichert hat. `NotAllowedError` wird `permission-denied`, `SecurityError` wird `blocked`, fehlende Blob-/Downloadoberfläche wird `unsupported`, sonstige Fehler werden `error`. Ein gescheiterter Versuch öffnet den Messpuffer nicht erneut. Der aktuelle Versuch wird vor der Serialisierung vorläufig als `initiated` eingetragen. Falls ein nachfolgender synchroner Schritt fehlschlägt, wird dieser getrennte Attempt-Status für einen möglichen nächsten Export auf den Fehlerstatus gesetzt; der sealed Messpuffer bleibt unverändert.

Für identische sealed Records, Realm-Descriptor, BR-01-Metadaten und Exportattempts MUSS die JSON-Bytefolge identisch sein:

- Records stehen in `ingestSequence`-Reihenfolge; sie werden nicht nach Timestamp sortiert.
- Realms stehen nach `realmId`; Capability-Records bleiben wie alle Records in Ingest-Reihenfolge; Invalidation-Gründe werden im Header lexikografisch dedupliziert.
- Objektkeys werden durch einen expliziten Canonical-Export-Builder in fester Reihenfolge angelegt.
- Es gibt keine `Map`, `Set`, `Date`, `undefined`, Getter, localeabhängige Zahlformatierung oder zufällige Exportzeit.
- `createdUtc` ist bereits ein festes BR-01-Eingabefeld. Ein Klickzeitpunkt wird nicht in den kanonischen Payload geschrieben.

## 15. Build- und Modusvertrag

| Modus | Benchmark-Build | Collector | Clockreads im Apppfad | Export |
| --- | --- | --- | --- | --- |
| `telemetry-disabled` | enthaltene API-Stubs, Sink konstant no-op | keine Observer, keine rAF-/Spanrecords | 0 durch Telemetrie | kein Telemetrieexport; BR-03 misst Baseline extern |
| `telemetry-enabled-minimal` | ja | manuelle App-/Worker-Spans, rAF, Capability, Visibility, Focus, Buffer | gemäß Instrumentierung | Einmal-Download |
| `telemetry-enabled-full` | ja | Minimal plus Long Task und Event Timing | zusätzlich Observercallbacks | Einmal-Download |

Ordinary Production ist nicht nur ein Laufzeitmodus:

- Builddefine setzt `telemetry-disabled` konstant.
- Full- und Minimal-Collector, Exportcontroller, Observeradapter, ID-Registry und Record-Strings liegen hinter statisch eliminierbaren Imports oder Guards.
- Ein Build-Vertragstest prüft, dass Markerstrings wie `browser.long-task`, `telemetry-export` und `br-02-in-browser-telemetry-v1` nicht im ordinary Production-Bundle vorkommen.
- Ein zweiter Build-Vertragstest prüft, dass der Benchmark-Build sie enthält und die Route ohne gültigen Modus trotzdem disabled bleibt.
- Gemeinsame Typen dürfen als Type-only Imports existieren und erzeugen keinen Runtimecode.

## 16. Spätere Overheadmessung, noch kein Benchmark

BR-02 definiert die Versuchsbedingungen, führt sie aber nicht aus und setzt keine Grenzwerte.

### 16.1 Zwei getrennte Fragen

1. **Runtime-Overhead:** derselbe Benchmark-Bundle und dasselbe BR-01-Szenario in `disabled`, `minimal` und `full`.
2. **Build-/Startup-Footprint:** ordinary Production mit tree-shaken Telemetrie gegen Benchmark-Build. Diese Frage wird separat berichtet und nicht mit Runtime-Overhead vermischt.

### 16.2 Spätere Runtime-A/B-Ausführung

- BR-03 startet die von BR-01 definierte Prozess-, Phase-, Browser- und Hardwarezelle.
- Modi werden innerhalb jeder vergleichbaren Zelle gegenbalanciert, zum Beispiel rotierte Folgen `D-M-F-F-M-D`, nicht immer disabled zuerst.
- Fixture, Route, Viewport, Buildrevision, Browser, Energieprofil und Warm-up-Regel bleiben identisch.
- `telemetry-disabled` liefert keine in-app Zeitmessung. Der spätere Runner erfasst deshalb den äußeren Szenarioabschluss und Prozesskontext unabhängig vom BR-02-Sink.
- Minimal und Full exportieren zusätzlich `recordCount`, Charge, Clockread-/Observercallback-Zähler und Drops, jedoch keine Perzentile.
- BR-04 berechnet erst später Unterschiede, Verteilungen und Unsicherheit nach dem akzeptierten Protokoll. BR-02 bezeichnet keinen einzelnen Run als schneller, langsamer oder akzeptabel.

### 16.3 Zu vergleichende Rohgrößen

- äußerer Szenarioabschluss des Runners
- Main-Thread-Liveness und rAF-Rohintervalle
- `main.frame-work` und `draw-submit.cpu`
- Long-Task-Rohentries nur in Full
- Recordzahl, Data-Charge, Observercallbackzahl, Observerdrops und Bufferoverflow
- Bundlebytes und Startupmarker separat für die Buildfrage

Eine per-Record-Selbstzeitmessung ist nicht Default, da zwei zusätzliche Clockreads pro Append genau den zu untersuchenden Overhead erhöhen würden. Falls später erforderlich, ist sie ein separates Trace-Profil und keine reguläre Benchmarkzelle.

## 17. Fehler- und Statusmatrix

| Situation | Record | Wirkung | Ersatzwert verboten |
| --- | --- | --- | --- |
| API fehlt oder Entry-Type fehlt | Capability `unsupported` | Metrik nicht verfügbar; Run nur invalid, wenn BR-01 sie ausdrücklich verlangt | 0 Duration/Count |
| API vorhanden, für diesen Pfad nicht benutzt | Capability `not-active` | keine Messreihe | 0 |
| `NotAllowedError` | Capability/ExportAttempt `permission-denied` | bei required Capability Run invalid | 0 |
| `SecurityError` | `blocked` | bei required Capability Run invalid | 0 |
| anderer Setupfehler | `error` plus sanitierter Code | bei required Capability Run invalid | Fehlertext, Stack, 0 |
| Dokument initial hidden | Gauge `hidden`, `initially-hidden` | Run invalid vor Messung | rAF 0 |
| Dokument wird hidden | Gauge plus `visibility-lost` | Run unwiderruflich invalid | Pausen als lange Frames |
| Fokus initial verloren | Gauge `not-focused`, `initially-unfocused` | Run invalid vor Messung | 0 |
| Fokusverlust während Run | Gauge plus `focus-lost` | Run unwiderruflich invalid | 0 |
| Same-Realm-Clock regrediert | `clock-anomaly` | Run invalid | Klemmen/Runden |
| Cross-Realm-Reihenfolge bis 4 ms unklar | `clock-order-indeterminate` | betreffender Span invalid, Rohmarker bleiben | Dauer 0 |
| Cross-Realm-Abweichung über 4 ms | `clock-anomaly` | Run invalid | Offsetkorrektur |
| Observer meldet Drops | Counter plus `observer-dropped-entries` | Run invalid | stilles Weiterlaufen |
| Datenpuffer voll | `buffer-overflow`, Headerzähler | Run invalid | Ringüberschreibung |
| Pagehide vor Seal | `pagehide-before-seal` | Run invalid/truncated | synchroner Unload-Upload |

## 18. Konkreter Testvertrag

Die folgenden 66 Fälle sind spätere Pflichtfälle. In diesem Planungsauftrag wurde keiner davon ausgeführt. Unit-Tests verwenden injizierte Fake-Clocks und Record-Builder; Browserverträge verwenden nur die explizite Benchmarkroute; Build-Verträge prüfen die zwei Buildvarianten.

### 18.1 Clock und Realms, 12 Fälle

| ID | Art | Fall und erwartetes Ergebnis |
| --- | --- | --- |
| C01 | Unit | `timeOriginMs=1000.25`, `nowMs=2.125` erzeugt exakt `absoluteMonotonicMs=1002.375`. |
| C02 | Unit | Ein Rohwert mit vielen darstellbaren Dezimalstellen überlebt Builder, Buffer und JSON-Parse ohne `toFixed` oder Rundung. |
| C03 | Unit | `NaN` in Time Origin, now oder Summe wird rejected und erzeugt `clock-anomaly`, kein Originalrecord. |
| C04 | Unit | `Infinity` und `-Infinity` werden in jedem Clockfeld rejected. |
| C05 | Unit | Negatives `nowMs` oder `timeOriginMs` wird rejected; es entsteht nie eine negative Duration. |
| C06 | Unit | Zwei gleiche aufeinanderfolgende now-Werte im selben Realm werden akzeptiert und dürfen eine echte Dauer 0 ergeben. |
| C07 | Unit | Same-Realm-Regression um 0,001 ms invalidiert den Run, weil Toleranz nicht für Realm-Monotonie gilt. |
| C08 | Unit | Änderung des registrierten Time Origins im selben Realm erzeugt `clock-anomaly`. |
| C09 | Unit | Worker-Hello liegt zwischen Main-Send und Main-Receive; Realm wird registriert und Cross-Realm freigegeben. |
| C10 | Unit | Start in Main und Ende im Worker ergeben exakt die normalisierte Differenz und Basis `normalized-cross-realm`. |
| C11 | Unit | Cross-Realm-Ende liegt 2 ms vor Start; kein Duration-Sample, Span-Invalidation `clock-order-indeterminate`, kein Klemmen auf 0. |
| C12 | Unit | Worker-Hello oder Spanende liegt mehr als 4 ms außerhalb der kausalen Schranke; Run wird mit `clock-anomaly` invalid. |

### 18.2 IDs, Operationen und Spans, 12 Fälle

| ID | Art | Fall und erwartetes Ergebnis |
| --- | --- | --- |
| I01 | Unit | Main vergibt monotone, run-lokal eindeutige Operation-, Span- und Record-IDs ohne Datum oder Zufall. |
| I02 | Unit | Zweites `recordId` wird rejected; `duplicate-record-id` bleibt als Control-Record und im Invalidation-Header sichtbar. |
| I03 | Unit | Wiederholung derselben `operationId` mit identischem Kontextfingerprint wird dedupliziert und akzeptiert. |
| I04 | Unit | Dieselbe Operation mit anderem Chunk oder Revision erzeugt `operation-context-conflict`. |
| I05 | Unit | Dieselbe `requestId` mit anderer Generation, Revision, Chunk oder Meshermodus erzeugt `request-id-conflict`. |
| I06 | Unit | Negative, nicht-ganzzahlige oder nicht-safe `worldRevision` wird rejected. |
| I07 | Unit | Span-End trifft vor Span-Start ein; beide Rohrecords bleiben in Ingest-Reihenfolge und später entsteht genau eine Duration. |
| I08 | Unit | Zweiter Start derselben Span-ID erzeugt `duplicate-span-start`, aber keinen zweiten offenen Span. |
| I09 | Unit | Zweites Ende derselben Span-ID erzeugt `duplicate-span-end` und keine zweite Duration. |
| I10 | Unit | Offener Start bei Seal erzeugt `unmatched-span-start`; Startrecord bleibt exportiert. |
| I11 | Unit | Pending End bei Seal erzeugt `unmatched-span-end`; Endrecord bleibt exportiert. |
| I12 | Unit | Worker-Restart registriert eine neue Generation und Realm-ID; Resultat der alten Generation kann nicht mit neuer Operation adoptiert werden. |

### 18.3 Messsemantik und WP05-Kompatibilität, 10 Fälle

| ID | Art | Fall und erwartetes Ergebnis |
| --- | --- | --- |
| M01 | Browser | Erster rAF-Callback exportiert `previousCallback:null` und `rafIntervalMs:null`, nicht 0. |
| M02 | Unit | Zweiter rAF-Callback bildet exakt die Differenz der browsergelieferten Callback-Timestamps ohne Rundung. |
| M03 | Unit | Ein Frame erzeugt getrennte `main.frame-work`- und `draw-submit.cpu`-Dauern; keine Summierung zu „render time“. |
| M04 | Unit | Long-Task-Start verwendet Window-Time-Origin plus Entry-Start; Duration und Attributionklasse bleiben browsernah. |
| M05 | Unit | Event Timing berechnet Input Delay und Processing aus den drei Entry-Markern und bewahrt browsergelieferte Duration. |
| M06 | Unit | Negative abgeleitete Presentation Delay bleibt null und erzeugt `clock-order-indeterminate`, nicht 0. |
| M07 | Unit | Zwei Event-Correlation-Kandidaten mit gleichem Typ/Timestamp ergeben `ambiguous` und keine geratene Operation-ID. |
| M08 | Unit | Scheduler-Queuewait nutzt nur Main-Enqueue bis Main-Dispatch und ist Same-Realm. |
| M09 | Unit | Main-to-Worker und Worker-to-Main tragen Basis `normalized-cross-realm` und nie das irreführende Label „reine Transferzeit“. |
| M10 | Unit | Stale Resultat erhält terminalen Outcome und Stale-Counter, aber keinen `result.adoption`-Span und keinen Revision-Submit-Abschluss. |

### 18.4 Buffer und Backpressure, 10 Fälle

| ID | Art | Fall und erwartetes Ergebnis |
| --- | --- | --- |
| B01 | Unit | Record Nummer 65.536 passt, Record 65.537 wird rejected und löst Overflow aus. |
| B02 | Unit | Ein Record, der die 16-MiB-Data-Charge überschreiten würde, wird rejected, auch wenn noch Recordslots frei sind. |
| B03 | Unit | Segmentgrenzen 255/256/257 bewahren Ingest-Reihenfolge; kein `shift`, Ringoverwrite oder Sortieren findet statt. |
| B04 | Unit | Der erste Overflow schreibt genau einen `buffer-overflow`-Control-Record. |
| B05 | Unit | Weitere 100 Drops erzeugen keine 100 Records, erhöhen aber Headerzähler und Dropcharge exakt. |
| B06 | Unit | Erschöpfte Control Reserve setzt `controlReserveExhausted`; der Exportkopf bleibt vollständig. |
| B07 | Unit | Ein einzelner Record über Feld- oder Stringlimits wird `record-too-large` und niemals teilweise abgeschnitten exportiert. |
| B08 | Unit | Der 4.097. offene Span wird rejected und macht Overflow sichtbar. |
| B09 | Unit | `seal()` friert genau einen Snapshot ein; jeder spätere `append` liefert `sealed` und verändert keine Sequenz oder Gauge. |
| B10 | Unit | Spy auf `JSON.stringify` und `TextEncoder.encode` bleibt während Clockread, Append, Observercallback und Seal unberührt; Aufruf erst beim Export. |

### 18.5 Browserfähigkeiten, Visibility und Focus, 12 Fälle

| ID | Art | Fall und erwartetes Ergebnis |
| --- | --- | --- |
| A01 | Browser | Entry-Type `longtask` vorhanden und Observer startet: Capability `supported`. |
| A02 | Browser | `longtask` fehlt in `supportedEntryTypes`: Capability `unsupported`, kein Long-Task-Record mit 0. |
| A03 | Browser | Entry-Type `event` vorhanden und Observer startet: Capability `supported`. |
| A04 | Browser | `event` fehlt: Capability `unsupported`, kein Event-Timing-Nullsample. |
| A05 | Unit | `PerformanceObserver` fehlt vollständig: Observercapability und abhängige Entry-Types werden getrennt `unsupported`. |
| A06 | Unit | Observerinitialisierung wirft `NotAllowedError`: `permission-denied`; required-by-plan invalidiert, optional bleibt als fehlende Metrik sichtbar. |
| A07 | Unit | Observerinitialisierung wirft `SecurityError`: `blocked`, sanitierter Code ohne Fehlermeldung oder Stack. |
| A08 | Unit | Callback meldet `droppedEntriesCount=3`: Counterdelta 3 plus `observer-dropped-entries`, Run invalid. |
| A09 | Browser | Dokument ist bei Start hidden: initialer Gauge `hidden`, `initially-hidden`, keine gültige Messphase. |
| A10 | Browser | `visibilitychange` zu hidden während Run erzeugt Gauge und `visibility-lost`; Rückkehr revalidiert nicht. |
| A11 | Browser | Window blur mit `document.hasFocus() === false` erzeugt `not-focused` und `focus-lost`. |
| A12 | Browser | Exportklick nach regulärem Seal darf Focus ändern, ohne die sealed Messgültigkeit rückwirkend zu ändern. |

### 18.6 Export, Datenschutz und Builds, 10 Fälle

| ID | Art | Fall und erwartetes Ergebnis |
| --- | --- | --- |
| E01 | Unit | Zwei Exporte identischer Inputs sind byteidentisch, einschließlich Property- und Recordreihenfolge. |
| E02 | Unit | Export enthält Rohdoubles und keine gerundeten HUD-Strings, p50, p95 oder statistischen Summaries. |
| E03 | Browser | Download funktioniert bei leerem oder geänderten HUD-Text, weil kein DOM-Scraping stattfindet. |
| E04 | Browser | `window.TestBridge`, `window.telemetry` und andere vereinbarte globale Mutationsnamen sind `undefined`; es gibt keinen Message-RPC-Listener. |
| E05 | Browser | Queryparameter kann in ordinary Production weder Collector noch Exportbutton aktivieren. |
| E06 | Build | Ordinary Production-Bundle enthält die drei vereinbarten Telemetrie-Markerstrings nicht. |
| E07 | Build | Benchmark-Bundle enthält Collector und Exportcontroller; ungültiger Modus bleibt trotzdem disabled. |
| E08 | Unit | Builder verwirft Target, Selector, Text, Key, Pointerkoordinate, URL, Containerdaten, Stack und freien Fehlertext. |
| E09 | Unit | Jede `unsupported`/`blocked`/`permission-denied`-Capability bleibt Status und erzeugt keinen Messwert 0. |
| E10 | Browser | Nach fehlerfreier Downloadinitiierung ist der Button deaktiviert, die Object-URL widerrufen und eine zweite Initiierung ohne Reload unmöglich. |

## 19. Implementierungs- und Abnahmekriterien

BR-02 ist später nur akzeptierbar, wenn alle folgenden Bedingungen gleichzeitig erfüllt sind:

- Verträge und Runtimevalidator entsprechen Abschnitt 6 und akzeptiertem BR-01-Schema.
- Alle Clockmarker gehen durch genau einen injizierbaren Clock-Adapter.
- Main- und Browserinstrumentierung entspricht den Abschnitten 9 und 10.
- WP05-kompatible Realm-, Context- und Message-Draft-Typen existieren, ohne Worker oder Scheduler zu implementieren.
- Full-Modus prüft Entry-Types pro Realm und behandelt Unsupported-, Permission-, Security- und Dropfälle exakt.
- Buffer ist dual bounded, überschreibt nichts, serialisiert nicht im Messfenster und macht jeden Drop sichtbar.
- Export ist kanonisch, nach Seal, einseitig read-only und ohne HUD-/Global-Bridge-Abhängigkeit.
- Production tree-shaking und Benchmark-Aktivierungsgrenze sind durch Build-Vertragstests belegt.
- Alle 66 Pflichtfälle sind implementiert; Repository-Build, Unit- und relevante Browsertests sind grün.
- Es gibt keine neue Runtime- oder Dev-Abhängigkeit.
- Es gibt keine Statistik, keinen Process-Runner, keine CDP-Abfrage, keine GPU-/Memory-/Leakmessung und keinen WP05-Worker.
- Der Implementierungsbericht nennt exakten Basis-SHA, Branch, Commit-SHA, ausgeführte Befehle und Ergebnisse, aber keine nicht ausgeführten Benchmarks.

## 20. Datenschutz, Sicherheit und Provenienz

### 20.1 Datenminimierung

Der Export enthält technische, run-lokale IDs, fest definierte Tags, Chunkkoordinaten, Revisionen, Zeitmarker, Größen und Outcomes. Er enthält keine Personenkennungen, Inhalte, Eingabetexte, URLs, Pfade oder DOM-Identifikatoren. Chunkdaten und Voxelmaterialarrays werden nicht Teil der Telemetrie.

Dateinamen verwenden nur die validierte Run-ID. Die Route lädt nichts hoch. Aufbewahrung, Weitergabe und Löschung heruntergeladener Evidence-Dateien bleiben eine spätere Projekt-/Owner-Richtlinie.

### 20.2 Fremdcode und Lizenzen

- Für diesen Bericht wurde kein Fremdcode kopiert.
- W3C-Spezifikationen wurden als Primärquellen referenziert; W3C weist auf seine permissive Dokumentlizenz hin.
- Der WHATWG HTML Living Standard wurde als aktuelle normative Quelle für rAF, Visibility und Focus referenziert.
- Open-Source-Beispiele aus früheren Projektberichten wurden nicht in diesen Vertrag übernommen.
- Der Voxel-Lab-Snapshot enthält im geprüften Baum keine `LICENSE`-Datei. Das ist eine offene Distributionsfrage, kein Grund, fremden Code als frei nutzbar anzunehmen.

### 20.3 Primärquellenregister

| Quelle | Stand bei Prüfung | Verwendung |
| --- | --- | --- |
| [High Resolution Time Level 3](https://www.w3.org/TR/hr-time-3/) | W3C Working Draft, 2026-03-24 | monotone Clock, Time Origin, Precision |
| [Performance Timeline](https://www.w3.org/TR/performance-timeline/) | W3C Candidate Recommendation Draft, 2025-05-21 | Observer, buffered Entries, Drops, Realm-Support |
| [Long Tasks](https://www.w3.org/TR/longtasks-1/) | W3C Working Draft, 2026-03-19 | 50-ms-Tasks, Window-Scope, Attribution |
| [Event Timing](https://www.w3.org/TR/event-timing/) | W3C Working Draft, 2026-03-19 | Input Delay, Processing, grobe Präsentationsnähe |
| [User Timing](https://www.w3.org/TR/user-timing/) | W3C Candidate Recommendation Draft, 2026-03-11 | Marks/Measures, Exposure und Privacy-Grenze |
| [HTML Animation Frames](https://html.spec.whatwg.org/multipage/imagebitmap-and-animations.html#animation-frames) | Living Standard, geprüft 2026-08-12 | rAF-Timestamp, Window/DedicatedWorker-Kontext |
| [HTML Page Visibility](https://html.spec.whatwg.org/multipage/interaction.html#page-visibility) | Living Standard, geprüft 2026-08-12 | visible/hidden und visibilitychange |
| [HTML Focus](https://html.spec.whatwg.org/multipage/interaction.html#dom-document-hasfocus) | Living Standard, geprüft 2026-08-12 | `document.hasFocus()` und Focussemantik |

## 21. Offene Owner-Entscheidungen und offene Unsicherheit

Keine der folgenden Fragen blockiert die technische Implementierungsreife von BR-02, weil V1 einen sicheren Default festlegt. Sie blockieren teilweise erst Messkampagnen oder Distribution.

| Thema | V1-Default | Spätester Entscheidungszeitpunkt |
| --- | --- | --- |
| Exakter BR-01-Integrations-SHA | Platzhalter im Handoff; Implementierer stoppt ohne akzeptierten SHA | zwingend vor Implementierungsstart |
| Zielbrowser und Mindestversionen | Chrome-/Edge-first gemäß Repository; Capability-driven, keine Universalitätsbehauptung | vor BR-03-Matrix und Performanceaussagen |
| Hardware- und Energieprofile | nicht Teil von BR-02 | vor erster Benchmarkkampagne |
| Buffergrenzen | 65.536 Records, 16 MiB Charge, 17 MiB Export, 256er Segmente | nur vor Contract-v1-Freeze ändern, sonst neue Version |
| Fokuspolicy | Fokusverlust invalidiert streng | nur durch versionierte Owner-Entscheidung lockern |
| Welche optionalen APIs BR-01 als required markiert | Default: HRT, Window-rAF, Visibility, Focus und Benchmarkdownload required; Long Task und Event Timing optional, außer der Plan verlangt sie; PerformanceObserver wird required, sobald ein required Entry-Type davon abhängt | beim jeweiligen BR-01-Plan |
| Evidence-Aufbewahrung und Zugriff | lokaler Einmal-Download, kein Upload | vor geteilter oder langfristiger Evidence-Ablage |
| Repository-/Distributionslizenz | keine Annahme aus fehlender LICENSE | vor externer Distribution |

Offene technische Unsicherheit bleibt die reale Browserauflösung und der tatsächliche Telemetrie-Overhead. Beide werden bewusst nicht geschätzt. Capability-Records und die spätere A/B-Matrix machen sie messbar, ohne sie in BR-02 zu behaupten.

## 22. Statusbegründung

### 22.1 Abdeckung der geforderten Artefakte

| Artefakt | Abdeckung |
| --- | --- |
| A. Telemetrie-Datenmodell | vollständige Exporttypen und Runtimeinvarianten in Abschnitt 6 |
| B. Clock- und Korrelationsvertrag | Abschnitte 7 und 8 |
| C. Instrumentierungsstellen | heutiger Pfad in Abschnitt 10, späterer WP05-Pfad in Abschnitt 11 |
| D. Buffer-/Backpressure-Regel | Abschnitt 12 |
| E. Kein TestBridge-Pattern | build-gated Einmal-Download in Abschnitt 14 |
| F. Overheadmessung | Modi in Abschnitt 15, spätere A/B-Methode in Abschnitt 16 |
| G. Mindestens 40 Tests | 66 konkrete Fälle in Abschnitt 18 |
| H. Handoff-Prompt | Abschnitt 23, Basis ist ausdrücklich der akzeptierte BR-01-Integrations-SHA |

### 22.2 Abschlussstatus

**Status: `READY_FOR_LATER_IMPLEMENTATION`**

Die Messsemantik, Clocknormalisierung, ID-Korrelation, Unsupported-Darstellung, Buffergrenze, Exportoberfläche, Productiongrenze und spätere Overheadmessung sind eindeutig festgelegt. Der Testvertrag deckt die geforderten Fehlerfälle ab. Zusätzliche Recherche ist für den Implementierungsstart nicht nötig.

Die zeitliche Stop-Regel bleibt verbindlich: kein BR-02-Write vor akzeptierter und integrierter WP04 sowie akzeptiertem und integriertem BR-01. Der konkrete Implementierungsbasis-SHA ist deshalb absichtlich kein erfundener Wert.

## 23. Copy-and-paste-Handoff-Prompt für den späteren lokalen Implementierungsagenten

```text
Du bist der einzige Write-Agent für BR-02 im Repository
BenjaminHornung/hestia-voxel-kernel-lab.

AUFTRAG
Implementiere BR-02 In-Browser-Telemetrie exakt nach dem akzeptierten Bericht
"BR02_In_Browser_Telemetrie_Abschlussbericht_2026-08-12.md" und dem akzeptierten
BR-01-Vertrag. Erfasse Rohereignisse und Spans, aber implementiere keine Statistik,
keinen Process-Runner und keinen Worker/Scheduler.

HARTE STARTBEDINGUNGEN
1. WP04 ist akzeptiert und integriert.
2. BR-01 ist akzeptiert und integriert.
3. Ersetze <ACCEPTED_BR01_INTEGRATION_SHA> durch den vom Owner bestätigten exakten
   Integrations-SHA. Starte nicht, wenn dieser SHA fehlt oder nicht auflösbar ist.
4. Lies AGENTS.md vollständig und bestätige, dass kein anderer Write-Agent im Repo
   arbeitet.
5. Erzeuge Branch agent/br-02-in-browser-telemetry exakt von
   <ACCEPTED_BR01_INTEGRATION_SHA>. Kein Rebase auf einen anderen Stand ohne Review.

VERBOTE
- Keine Übernahme aus Weltraum-Spiel und keine neue Abhängigkeit.
- Kein WP05-Worker, Scheduler, Queueverhalten oder Offscreen-Rendering.
- Keine Perzentile, Confidence Intervals, Cold-/Warm-Prozessmatrix, CDP-Hardware,
  GPU-Timestamps, Memory- oder Leakmessung.
- Kein window.TestBridge, kein globaler Mutationseingang, kein allgemeiner RPC und
  kein HUD-Scraping.
- Keine API-Abwesenheit als Dauer oder Count 0 darstellen.
- Keine Rohzeitwerte runden.

PFLICHTUMFANG
1. Implementiere die TypeScript-Verträge und Runtimevalidator für Realm,
   NormalizedTimestamp, OperationContext, Span Start/End, Duration, Counter, Gauge,
   LongTask, EventTiming, Frame, Capability, Invalidation, RunBuffer und ExportV1.
2. Zentralisiere alle Marker im Clock-Adapter:
   absoluteMonotonicMs = performance.timeOrigin + performance.now().
   Rejecte negative, NaN- und Infinity-Werte. Implementiere Realm-Registrierung,
   Worker-Handshake-Drafts, Monotonieprüfung, 4-ms-Cross-Realm-Klassifikation und
   out-of-order Spanmatching.
3. Implementiere run-lokale monotone IDs und immutable OperationContext-Registry.
   Korrelieren müssen operationId, parentOperationId, authorityEpoch, worldRevision,
   requestId, Chunk, Meshermodus, Worker-Generation, Attempt und Renderadoption.
4. Implementiere bounded append-only segments mit 256 Records je Segment,
   65.536 Datenrecords, 16 MiB Data-Charge, separater Control Reserve,
   höchstens 17 MiB kanonischem Export, 4.096 Open-Spans, explizitem Overflow
   und niemals Ringüberschreibung.
5. Serialisiere niemals im Messfenster. Seal zuerst, drain/disconnect Observer,
   serialisiere erst in einer späteren Task nach explizitem Exportklick.
6. Implementiere drei Modi:
   telemetry-disabled, telemetry-enabled-minimal, telemetry-enabled-full.
   Ordinary Production muss Collector und Exportcode statisch tree-shaken haben.
7. Installiere Full-Observer vor Szenarioarbeit. Prüfe supportedEntryTypes getrennt
   für longtask und event; verwende separate Observer; erfasse droppedEntriesCount.
   Exportiere keine Eventtargets, Selektoren, Texte, Keys, Pointerdaten, URLs,
   Containerdaten, Stacktraces oder freie Fehlermeldungen.
8. Instrumentiere den heutigen Pfad in main.ts und ThreeVoxelRenderer an den im
   Bericht genannten Grenzen: Fixture, Halo, reine Mesher-CPU, Edge-Produkte,
   Rendereradoption, rAF, Main-Frame-Work, Draw-Submit-CPU, Visibility, Focus und
   den ersten Revision-Submit, sobald der akzeptierte Stand eine echte Revision
   führt. Bis dahin bleiben Revisionsfelder null. HUD bleibt rein diagnostisch und
   ist keine Datenquelle.
9. Lege nur die WP05-kompatiblen Telemetrie-Drafts und Contextgrenzen an. Erzeuge
   keinen Worker und keine Queue.
10. Implementiere den build-gated, expliziten Einmal-JSON-Download nach Seal.
    Der Export muss kanonisch und byte-deterministisch sein und darf keine globale
    mutierende Oberfläche bereitstellen.

DATEISCOPE
Wähle kleine Module unter src/diagnostics/telemetry/ oder einem gleichwertig engen
Pfad, zum Beispiel contracts.ts, clock.ts, ids.ts, buffer.ts, browserCollectors.ts,
sink.ts und exportController.ts. Integriere nur die erforderlichen Call-Sites.
Erweitere Unit- und E2E-Vertragstests. Ändere Mesheralgorithmen, Golden-Geometrie,
Voxelzustand und visuelle Darstellung nicht.

TEST- UND REVIEWPFLICHT
- Implementiere alle 66 Fälle aus Abschnitt 18 mindestens äquivalent.
- Führe die laut AGENTS.md relevanten Build-, Unit-, Browser-E2E- und
  Screenshotchecks aus.
- Beweise zusätzlich per Buildtest, dass ordinary Production die Collectorstrings
  nicht enthält und der Benchmark-Build route-gated bleibt.
- Ein Test darf keine echte Millisekundengrenze als flakige Annahme verwenden.
  Nutze Fake-Clocks für Clock- und Bufferlogik.
- Führe keinen Performancebenchmark aus und leite aus Testlaufzeiten keine
  Performanceaussage ab.

STOP-REGELN
- Wenn akzeptierter BR-01-Vertrag und dieser Bericht semantisch kollidieren, nicht
  improvisieren. Dokumentiere den Konflikt und fordere Review an.
- Wenn die Byte-Charge keine nachweisbare JSON-Obergrenze ist, stoppe und korrigiere
  den Contracttest vor Integration.
- Wenn Export nur über einen globalen Hook oder Voxelmutation erreichbar wäre,
  stoppe und verwende den Einmal-Download-Vertrag.
- Wenn ein Browserentry nicht sicher klassifizierbar ist, speichere Capability oder
  Invalidation, niemals einen erfundenen Nullwert.

ABSCHLUSS
Committe und pushe den Work-Package-Branch gemäß AGENTS.md, merge nicht. Berichte:
- exakten Basis-SHA und finalen Commit-SHA,
- geänderte Dateien,
- ausgeführte Befehle und deren Ergebnisse,
- erfüllte Vertragsfälle,
- verbleibende Unsupported-Capabilities und offene Risiken,
- Bestätigung, dass kein Benchmark und kein WP05-Worker implementiert wurde.
Stoppe danach.
```
