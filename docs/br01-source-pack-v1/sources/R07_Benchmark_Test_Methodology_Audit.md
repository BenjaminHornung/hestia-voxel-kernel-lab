# Abschlussbericht: Benchmark-, Profiling- und Testmethodik-Audit

Stand: 2026-08-12  
Audit-Objekt: `BenjaminHornung/hestia-voxel-kernel-lab`  
Exakt geprüfter Commit: [`d95992df05952ac4be6221ca1809c1c9e3c0ac9d`](https://github.com/BenjaminHornung/hestia-voxel-kernel-lab/commit/d95992df05952ac4be6221ca1809c1c9e3c0ac9d)  
Auftrag: Research-Agent 07, Benchmark-, Profiling- und Testmethodik-Audit  
Ausführung: statische Read-only-Analyse. Es wurden keine lokalen Tests, Benchmarks oder Browsermessungen ausgeführt.

## 1. Ergebnis in einem Satz

Der Snapshot besitzt bereits eine gute, deterministische Korrektheitsbasis für Visible-Face- und Greedy-Meshing, aber seine Laufzeitwerte sind ausschließlich Startup-Diagnostik und reichen weder für Performance-Gates noch für einen späteren Backendentscheid aus. Vor WP05, WP08, WP09 und WP12 wird deshalb ein separater Benchmarkpfad mit Rohsamples, kontrolliertem Warm-up, wiederholten und gegenbalancierten Läufen, Hardwareprovenienz, Long-Task-, Liveness-, Memory- und GPU-Messung benötigt.

## 2. Scope, Evidenz und Kennzeichnung

### 2.1 Geprüfter Umfang

Die Analyse bezieht sich ausschließlich auf den GitHub-Baum des oben genannten Commits. Maßgeblich waren insbesondere:

- [`src/main.ts`](https://github.com/BenjaminHornung/hestia-voxel-kernel-lab/blob/d95992df05952ac4be6221ca1809c1c9e3c0ac9d/src/main.ts)
- [`src/diagnostics/telemetry.ts`](https://github.com/BenjaminHornung/hestia-voxel-kernel-lab/blob/d95992df05952ac4be6221ca1809c1c9e3c0ac9d/src/diagnostics/telemetry.ts)
- [`src/render-three/threeVoxelRenderer.ts`](https://github.com/BenjaminHornung/hestia-voxel-kernel-lab/blob/d95992df05952ac4be6221ca1809c1c9e3c0ac9d/src/render-three/threeVoxelRenderer.ts)
- [`tests/helpers/meshCoverageOracle.ts`](https://github.com/BenjaminHornung/hestia-voxel-kernel-lab/blob/d95992df05952ac4be6221ca1809c1c9e3c0ac9d/tests/helpers/meshCoverageOracle.ts)
- [`tests/unit/greedy-mesher.test.ts`](https://github.com/BenjaminHornung/hestia-voxel-kernel-lab/blob/d95992df05952ac4be6221ca1809c1c9e3c0ac9d/tests/unit/greedy-mesher.test.ts)
- [`tests/e2e/greedy-comparison.spec.ts`](https://github.com/BenjaminHornung/hestia-voxel-kernel-lab/blob/d95992df05952ac4be6221ca1809c1c9e3c0ac9d/tests/e2e/greedy-comparison.spec.ts)
- [`evidence/wp03/manifest.json`](https://github.com/BenjaminHornung/hestia-voxel-kernel-lab/blob/d95992df05952ac4be6221ca1809c1c9e3c0ac9d/evidence/wp03/manifest.json)
- [`playwright.config.ts`](https://github.com/BenjaminHornung/hestia-voxel-kernel-lab/blob/d95992df05952ac4be6221ca1809c1c9e3c0ac9d/playwright.config.ts)
- [`package.json`](https://github.com/BenjaminHornung/hestia-voxel-kernel-lab/blob/d95992df05952ac4be6221ca1809c1c9e3c0ac9d/package.json) und [`package-lock.json`](https://github.com/BenjaminHornung/hestia-voxel-kernel-lab/blob/d95992df05952ac4be6221ca1809c1c9e3c0ac9d/package-lock.json)

Im Commit-Baum ist kein CI-Workflow und keine Repository-Lizenzdatei vorhanden. Das ist nur eine Aussage über diesen Snapshot, nicht über externe Systeme oder spätere Commits.

### 2.2 Bedeutung der Markierungen

- **Fakt**: direkt aus dem Snapshot oder einer verlinkten Primärquelle belegbar.
- **Schlussfolgerung**: technische Bewertung aus den Fakten.
- **Offen**: muss durch spätere Messung, Zielhardware oder Produktentscheidung geklärt werden.

## 3. Priorisierte Findings

### P0: Blocker für Performanceaussagen und Technologieentscheidungen

#### P0-1: Die aktuellen Meshing-Zeiten sind keine Benchmarkstichprobe

**Fakt:** WP03 erzeugt Halos einmal, mesht danach immer zuerst Visible Faces und anschließend Greedy. Die 51 Chunk-Dauern werden innerhalb desselben Startups mit `performance.now()` erfasst und sofort zu Total, p50 und p95 zusammengefasst. Es gibt keine wiederholten Runs, keine Gegenbalancierung und keine Prozessisolation. Siehe [`src/main.ts` Zeilen 156 bis 196](https://github.com/BenjaminHornung/hestia-voxel-kernel-lab/blob/d95992df05952ac4be6221ca1809c1c9e3c0ac9d/src/main.ts#L156-L196).

**Fakt:** Das Manifest nennt die Werte selbst korrekt `diagnostic only` und `not a benchmark gate`. Siehe [`manifest.json` Zeilen 86 bis 95 und 174 bis 178](https://github.com/BenjaminHornung/hestia-voxel-kernel-lab/blob/d95992df05952ac4be6221ca1809c1c9e3c0ac9d/evidence/wp03/manifest.json#L86-L95).

**Schlussfolgerung:** Aussagen wie „Greedy ist etwa fünfmal langsamer“, „Visible ist schneller“ oder „Backend A gewinnt“ wären unzulässig. Die Chunk-Samples sind heterogene Arbeitsobjekte innerhalb eines einzigen Durchlaufs, keine unabhängigen Wiederholungen desselben Experiments. Zusätzlich trägt Visible systematisch Startup-, JIT- und Cacheeffekte, während Greedy immer als zweites läuft.

#### P0-2: Der aktuelle Messpfad kann WP05- und WP08-Liveness nicht beweisen

**Fakt:** Der Snapshot hat noch keinen Worker- oder Schedulerpfad. Er erfasst weder Queue-Wartezeit, Transport, Adoption, Stale-Result-Verwerfung noch Input-to-visible-Latenz.

**Schlussfolgerung:** WP05 und WP08 dürfen nicht mit den bestehenden HUD-Werten abgenommen werden. Ein korrektes Endergebnis allein beweist nicht, dass der Main Thread responsiv bleibt, die Worker-Queue leert oder stets die neueste Revision sichtbar wird.

### P1: Hohe methodische Risiken

#### P1-1: Sehr gute A/B-Coverage, aber noch keine vollständig unabhängige Voxel-Oracle

**Fakt:** Die Coverage-Oracle validiert unter anderem Arraylängen, Index-Topologie, achsparallele Einheitsnormalen, ganzzahlige Grenzen, Rechteckgeometrie, Winding, Materialkonsistenz und doppelte Unit Faces. Danach bildet sie einen materialbewussten SHA-256-Hash. Siehe [`meshCoverageOracle.ts`](https://github.com/BenjaminHornung/hestia-voxel-kernel-lab/blob/d95992df05952ac4be6221ca1809c1c9e3c0ac9d/tests/helpers/meshCoverageOracle.ts).

**Fakt:** Die Greedy-Tests vergleichen die Coverage mit Visible Faces, prüfen alle 51 Golden-World-Chunks, neun Zonen, sechs Nachbarrichtungen, deterministische Byteausgabe und fehlerhafte Halos. Siehe [`greedy-mesher.test.ts` Zeilen 45 bis 164](https://github.com/BenjaminHornung/hestia-voxel-kernel-lab/blob/d95992df05952ac4be6221ca1809c1c9e3c0ac9d/tests/unit/greedy-mesher.test.ts#L45-L164).

**Schlussfolgerung:** Das ist ein starker Vergleich zweier Implementierungen. Ein gemeinsamer Fehler kann aber bestehen bleiben, wenn die erwartete Coverage überwiegend aus der Visible-Ausgabe abgeleitet wird. Zusätzlich ist eine direkte, langsame Referenz-Oracle erforderlich, die exponierte materialbewusste Einheitsflächen unmittelbar aus Voxelbelegung plus Halo berechnet.

#### P1-2: Das HUD misst rAF-Abstände, nicht Main-Thread-App-Work oder GPU-Zeit

**Fakt:** Pro Frame wird nur die Differenz zweier `requestAnimationFrame`-Zeitstempel aufgezeichnet. Danach folgen Controls-Update und `renderer.render`. Siehe [`threeVoxelRenderer.ts` Zeilen 564 bis 579](https://github.com/BenjaminHornung/hestia-voxel-kernel-lab/blob/d95992df05952ac4be6221ca1809c1c9e3c0ac9d/src/render-three/threeVoxelRenderer.ts#L564-L579).

**Schlussfolgerung:** Der Wert ist ein Präsentations- beziehungsweise Scheduling-Intervall. Bei VSync liegt er typischerweise nahe der Displayperiode. Er trennt weder JavaScript, Layout, Draw-Submission noch asynchrones GPU-Work. Er darf nicht als „Frame render time“ bezeichnet oder als CPU/GPU-Leistungswert verwendet werden.

#### P1-3: Hardware-, Browser- und Energieprovenienz fehlen

**Fakt:** Playwright fixiert Chrome-Channel, 1920 x 1080 und DPR 1, aber nicht Browser-Build, Betriebssystem, CPU, GPU, Treiber, Headed/Headless als explizites Vertragsfeld, Display-Refresh, VSync, Energieprofil, Temperaturzustand oder Hintergrundtabs. Siehe [`playwright.config.ts`](https://github.com/BenjaminHornung/hestia-voxel-kernel-lab/blob/d95992df05952ac4be6221ca1809c1c9e3c0ac9d/playwright.config.ts).

**Schlussfolgerung:** Die committed Zeiten sind nicht reproduzierbar einem Performance-Messfeld zuordenbar.

#### P1-4: Kein Memory- oder Navigation-Leaknachweis

**Fakt:** Die Memory-Tests summieren TypedArray-ByteLengths korrekt und halten theoretische Kapazität, exakte Payloads und Schätzwerte auseinander. Siehe [`memory.test.ts`](https://github.com/BenjaminHornung/hestia-voxel-kernel-lab/blob/d95992df05952ac4be6221ca1809c1c9e3c0ac9d/tests/unit/memory.test.ts).

**Fakt:** Der Renderer räumt Geometrien, Materialien, Controls und den WebGL-Kontext in `dispose()` auf. Siehe [`threeVoxelRenderer.ts` Zeilen 582 bis 612](https://github.com/BenjaminHornung/hestia-voxel-kernel-lab/blob/d95992df05952ac4be6221ca1809c1c9e3c0ac9d/src/render-three/threeVoxelRenderer.ts#L582-L612).

**Schlussfolgerung:** Korrekte Dispose-Aufrufe sind kein Leaktest. Es fehlen wiederholte Navigation, Heap- und DOM-Verläufe, Worker-Lebenszyklen, GPU-Ressourcenzähler und ein Plateau- beziehungsweise Slope-Gate.

#### P1-5: Evidence-Provenienz ist mehrdeutig

**Fakt:** Das WP03-Manifest enthält `basisSha` des akzeptierten Vorgängerstands, nicht einen eindeutigen `sourceTreeSha` des Codes, mit dem die Screenshots und Diagnostik erzeugt wurden. Siehe [`manifest.json` Zeilen 1 bis 8](https://github.com/BenjaminHornung/hestia-voxel-kernel-lab/blob/d95992df05952ac4be6221ca1809c1c9e3c0ac9d/evidence/wp03/manifest.json#L1-L8).

**Schlussfolgerung:** `basisSha` ist als Integrationsbasis plausibel, aber kein vollständiger Herkunftsnachweis. Ein Manifest in einem Commit kann seine eigene finale Commit-SHA oder seinen eigenen Digest nicht ohne Zirkularität intern authentifizieren. Dafür braucht es ein externes Bundle-Digest beziehungsweise eine CI-Attestation.

### P2: Mittlere Risiken und Qualitätslücken

#### P2-1: Globale Bilddifferenz kann lokale harte Fehler verschlucken

**Fakt:** `imageDifference` berechnet den globalen mittleren absoluten RGB-Fehler über alle Canvas-Pixel. Siehe [`tests/e2e/support.ts` Zeilen 30 bis 55](https://github.com/BenjaminHornung/hestia-voxel-kernel-lab/blob/d95992df05952ac4be6221ca1809c1c9e3c0ac9d/tests/e2e/support.ts#L30-L55). WP03 akzeptiert unter anderem einen globalen Wert kleiner 0,01. Siehe [`greedy-comparison.spec.ts` Zeilen 82 bis 102](https://github.com/BenjaminHornung/hestia-voxel-kernel-lab/blob/d95992df05952ac4be6221ca1809c1c9e3c0ac9d/tests/e2e/greedy-comparison.spec.ts#L82-L102).

**Schlussfolgerung:** Ein kleiner lokaler Chunk-Riss, ein fehlendes Objekt oder falsche Kanten können im großen Hintergrund untergehen. Exakte Screenshot-SHA-256-Werte beweisen Dateiintegrität, nicht visuelle Korrektheit.

#### P2-2: p95 ist mathematisch korrekt, aber semantisch schwach

**Fakt:** `summarizeDurations` verwendet nearest-rank p50 und p95. Die Implementierung ist für eine gegebene Stichprobe korrekt. Siehe [`telemetry.ts` Zeilen 13 bis 26](https://github.com/BenjaminHornung/hestia-voxel-kernel-lab/blob/d95992df05952ac4be6221ca1809c1c9e3c0ac9d/src/diagnostics/telemetry.ts#L13-L26).

**Schlussfolgerung:** Bei 51 unterschiedlich komplexen Chunks beschreibt p95 die obere Chunk-Komplexität dieses einen Starts. Es ist kein p95 wiederholter World-Mesh-Runs. p99 wäre mit 51 Werten nahezu ein Maximum und ohne viele weitere Events nicht stabil interpretierbar.

#### P2-3: Rohsamples und Messpräzision gehen verloren

**Fakt:** Das Manifest speichert nur Total, p50 und p95. Die E2E-Erfassung liest gerundete HUD-Strings. Rohdauer, Chunk-Key, Arbeitsmenge, Reihenfolge und Warm-up-Status fehlen.

**Schlussfolgerung:** Spätere Reaggregation, Audit, robuste Konfidenzintervalle oder eine Korrektur der Statistik sind nicht möglich.

#### P2-4: Golden-Änderungen besitzen noch keinen Governance-Vertrag

**Fakt:** WP02 und WP03 haben feste Golden-Contracts mit World-, Coverage-, Geometrie- und Bytewerten. Siehe [`wp02FixtureGolden.ts`](https://github.com/BenjaminHornung/hestia-voxel-kernel-lab/blob/d95992df05952ac4be6221ca1809c1c9e3c0ac9d/tests/contracts/wp02FixtureGolden.ts) und [`wp03GreedyGolden.ts`](https://github.com/BenjaminHornung/hestia-voxel-kernel-lab/blob/d95992df05952ac4be6221ca1809c1c9e3c0ac9d/tests/contracts/wp03GreedyGolden.ts).

**Schlussfolgerung:** Die technische Sperre ist gut, aber ein Agent könnte Test und Golden gemeinsam aktualisieren. Jede absichtliche Änderung braucht Contract-Version, Begründung, Diff der semantischen Kennzahlen und unabhängige Freigabe.

### P3: Dokumentation und Wartbarkeit

- `frameMs` sollte künftig `rafIntervalMs` heißen.
- `fixtureBuildMs` umfasst den gesamten Fixture-Aufbau und darf nicht als reine Generatorzeit interpretiert werden.
- `drawCalls` ist ein korrekter Renderer-Zähler des letzten Frames, aber keine Dauer- oder Durchsatzmetrik.
- Das öffentliche Repository besitzt an diesem Commit keine sichtbare Lizenzdatei. Für fremde Nutzung gilt daher keine dokumentierte Open-Source-Erlaubnis. Für dieses Audit wurde kein Code übernommen.

## 4. Was der aktuelle Stand gut beweist

| Bereich | Bewertung | Beleg |
| --- | --- | --- |
| Deterministische Golden-Welt | Stark | Fixture-ID, Version, Seed, World-Hash, Zone-Hashes, Chunk- und Voxelzahlen sind festgeschrieben. |
| Visible-/Greedy-Coverage | Stark | Materialbewusste Unit-Face-Mengen und SHA-256-Hash stimmen global, pro Chunk und pro Zone überein. |
| Chunk-Seams | Stark | Sechs Nachbarrichtungen werden geprüft; interne Flächen werden unterdrückt. |
| Mesh-Invarianten | Stark | Topologie, Normalen, Winding, Material, Ganzzahligkeit, Rechtecke, Bounds und Duplikate werden validiert. |
| Determinismus | Gut | Wiederholtes Meshen desselben Halos ist byteidentisch; Chunkreihenfolge ändert Aggregate nicht. |
| Negative Inputs | Gut | Ungültige Route, Halo-Key, Koordinaten, Halolänge und Materialwerte scheitern geschlossen. |
| Browserintegration | Gut | Production Preview, exakte HUD-Contracts, Toggles, Navigation und Fehlerkanäle werden geprüft. |
| Bildbelege | Mittel | Dimensionen und Dateihashes sind gebunden; die semantische Pixelprüfung ist noch zu grob. |
| Performance | Nur Diagnostik | Ein Startup, feste Reihenfolge, keine Rohsamples, keine Umgebungsmatrix, keine CIs. |
| Memory/Leaks | Unbewiesen | Exakte bekannte TypedArrays, aber kein Heap-, DOM-, Worker- oder Navigationsverlauf. |
| GPU-Leistung | Unbewiesen | Keine GPU-Timestamps; GPU-Memory wird ehrlich als unbekannt ausgewiesen. |

## 5. Zulässige und unzulässige Aussagen

### Zulässig

- „Auf der versionierten WP02-Golden-Welt erzeugen Visible und Greedy dieselbe materialbewusste Unit-Face-Coverage.“
- „Greedy reduziert auf diesem Contract die Quad-, Triangle- und neutralen Mesh-TypedArray-Zahlen exakt um die dokumentierten Werte.“
- „Die committed Laufzeitwerte sind rollende beziehungsweise Startup-Diagnostik und keine Benchmark-Gates.“
- „Das aktuelle HUD zeigt rAF-Intervalle, nicht isolierte App- oder GPU-Dauer.“

### Unzulässig

- „Greedy ist 5,0-mal langsamer als Visible.“
- „19.073 Quads liefern X FPS auf Zielhardware.“
- „WP03 benötigt 187,1 ms auf Chrome.“
- „64³-Chunks sind schneller oder speichereffizienter als 32³-Chunks.“
- „Three/WebGL2 ist schneller oder langsamer als Raw WebGPU.“
- „Die Seite ist leakfrei.“
- „p95 ist 8,3 ms“ ohne Zusatz „über 51 heterogene Chunk-Samples in einem einzelnen Startup-Durchlauf“.

## 6. Benchmark Protocol v1

### 6.1 Grundregeln

1. Korrektheit ist ein vorgelagerter Hard Gate. Performancewerte eines inkorrekten Kandidaten werden nicht verglichen.
2. Jede Messzelle bindet exakt Repository-SHA, Build-Hash, Fixture- und Scenario-Version, Browser-Build, Flags, OS, CPU, GPU, Treiber, Auflösung, DPR, Refresh-Rate und Energiezustand.
3. Rohsamples werden vor Aggregation unverändert gespeichert. Das HUD ist keine Datenquelle.
4. Cold, Warm-up, Measurement, Stress und Trace sind getrennte Phasen und getrennte Dateien.
5. Profiling mit Trace, DevTools, Heap Snapshot oder CPU-Profiler läuft niemals im selben Durchlauf wie ein Performance-Gate.
6. Es werden keine gültigen Ausreißer entfernt. Nur vorab definierte Umgebungsfehler dürfen einen kompletten Run invalidieren.
7. A/B-Reihenfolge wird mit gespeichertem Seed gegenbalanciert. Mindestens `ABBA` beziehungsweise `BAAB`; bei mehr Kandidaten ein Latin-Square-Plan.
8. Ein fehlgeschlagener Gate-Run wird nicht so oft wiederholt, bis er zufällig besteht. Wiederholung ist nur mit dokumentiertem Infrastrukturgrund zulässig.

### 6.2 Szenarien

Jedes Szenario erhält unveränderliche `scenarioId` und `scenarioVersion`.

| Szenario | Inhalt | Primäre Outputs |
| --- | --- | --- |
| `mesh-golden-world-v1` | Alle 51 WP02-Chunks, identische Halos | World-Dauer, Chunk-Dauern, Quads, Bytes, Coverage-Hash |
| `mesh-density-sweep-v1` | 0, 1, 10, 50, 90, 100 Prozent plus Checkerboard | Dauer nach Dichte und Oberflächenkomplexität |
| `scheduler-steady-v1` | Gleichmäßige editinduzierte Remesh-Aufträge | Queue, Worker, Adoption, Long Tasks |
| `scheduler-burst-v1` | Deterministischer Burst mit Überlast | Drain-Zeit, Drops, Stale Results, Liveness |
| `brush-stress-v1` | Reproduzierbare Brush-Sequenz | Input-to-visible, Latest-Revision, Welt-Hash |
| `navigation-leak-v1` | Zyklisch WP01, WP02, WP03 Visible, WP03 Greedy, blank | Heap-, DOM-, Worker- und GPU-Ressourcen-Slope |
| `backend-fixture-v1` | Semantisch identische WebGL-/WebGPU-Welt | CPU submit, GPU time, rAF pacing, Memory, Bildcontract |

### 6.3 Messphasen und Warm-up

#### Cold

- Neuer Browserprozess und frisches temporäres Profil pro Sample.
- Produktionsbuild bereits lokal verfügbar; Netzwerk bleibt localhost und wird separat von App-Startup ausgewiesen.
- Keine Vorabnavigation, kein Shader-Prefetch und kein verdeckter Fixture-Aufbau.
- Mindestens zehn gültige Prozessstarts pro Messzelle.
- „Cold“ bedeutet Browser-/App-Cold innerhalb dieses Vertrags. Ohne OS-Neustart oder kontrolliertes Cache-Flushing darf nicht „cold disk“ behauptet werden.

#### Warm-up

- Mindestens zehn nicht gemessene vollständige Szenarioiterationen.
- Danach gleitende Stabilitätsprüfung: Median der letzten fünf Iterationen gegen die vorherigen fünf. Relative Abweichung maximal fünf Prozent in zwei aufeinanderfolgenden Fenstern.
- Maximal 50 Warm-up-Iterationen. Wird Stabilität nicht erreicht, ist die Messzelle ungültig und nicht langsamer oder schneller zu klassifizieren.
- Visible und Greedy erhalten symmetrischen Warm-up. Shader- und Pipeline-Warm-up wird pro Backend separat protokolliert.

#### Warm Measurement

- Mindestens 30 gültige Run-Iterationen pro Messzelle und Implementierung.
- Jede World-Iteration speichert sowohl World-Total als auch 51 einzeln identifizierte Chunk-Operationen.
- Reihenfolge der Implementierungen und Szenarien ist gegenbalanciert. Innerhalb der Golden-Welt bleibt die Chunkreihenfolge deterministisch oder wird als eigene experimentelle Variable behandelt.
- Für p99 eines Eventtyps werden mindestens 1.000 gültige Events verlangt. Darunter werden p50, p95, Maximum und `p99: insufficient-samples` ausgegeben.

#### Stress

- Feste Dauer, standardmäßig 60 Sekunden pro Run.
- Gleiche deterministische Editfolge und identischer Input-Seed für alle Kandidaten.
- Keine Screenshot-, Trace- oder Heap-Snapshot-Erzeugung im zeitkritischen Fenster.

#### Trace/Diagnose

- Separater, nicht gatefähiger Run mit Chrome Tracing, Heap Snapshot oder Profiler.
- Gleiche Szenario-ID, aber `phase: trace` und `measurementEligible: false`.

### 6.4 Startup-Phasen

Startup muss in nicht überlappende oder ausdrücklich überlappende Spans zerlegt werden:

1. Navigation und Resource Load
2. Modulparse und Modulevaluation
3. Fixture-Generierung
4. Chunk-/Halo-Aufbau
5. Meshing
6. Renderer-Adoption und BufferGeometry-Erzeugung
7. Shader-/Pipeline-Erstellung
8. Erster Draw Submit
9. Erstes App-Ready
10. Erstes sichtbares Revisions-Commit als Browsernäherung

Warm-up darf Startupwerte nicht nachträglich „bereinigen“. Cold Startup und warmes steady state sind getrennte Produkte.

## 7. Timing- und Metrikdefinitionen

### 7.1 Main Thread und rAF

| Metrik | Definition | Nicht gleichbedeutend mit |
| --- | --- | --- |
| `rafIntervalMs` | Abstand zweier rAF-Callbacks | App-Dauer, GPU-Dauer, physische Displaylatenz |
| `mainFrameWorkMs` | Instrumentierte Main-Thread-App-Spans innerhalb eines Frames | Vollständige Browserarbeit |
| `drawSubmitCpuMs` | CPU-Zeit um Renderer-Aufruf beziehungsweise Command-Encoding | GPU-Ausführungszeit |
| `longTaskMs` | `PerformanceLongTaskTiming.duration` ab 50 ms | Jede einzelne App-Funktion |
| `inputDelayMs` | Event Timing `processingStart - startTime` | Eventhandlerdauer |
| `eventProcessingMs` | `processingEnd - processingStart` | Asynchrones Meshing |
| `inputToNextPaintMs` | Event Timing `duration` | Exakte Photon-on-screen-Latenz |
| `inputToRevisionSubmitMs` | Input bis Draw Submit der gewünschten Weltrevision | Bestätigte Darstellung |
| `inputToConfirmedPixelMs` | Separater Probe-Run bis Pixel-/Revisionsbestätigung | Unbeeinflusste Produktlatenz |

Die [Event Timing API](https://www.w3.org/TR/event-timing/) liefert Input Delay, Processing und eine gerundete Näherung bis zum nächsten Rendering-Update. Sie schließt kontinuierliche Events wie `pointermove` und `wheel` nicht vollständig ein. Deshalb benötigt das Spiel zusätzlich eigene korrelierte Spans für DDA, Brush und Revisionen. Long Tasks werden über die [Long Tasks API](https://www.w3.org/TR/longtasks-1/) erfasst; der spezifizierte Schwellwert beträgt 50 ms.

### 7.2 Worker-, Transfer-, Meshing- und Adoption-Phasen

Jede editinduzierte Operation erhält `operationId` und monotone `worldRevision`.

1. `mainEnqueue`: Auftrag wird auf dem Main Thread erzeugt.
2. `workerReceive`: Worker beginnt den Auftrag.
3. `workerQueueWaitMs`: normalisierte Differenz zwischen beiden Markern.
4. `haloBuildMs`: Halo-Snapshot im verantwortlichen Realm.
5. `meshCpuMs`: reine Mesherfunktion.
6. `workerSerializeMs`: Erzeugung der Transferprodukte.
7. `workerPost`: Worker sendet.
8. `mainReceive`: Main Thread empfängt.
9. `returnTransportAndMainWaitMs`: `mainReceive - workerPost`. Der Name macht sichtbar, dass Transport und blockierter Main Thread nicht sauber getrennt sind.
10. `adoptionCpuMs`: Validierung, Stale-Check, Geometrie-/Buffer-Adoption.
11. `drawSubmitRevision`: erste Draw-Submission mit dieser Revision.
12. `visibleRevision`: erster nachfolgender Rendering-Marker beziehungsweise separater Pixel-Probe-Marker.

Window und Worker besitzen eigene Time Origins. Zur Korrelation werden `performance.timeOrigin + performance.now()` und Realm-ID gespeichert. Die [High Resolution Time Specification](https://www.w3.org/TR/hr-time-3/) beschreibt monotone Messung und Time-Origin-Normalisierung. Wandzeit wird nie für Dauern verwendet.

Zusätzlich zu Dauern werden Queue-Tiefe, Workeranzahl, Input-/Outputbytes, Transferable-Verwendung, Chunk-Key, Occupancy, Quadzahl, abgebrochene Revisionen, Stale Drops und Queue-Drain-Zeit gespeichert.

### 7.3 GPU-Timing und Grenzen

#### WebGL2

- CPU Submit und GPU Time sind getrennte Metriken.
- Wenn verfügbar, wird [`EXT_disjoint_timer_query_webgl2`](https://registry.khronos.org/webgl/extensions/EXT_disjoint_timer_query_webgl2/) verwendet.
- Query-Ergebnisse werden asynchron in späteren Frames abgeholt.
- Samples mit `GPU_DISJOINT_EXT = true`, Context Loss oder null Query Bits sind ungültig und werden mit Grund gespeichert.
- `gl.finish()` wird nicht im normalen Gate-Pfad verwendet, weil es die Pipeline absichtlich synchronisiert und das Verhalten verändert.
- Portable GPU-Memory-Bytes bleiben `unknown`. Three-Zähler und bekannte Uploadbytes werden getrennt als Approximation ausgewiesen.

#### WebGPU

- Der Adapter muss die optionale [`timestamp-query`](https://www.w3.org/TR/webgpu/#timestamp-query) Feature-Unterstützung melden.
- QuerySet, Resolve und Readback laufen außerhalb des gemessenen Command-Spans; Wartezeiten werden nicht als GPU-Dauer ausgegeben.
- Fehlt das Feature, lautet das Resultat `unsupported`, nicht null oder 0 ms.
- Werte werden nur innerhalb derselben Browser-/Adapter-/Treiberzelle verglichen.

#### Shader und Pipeline Compilation

- Cold Pipeline Creation, erste Draw-Compilation und warmes steady-state GPU-Work sind getrennte Szenarien.
- Ein Warm-up-Draw darf nie aus dem Cold-Startup-Gate verschwinden.
- Parallel-Compilation oder Browsercache werden als Capability und Zustand protokolliert.

## 8. Hardware- und Browser-Matrix

Die exakten Geräte werden vor Implementierung benannt. Folgende Profile definieren die Mindestmatrix:

| Profil | Zweck | Browsermodus | Displayvertrag | Gate-Rolle |
| --- | --- | --- | --- | --- |
| `CI-CORRECTNESS` | Unit, Property, E2E, Schema, deterministische Screenshots | Headless Chromium/Chrome; Software-GPU zulässig | 1920 x 1080, DPR 1 | Korrektheit, niemals finale Performance |
| `H1-DESKTOP-DGPU` | Entwickler- und High-End-Baseline | Chrome Stable headed, reale GPU | 1920 x 1080, DPR 1, fixer Refresh | Primäres Performance-Gate |
| `H2-MAINSTREAM-IGPU` | typisches Notebook/Minisystem | Chrome Stable headed, reale iGPU, Netzbetrieb | 1920 x 1080, DPR 1, 60 Hz | Primäres Performance-Gate |
| `H3-MINIMUM-TARGET` | später definierte Mindesthardware | Chrome Stable headed | kanonisch 1920 x 1080, optional Low-Resolution-Zusatz | Guardrail |
| `EDGE-COMPAT` | Chromium-Kompatibilität | Edge Stable headed | wie H2 | Funktionsgate, Performance informativ |
| `CHROME-BETA` | Früherkennung | Chrome Beta | wie H2 | informativ, kein Releaseblocker ohne Reproduktion in Stable |

Zusätzliche Pixelstress-Zelle: 2560 x 1440 bei DPR 1 oder 1920 x 1080 CSS-Pixel bei DPR 2. Diese Zelle wird nicht mit der kanonischen DPR-1-Zelle vermischt.

Pro Run verpflichtend:

- OS-Build, Kernel, CPU-Modell, physische/logische Kerne, RAM
- GPU Vendor/Device, Treiber, Graphics Backend, Feature Status
- Browserprodukt, vollständige Version, Channel, User Agent, Launch Command Line und Flags
- Headed/Headless, Fenstergröße, Viewport, DPR, Refresh-Rate, VSync-Vertrag
- Netz-/Akkubetrieb, Energieprofil, Batteriestand, Temperatur-/Throttlingindikator soweit verfügbar
- `document.visibilityState`, Fokus, Hintergrundtabs, konkurrierende Last

Chrome CDP [`SystemInfo.getInfo`](https://chromedevtools.github.io/devtools-protocol/tot/SystemInfo/#method-getInfo) liefert GPU-, Treiber- und Command-Line-Daten. Playwright weist selbst darauf hin, dass Screenshots von OS, Version, Hardware, Stromquelle und Headless-Modus abhängen; Baselines müssen daher in derselben Umgebung erzeugt werden: [Playwright Visual Comparisons](https://playwright.dev/docs/test-snapshots).

## 9. JSON-Schema für Rohsamples

Dateiformat: ein `run.json` pro Browserprozess und Szenario. Zeitkritische Spans werden direkt gesammelt und erst nach dem Messfenster serialisiert. Zahlen bleiben ungerundet.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://hestia.invalid/schemas/benchmark-run-v1.schema.json",
  "title": "Hestia Benchmark Raw Run v1",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "schemaVersion", "protocolVersion", "runId", "createdUtc",
    "source", "scenario", "environment", "execution", "samples"
  ],
  "properties": {
    "schemaVersion": { "const": 1 },
    "protocolVersion": { "const": "benchmark-protocol-v1" },
    "runId": { "type": "string", "pattern": "^[A-Za-z0-9._:-]{8,160}$" },
    "createdUtc": { "type": "string", "format": "date-time" },
    "source": {
      "type": "object",
      "additionalProperties": false,
      "required": ["repository", "commitSha", "buildSha256", "fixtureContract", "dirty"],
      "properties": {
        "repository": { "const": "BenjaminHornung/hestia-voxel-kernel-lab" },
        "commitSha": { "type": "string", "pattern": "^[0-9a-f]{40}$" },
        "buildSha256": { "type": "string", "pattern": "^[0-9a-f]{64}$" },
        "fixtureContract": { "type": "string", "minLength": 1 },
        "dirty": { "const": false }
      }
    },
    "scenario": {
      "type": "object",
      "additionalProperties": false,
      "required": ["id", "version", "seed", "backend", "mesher", "chunkEdge", "workerCount"],
      "properties": {
        "id": { "type": "string", "minLength": 1 },
        "version": { "type": "integer", "minimum": 1 },
        "seed": { "type": "integer", "minimum": 0, "maximum": 4294967295 },
        "backend": { "enum": ["three-webgl2", "raw-webgpu"] },
        "mesher": { "enum": ["visible", "greedy", "greedy-ao", "not-applicable"] },
        "chunkEdge": { "enum": [32, 64] },
        "workerCount": { "type": "integer", "minimum": 0, "maximum": 64 }
      }
    },
    "environment": {
      "type": "object",
      "additionalProperties": false,
      "required": ["hardwareProfile", "os", "cpu", "gpu", "browser", "display", "power"],
      "properties": {
        "hardwareProfile": { "type": "string" },
        "os": { "type": "object", "required": ["name", "version"], "properties": { "name": { "type": "string" }, "version": { "type": "string" } }, "additionalProperties": true },
        "cpu": { "type": "object", "required": ["model", "logicalCores"], "properties": { "model": { "type": "string" }, "logicalCores": { "type": "integer", "minimum": 1 } }, "additionalProperties": true },
        "gpu": { "type": "object", "required": ["device", "driver", "backend"], "properties": { "device": { "type": "string" }, "driver": { "type": "string" }, "backend": { "type": "string" } }, "additionalProperties": true },
        "browser": { "type": "object", "required": ["name", "version", "channel", "headless", "flags"], "properties": { "name": { "type": "string" }, "version": { "type": "string" }, "channel": { "type": "string" }, "headless": { "type": "boolean" }, "flags": { "type": "array", "items": { "type": "string" } } }, "additionalProperties": true },
        "display": { "type": "object", "required": ["cssWidth", "cssHeight", "dpr", "refreshHz"], "properties": { "cssWidth": { "type": "integer", "minimum": 1 }, "cssHeight": { "type": "integer", "minimum": 1 }, "dpr": { "type": "number", "exclusiveMinimum": 0 }, "refreshHz": { "type": "number", "exclusiveMinimum": 0 } }, "additionalProperties": false },
        "power": { "type": "object", "required": ["source", "profile"], "properties": { "source": { "enum": ["ac", "battery", "unknown"] }, "profile": { "type": "string" }, "batteryPercent": { "type": ["number", "null"], "minimum": 0, "maximum": 100 } }, "additionalProperties": true }
      }
    },
    "execution": {
      "type": "object",
      "additionalProperties": false,
      "required": ["phase", "processOrdinal", "iteration", "sequencePosition", "orderSeed", "visible", "focused", "backgroundTabs", "measurementEligible"],
      "properties": {
        "phase": { "enum": ["cold", "warmup", "measurement", "stress", "trace", "leak"] },
        "processOrdinal": { "type": "integer", "minimum": 0 },
        "iteration": { "type": "integer", "minimum": 0 },
        "sequencePosition": { "type": "integer", "minimum": 0 },
        "orderSeed": { "type": "integer", "minimum": 0, "maximum": 4294967295 },
        "visible": { "type": "boolean" },
        "focused": { "type": "boolean" },
        "backgroundTabs": { "type": "integer", "minimum": 0 },
        "measurementEligible": { "type": "boolean" },
        "invalidReason": { "type": ["string", "null"] }
      }
    },
    "samples": {
      "type": "array",
      "minItems": 1,
      "items": { "$ref": "#/$defs/sample" }
    }
  },
  "$defs": {
    "sample": {
      "type": "object",
      "additionalProperties": false,
      "required": ["sampleId", "kind", "name", "realm", "timeOriginMs", "startMs", "valid", "tags"],
      "properties": {
        "sampleId": { "type": "string", "minLength": 1 },
        "kind": { "enum": ["duration", "counter", "memory", "frame", "long-task", "gpu", "liveness"] },
        "name": { "type": "string", "minLength": 1 },
        "realm": { "enum": ["main", "worker", "gpu", "browser"] },
        "timeOriginMs": { "type": "number" },
        "startMs": { "type": "number", "minimum": 0 },
        "durationMs": { "type": "number", "minimum": 0 },
        "value": { "type": "number" },
        "unit": { "enum": ["ms", "bytes", "count", "ratio", "revision"] },
        "operationId": { "type": ["string", "null"] },
        "worldRevision": { "type": ["integer", "null"], "minimum": 0 },
        "chunkKey": { "type": ["string", "null"] },
        "valid": { "type": "boolean" },
        "invalidReason": { "type": ["string", "null"] },
        "tags": {
          "type": "object",
          "additionalProperties": { "type": ["string", "number", "boolean", "null"] }
        }
      },
      "allOf": [
        {
          "if": { "properties": { "kind": { "const": "duration" } } },
          "then": { "required": ["durationMs", "unit"] }
        },
        {
          "if": { "properties": { "kind": { "enum": ["counter", "memory", "liveness"] } } },
          "then": { "required": ["value", "unit"] }
        }
      ]
    }
  }
}
```

Hinweis: Die offenen `additionalProperties` innerhalb der Hardwareobjekte erlauben plattformspezifische Telemetrie. Das äußere Schema bleibt strikt. Vor Implementierung sollte das Schema als eigene versionierte Datei übernommen und mit positiven sowie negativen Fixtures getestet werden.

## 10. Aggregationsregeln

1. Schema validieren; ungültige Dateien nie still reparieren.
2. Nur identische `commitSha`, `buildSha256`, Scenario-Version, Hardwareprofil, Browser-Build, Displayvertrag und Phase gemeinsam aggregieren.
3. Warm-up-, Trace- und invalide Samples werden gespeichert, aber nicht in Gate-Aggregate aufgenommen.
4. Keine Ausreißerfilter, kein Winsorizing, kein Löschen des langsamsten Runs.
5. Pro Gruppe ausgeben: `nRuns`, `nSamples`, invalidierte Runs, p50, p95, p99 sofern zulässig, Maximum, Mittelwert nur ergänzend, 95-Prozent-Konfidenzintervalle.
6. Nearest-rank-Perzentile bleiben für Kompatibilität zulässig. Perzentile verschiedener Runs werden nicht gemittelt.
7. Konfidenzintervalle: hierarchischer Bootstrap mit 10.000 Resamples und gespeichertem Bootstrap-Seed. Erst Runs resamplen, dann Events innerhalb der Runs. Damit werden Eventcluster eines Browserprozesses nicht fälschlich als vollständig unabhängig behandelt.
8. A/B-Vergleich: gepaarter Bootstrap innerhalb derselben Order-Blöcke. Bericht als Differenz und Ratio mit 95-Prozent-CI.
9. Überlappende Worker-Phasen werden nicht blind addiert. End-to-End entspricht dem kritischen Pfad, Stage Summen sind nur bei nachgewiesener Nichtüberlappung zulässig.
10. p99 nur ab 1.000 gültigen Events des gleichen semantischen Typs. Bei kleineren Stichproben Maximum berichten und p99 verweigern.
11. Regression Gate für Latenzen: obere Grenze des gepaarten 95-Prozent-CI der Candidate/Baseline-Ratio höchstens 1,10, sofern ein WP-spezifisches Gate nicht strenger ist.
12. Durchsatz Gate: untere Grenze des Candidate/Baseline-Ratios mindestens 0,90.
13. Peak-Memory Gate: obere Grenze des Ratios höchstens 1,10, außer die Work-Package-Entscheidung genehmigt ausdrücklich einen dokumentierten Memory/Latency-Trade-off.
14. Statistikskript, Version, Hash, Eingabedateien und Aggregatdatei werden im Evidence-Bundle gebunden.

## 11. Gates für WP05, WP08, WP09 und WP12

Absolute Budgets sind hier vorläufige Engineering-Ziele. Vor ihrer ersten blockierenden Nutzung müssen sie auf H1 bis H3 mit einem akzeptierten Baseline-Commit kalibriert und versioniert werden. Korrektheits- und Provenienz-Gates gelten sofort.

### WP05: Worker und Scheduler

Hard Gates:

- Coverage-, Geometrie- und World-Hash-Parität zum synchronen Referenzpfad.
- Kein verlorener Auftrag, keine doppelte Adoption, keine Adoption einer veralteten Revision.
- Nach Ende eines Burst-Szenarios leert sich die Queue innerhalb von 2.000 ms.
- Kein Crash, Worker-Hang, Page Error, Context Loss oder unaufgelöster Promise.
- Main-Thread-Heartbeat bleibt lebendig; keine App-attributierte Long Task ab 50 ms in `scheduler-steady-v1`.
- Vorläufig H1/H2: Adoption p95 höchstens 4 ms, p99 höchstens 8 ms.
- Gepaarte Nichtregression gegen akzeptierte Baseline nach Abschnitt 10.

### WP08: Brush und Stress Edits

Hard Gates:

- Finale Weltrevision und deterministischer World-Hash entsprechen der seriellen Edit-Oracle.
- Alle absichtlich verworfenen Zwischenrevisionen sind protokolliert; die neueste Revision wird stets sichtbar.
- Vorläufig H1/H2: Input-to-revision-submit p95 höchstens 50 ms und p99 höchstens 100 ms.
- Vorläufig H1/H2: Input-to-next-paint beziehungsweise bestätigte Pixel-Probe p95 höchstens 100 ms und p99 höchstens 200 ms.
- Im 60-Sekunden-Stresslauf keine Long Task ab 100 ms und höchstens eine App-attributierte Long Task ab 50 ms.
- Keine monotone Queue-Zunahme; Drain-Zeit höchstens 2.000 ms.

Der allgemeine Web-INP-Wert von 200 ms gilt nur als äußere UX-Orientierung, nicht als hinreichendes Spielziel: [web.dev INP](https://web.dev/articles/inp).

### WP09: 32³ gegen 64³

Hard Gates:

- Identische World-, Edit-, Coverage- und Materialcontracts.
- Identische Zielauflösung in Weltmetern und identische Szenarioarbeit. Keine Reduktion der Editzahl oder Sichtweite für den größeren Chunk.
- Getrennte Ergebnisse für Full Remesh, kleine Editbox, Grenzedit, Brush, Transfer, Adoption, Peak Memory und GPU Upload.
- Kein Sieger aufgrund eines einzelnen Mittelwerts.

Entscheidungsregel:

- Ein Kandidat ist nur klar überlegen, wenn er bei mindestens einer vorab bestimmten Primärmetrik eine praktische Verbesserung von mindestens zehn Prozent zeigt, deren gepaartes 95-Prozent-CI die Gleichheit ausschließt, und zugleich kein Guardrail um mehr als zehn Prozent verschlechtert.
- Sind die Kandidaten auf der Pareto-Grenze, lautet das Ergebnis „workloadabhängig“ oder „unklar“, nicht erzwungen 32³ oder 64³.

### WP12: Technologieentscheidung Three/WebGL2 gegen Raw WebGPU

Hard Gates:

- Gleicher Voxel-, AO-, Material-, Kamera-, Edit- und Screenshotcontract.
- Gleiche aktive Qualitätsfeatures; kein Backend darf Debugkanten, AO oder Sichtweite deaktivieren, um schneller zu erscheinen.
- Korrektheit, Liveness, Memory und Visual Gates bestehen zuerst.
- Performance auf mindestens H1-DGPU und H2-IGPU mit realer GPU, Chrome Stable headed.
- CPU Submit, GPU Time, Input-to-visible, Long Tasks, Memory und Energieindikatoren getrennt.
- Sieger nur bei mindestens zehn Prozent praktisch relevanter Verbesserung mit gepaartem 95-Prozent-CI und ohne mehr als zehn Prozent Guardrail-Regression.
- Fehlen GPU-Timestamps in einer Zelle, bleibt GPU-Dauer dort `unsupported`; CPU- oder rAF-Werte dürfen sie nicht ersetzen.

## 12. Long-Task- und Liveness-Testplan

### 12.1 Instrumentierung

- `PerformanceObserver` für `longtask` mit `buffered: true` vor App-Code installieren.
- `PerformanceObserver` für `event` mit kleinem dokumentiertem `durationThreshold` für Click, Pointerdown/-up und Key-Interaktionen.
- Eigene Revision-Spans über `performance.mark/measure` oder gleichwertigen Telemetrie-Sink.
- Main- und Worker-Heartbeat nur außerhalb der zeitkritischen Microbenchmark-Schleife.
- CDP-Tracing nur in separatem Diagnose-Run. CDP kann Laufzeitmetriken über [`Performance.getMetrics`](https://chromedevtools.github.io/devtools-protocol/tot/Performance/#method-getMetrics) und System-/Prozessdaten über [`SystemInfo`](https://chromedevtools.github.io/devtools-protocol/tot/SystemInfo/) liefern.

### 12.2 Szenarien

1. Idle 60 Sekunden: beweist, dass Telemetrie selbst keine Last erzeugt.
2. Steady Single Edit: ein Edit alle 250 ms für 60 Sekunden.
3. Burst: 20 deterministische Edits in einem Burst alle zwei Sekunden.
4. Supersession: dieselben Chunks werden schneller editiert, als Meshing abschließt; nur die neueste Revision darf adoptiert werden.
5. Worker Failure: kontrollierter Worker-Abbruch außerhalb des Performancefensters; Scheduler muss fail-closed melden.
6. Navigation under load: Seite verlassen, während Aufträge laufen; keine spätere Adoption oder unhandled rejection.

### 12.3 Liveness-Gates

- Jede angenommene neueste Revision erreicht terminal `visible`, `failed` oder `cancelled` innerhalb der Szenariofrist.
- Keine Operation bleibt nach Queue-Drain offen.
- Queue-Tiefe kehrt nach Burst auf null zurück.
- Main Heartbeat hat keine Lücke ab 100 ms, sofern diese nicht durch eine erfasste und begründete Browser-/Systempause erklärt wird.
- Versteckter Tab invalidiert den Performance-Run, bleibt aber ein eigener Funktionsfall für korrektes Throttlingverhalten.

## 13. Leak- und Navigation-Stresstest

### 13.1 Ablauf

Pro Hardware-/Browserzelle drei unabhängige Browserprozesse:

1. 20 Stabilisierungscycles ohne Gateauswertung.
2. 100 Messcycles.
3. Cycle: WP01 laden, bereit; WP02 laden, bereit; WP03 Visible laden, bereit; WP03 Greedy laden, bereit; definierte Interaktion; `about:blank`; Quieszenz.
4. Alle fünf Cycles Snapshot von JS Heap, ArrayBuffer Backing Storage, DOM Documents/Nodes/Listeners, Prozessmemory und bekannten Renderer-/Worker-Ressourcen.
5. Heap Snapshot nur vor und nach dem gesamten Run, nie in jeder Performanceiteration.

CDP [`Runtime.getHeapUsage`](https://chromedevtools.github.io/devtools-protocol/tot/Runtime/#method-getHeapUsage) trennt Used Heap, Total Heap, Embedder Heap und Backing Storage. CDP [`Memory.getDOMCounters`](https://chromedevtools.github.io/devtools-protocol/tot/Memory/#method-getDOMCounters) liefert Documents, Nodes und Event Listener. `Memory.prepareForLeakDetection` verändert den Lauf durch Workerbeendigung, Cache-Drops und Garbage Collection und gehört deshalb nur in einen gesonderten Leak-Diagnosepfad.

### 13.2 Auswertung und Gates

- Rohverläufe und Plateauplots pro Metrik.
- Robuste Slope-Schätzung ab Cycle 21 und Bootstrap-CI über Prozesse.
- Hard Fail bei Browsercrash, OOM, WebGL Context Loss, wachsender Workerzahl nach `about:blank` oder nie freigegebenen App-Ressourcen.
- Leak-Verdacht, wenn die untere 95-Prozent-CI-Grenze des Slopes positiv ist und zugleich der Nettoanstieg über 100 Cycles mehr als fünf Prozent der stabilisierten Baseline oder mehr als 1 MiB beträgt.
- DOM Documents und aktive Worker müssen nach `about:blank` zum definierten Baselinekorridor zurückkehren. Browserinterne Caches werden nicht als App-Leak klassifiziert, solange sie plateauieren und der App nicht mehr zugeordnet sind.

## 14. Fuzz- und Property-Testplan für Visible, Greedy und AO

### 14.1 Unabhängige Referenz-Oracle

Die Referenz iteriert direkt über alle belegten Voxel und sechs Nachbarn. Ist der Nachbar Air, erzeugt sie einen kanonischen materialbewussten Unit-Face-Key aus Achse, Vorzeichen, Weltplane, U, V und Material. Diese Oracle importiert weder Visible- noch Greedy-Meshercode.

Jeder Mesher muss exakt dieselbe Key-Menge liefern. Damit wird Visible nicht länger alleinige Wahrheit für Greedy.

### 14.2 Generatoren

- Kleine Volumes 1³ bis 12³ für vollständige, langsame Oracle-Prüfung.
- Dichten 0, 1, 10, 50, 90 und 100 Prozent.
- Gleiche und wechselnde Materialien.
- Checkerboard, dünne Wände, Tunnel, Hohlkörper, einzelne Voxel, Vollblock, Treppen.
- Zwei bis acht Chunks mit Belegung genau an jeder der sechs Grenzen, Kanten und Ecken.
- Negative Chunkkoordinaten und Translationen.
- Deterministische Seeds; Fehler geben Seed, minimiertes Fixture und vollständige Bytes aus.

### 14.3 Properties

Für Visible und Greedy:

- Coverage exakt gleich Oracle.
- Keine doppelte Unit Face, keine interne Face.
- Quadzahl Greedy höchstens Visible.
- Trianglezahl exakt `2 * quads`.
- Achsparallele ganzzahlige Rechtecke, positive Fläche, korrektes Winding.
- Konsistente Normalen und Materialien je Quad.
- Byteidentität bei gleichem Input.
- Invarianz von Aggregate und Coverage gegen Chunkreihenfolge.
- Translation verändert nur Position, nicht lokale Topologie oder Counts.
- Rotation/Spiegelung permutiert Achsen und Normalen erwartungsgemäß.
- Halo- und Chunk-Seams ergeben dieselbe Weltcoverage wie ein monolithisches Referenzvolume.

Zusätzlich für AO ab WP04:

- AO-Werte liegen im versionierten diskreten Wertebereich.
- AO stimmt mit einer unabhängigen 3-Nachbar-Referenz je Vertex überein.
- Gemeinsame Weltvertexe an Chunk-Seams erhalten identische AO-Werte.
- Greedy merged nicht über Material-, Normalen- oder AO-Inkompatibilität.
- Diagonalwahl und Winding bleiben deterministisch.
- Deaktiviertes AO reproduziert den vorigen Geometry-Contract.

### 14.4 Umfang

- PR-Gate: mindestens 500 kleine generierte Fälle pro Mesher mit festem CI-Seed plus gespeicherter Regression-Corpus.
- Nightly: mindestens 10.000 kleine Fälle und 1.000 Multichunk-Fälle.
- Jeder gefundene Fehler wird als minimiertes, dauerhaftes Regression-Fixture aufgenommen.
- Ein Agent darf Seeds nicht so auswählen, dass problematische Fälle aus der Stichprobe verschwinden.

## 15. Screenshot- und Visual-Contract v1

1. Geometrie-Oracle bleibt primär. Screenshotdiff ist ergänzend.
2. Kanonische Kamera, Canvasgröße, DPR, Farbprofil, Antialiasing, Browser-Build und Renderer werden gebunden.
3. Canvas-ROI wird getrennt vom HUD verglichen. Dynamische Texte werden nicht in die Geometrieschwelle gemischt.
4. Pro Preset werden gespeichert: SHA-256, mittlerer RGB-Fehler, maximaler Kanalfehler, Anteil geänderter Pixel oberhalb einer Schwelle und Kanten-/Silhouetten-Diff.
5. Kein globaler Universalwert wie 0,01 für alle Szenen. Schwellen entstehen aus mindestens 20 akzeptierten Wiederholungscaptures derselben Umgebung plus gezielt injizierten Fehlerbildern.
6. Lokale Regionen für Chunk-Seams, Checkerboard und AO erhalten strengere ROI-Gates.
7. Baselineänderungen sind separate, sichtbare Änderungen mit Bilddiff und unabhängiger Freigabe.
8. Exakter Dateihash dient Integrität. Er darf nicht als visuelle Toleranzprüfung ausgegeben werden.

Playwright unterstützt Pixelgrenzen und weist auf Umgebungsabhängigkeit hin. Siehe [Visual Comparisons](https://playwright.dev/docs/test-snapshots). Für dieses Voxel-Lab reicht eine Standard-Pixelgrenze allein wegen harter Kanten und kleiner Seam-Fehler dennoch nicht aus.

## 16. Playwright- und CDP-Konzept

### 16.1 Zwei-Pass-Architektur

**Pass A, Gate:** Produktionsbuild, minimale Instrumentierung, keine Traces, keine Screenshots im Messfenster, Rohsamples in Memory puffern, danach exportieren.

**Pass B, Diagnose:** identischer Scenario-Seed mit CDP Tracing, Screenshots, Heap- oder GPU-Debugdaten. `measurementEligible: false`.

### 16.2 Playwright-Aufgaben

- Browserprozess pro Cold Sample starten.
- Exakten Branded-Browser-Channel und vollständige Version erfassen. Playwright unterstützt `chrome`, `msedge` und Beta-/Dev-/Canary-Channels: [Browser Channels](https://playwright.dev/docs/browsers#google-chrome--microsoft-edge).
- Über `addInitScript` PerformanceObserver vor App-Initialisierung registrieren.
- Trusted Inputs über Playwright beziehungsweise CDP Input auslösen.
- Szenario und erwartete Revision korrelieren.
- Console, Page Error, Request Failure, HTTP Error, Crash und Context Loss als Hard Fail behandeln.
- Rohdatei, Aggregate und Evidence-Digests erst nach dem zeitkritischen Fenster schreiben.

### 16.3 CDP-Aufgaben

- `Browser.getVersion` und `SystemInfo.getInfo` für Browser-/GPU-/Command-Line-Provenienz.
- `Performance.getMetrics` für ergänzende Laufzeitmetriken.
- `Runtime.getHeapUsage`, `Memory.getDOMCounters` und bei Bedarf HeapProfiler im Leakpfad.
- `Tracing.start/end` nur im Diagnosepass. CDP dokumentiert die Trace-Sammlung im [Tracing Domain](https://chromedevtools.github.io/devtools-protocol/tot/Tracing/).
- SystemInfo und mehrere Memory-Endpunkte sind experimentell. Ihre Schemaform wird zusammen mit Browser-Build gespeichert; sie sind keine browserübergreifenden Standards.

## 17. Evidence-Hygiene und Manifest-Selbstreferenz

### 17.1 Bundle-Struktur

```text
evidence-run/
  run-manifest.json
  raw/
    <run-id>.json
  aggregate/
    summary.json
    summary.md
  screenshots/
    ...
  logs/
    failures.json
  bundle.sha256
```

`run-manifest.json` enthält Digests aller Dateien außer sich selbst und `bundle.sha256`. `bundle.sha256` enthält den Digest des finalen Manifests und aller Nutzdateien. Eine CI-Attestation bindet zusätzlich `sourceTreeSha`, Workflowdefinition, Runneridentität und Bundle-Digest. So entsteht keine unmögliche Selbsthash-Referenz.

### 17.2 Pflichtfelder

- `sourceTreeSha`, nicht nur Integrationsbasis
- `generationParentSha` falls Evidence in einem Folgecommit landet
- `fixtureContractId/version/hash`
- `protocolVersion`, `schemaVersion`, Aggregator-Hash
- Browser-, Hardware- und Displayvertrag
- vollständige Runliste, invalide Runs und Gründe
- Rohsample-, Aggregate-, Screenshot- und Logdigests
- Aussageklasse: `correctness`, `diagnostic`, `performance-gate` oder `informational`

### 17.3 Golden-Änderung

Eine Golden-Änderung muss enthalten:

1. vorherige und neue Contract-Version
2. semantische Begründung
3. Diff von World-, Coverage-, Quad-, Triangle-, Memory- und Bildwerten
4. unveränderte unabhängige Oracle oder begründete Oracle-Änderung in separatem Review
5. ausdrückliche Bestätigung, dass nicht nur ein aktueller Fehler eingefroren wird
6. unabhängige Freigabe

## 18. Schutz gegen „schöngemessene“ Performance

Ein Agent darf nicht:

- nur den schnellsten Run auswählen;
- Warm-up verlängern, bis das Ergebnis gefällt;
- den langsamsten gültigen Run löschen;
- nach einem Fail ohne dokumentierten Infrastrukturgrund wiederholen;
- Visible und Greedy in systematisch unterschiedlicher Reihenfolge messen;
- Debugfeatures, Sichtweite, Auflösung, DPR, Workerzahl oder Qualitätsmerkmale asymmetrisch ändern;
- Headless-CI-Werte als reale GPU-Zielhardware ausgeben;
- rAF-Intervall als Renderzeit oder GPU-Zeit bezeichnen;
- Unsupported als 0 ms werten;
- p99 bei zu kleiner Stichprobe ausgeben;
- Perzentile über bereits aggregierte Perzentile mitteln;
- Trace- oder Screenshot-Overhead in einen Gate-Run mischen;
- Test und Golden still gemeinsam ändern;
- ein unvorteilhaftes Hardwareprofil aus dem Bericht entfernen.

Automatische Schutzmechanismen:

- vordefinierter Runplan und Order-Seed
- append-only Rohsamples
- Schema- und Digestprüfung
- keine automatischen Retries für Performance-Gates
- Bericht aller gültigen und invaliden Runs
- gepaarte CIs plus praktische Effektschwelle
- unabhängiges Review von Protokoll, Rohdaten und Aggregator

## 19. Checkliste für unabhängige Reviews

### Source und Scope

- [ ] Exakte Repository-SHA ist `d95992df05952ac4be6221ca1809c1c9e3c0ac9d` oder die später ausdrücklich genehmigte Baseline.
- [ ] Source Tree ist sauber; Build-Hash stimmt.
- [ ] Scenario-, Fixture-, Protocol- und Schema-Version sind unverändert.
- [ ] Kandidaten implementieren dieselben semantischen Features.

### Korrektheit

- [ ] Direkte Voxel-Oracle stimmt mit allen Meshern überein.
- [ ] Golden, Seams, Material, AO, Winding und deterministische Bytes bestehen.
- [ ] Fuzz-Seeds und Regression-Corpus sind vorhanden.
- [ ] Kein Golden wurde ohne Version und Begründung geändert.

### Messdesign

- [ ] Cold, Warm-up, Measurement, Stress und Trace sind getrennt.
- [ ] Warm-up-Regel wurde vorab festgelegt und symmetrisch angewendet.
- [ ] Mindestens 10 Cold Starts und 30 Warm Runs je Zelle.
- [ ] A/B-Reihenfolge ist gegenbalanciert und Seed dokumentiert.
- [ ] p99 hat mindestens 1.000 passende Events.
- [ ] Keine gültigen Ausreißer wurden entfernt.

### Umgebung

- [ ] Browser-Build, Flags, OS, CPU, GPU, Treiber und Graphics Backend vollständig.
- [ ] Headed/Headless, Auflösung, DPR, Refresh, VSync und Energieprofil vollständig.
- [ ] Tab blieb sichtbar und fokussiert; Hintergrundlast ist dokumentiert.
- [ ] Kein Thermal Throttling, Context Loss oder GPU Disjoint im gültigen Run.

### Statistik und Evidence

- [ ] Rohsamples validieren gegen Schema.
- [ ] Aggregate lassen sich aus Rohsamples reproduzieren.
- [ ] Bootstrap-Seed und Aggregator-Hash stimmen.
- [ ] Alle Runs, auch invalide und fehlgeschlagene, sind gelistet.
- [ ] Manifest und Bundle-Digest sind nicht zirkulär.
- [ ] Aussagen sind als Fakt, Schlussfolgerung oder Unsicherheit erkennbar.
- [ ] Keine fremden oder älteren Benchmarkwerte werden als neue Eigenmessung ausgegeben.

## 20. Späterer Implementierungs-Handoff für den Benchmark Runner

Dieser Abschnitt ist eine Übergabe, keine begonnene Implementierung.

### Arbeitspaket BR-01: Contracts und Provenienz

Ziel:

- Benchmark Protocol v1 und JSON-Schema als versionierte Dateien übernehmen.
- Scenario-Registry, Environment-Manifest und Bundle-Digest definieren.

Akzeptanz:

- Positive und negative Schema-Fixtures.
- Selbstreferenzfreier Digest-Vertrag.
- Kein Produktcode und keine Timinginstrumentierung in diesem Paket.

### Arbeitspaket BR-02: In-Browser-Telemetrie

Ziel:

- Main-/Worker-Spans, Revisionen, Long Tasks, Event Timing und rAF-Intervalle getrennt erfassen.
- Rohwerte ungerundet und ohne HUD-Scraping exportieren.

Akzeptanz:

- Unit-Tests für Clock-Normalisierung und Operation-Korrelation.
- Kein globaler TestBridge im Production Contract.
- Mess-Overhead separat quantifiziert.

### Arbeitspaket BR-03: Playwright/CDP Runner

Ziel:

- Cold-/Warm-/Stress-/Leak-Phasen, gegenbalancierte Reihenfolge, Environment-Capture und Failure-Hygiene.

Akzeptanz:

- Reproduzierbarer Runplan aus Seed.
- Keine automatischen Performance-Retries.
- Tracepass technisch getrennt vom Gatepass.

### Arbeitspaket BR-04: Aggregator

Ziel:

- Perzentile, hierarchische Bootstrap-CIs, gepaarte Ratios, Invalidierungsbericht und Markdownsummary.

Akzeptanz:

- Golden-Statistikfixtures.
- p99 verweigert sich bei zu kleinem `n`.
- Keine Outlier-Deletion.

### Arbeitspaket BR-05: GPU und Memory

Ziel:

- WebGL disjoint timer queries, WebGPU timestamp-query Capability, CDP Heap/DOM und Navigationstress.

Akzeptanz:

- Unsupported- und Disjoint-Fälle explizit.
- Kein `gl.finish()` im Gatepfad.
- Leak-Slope über drei unabhängige Prozesse.

### Arbeitspaket BR-06: WP-Gates und unabhängiges Review

Ziel:

- Kalibrierung der vorläufigen Budgets auf H1 bis H3.
- WP05/WP08/WP09/WP12 Gatekonfiguration und Reviewercheckliste aktivieren.

Akzeptanz:

- Baselinebericht mit Rohdaten und CIs.
- Jede absolute Schwelle hat Produktbegründung und Hardwarebezug.
- Kein Technologieentscheid vor erfolgreichem unabhängigen Review.

## 21. Primärquellen und Lizenz-/Nutzungsstatus

| Quelle | Version/SHA | Verwendung | Lizenz-/Dokumentstatus |
| --- | --- | --- | --- |
| [Hestia Voxel Kernel Lab](https://github.com/BenjaminHornung/hestia-voxel-kernel-lab/tree/d95992df05952ac4be6221ca1809c1c9e3c0ac9d) | `d95992d...` | Auditobjekt | Im geprüften Baum keine LICENSE-Datei; keine fremde Codeübernahme |
| [three.js](https://github.com/mrdoob/three.js/tree/r185) | `r185`, Paket `0.185.1` | aktueller Rendererpfad | [MIT](https://github.com/mrdoob/three.js/blob/r185/LICENSE) |
| [Playwright](https://github.com/microsoft/playwright/tree/v1.62.1) | `v1.62.1` | Browser-E2E | [Apache-2.0](https://github.com/microsoft/playwright/blob/v1.62.1/LICENSE) |
| [Vitest](https://github.com/vitest-dev/vitest/tree/v4.1.10) | `v4.1.10` | Unit Tests | [MIT](https://github.com/vitest-dev/vitest/blob/v4.1.10/LICENSE) |
| [Vite](https://github.com/vitejs/vite/tree/v8.2.1) | `v8.2.1` | Build/Preview | [MIT](https://github.com/vitejs/vite/blob/v8.2.1/LICENSE) |
| TypeScript | Paket `7.0.2` laut Lockfile | Compiler | Apache-2.0 laut [`package-lock.json`](https://github.com/BenjaminHornung/hestia-voxel-kernel-lab/blob/d95992df05952ac4be6221ca1809c1c9e3c0ac9d/package-lock.json) |
| [Event Timing API](https://www.w3.org/TR/event-timing/) | W3C Working Draft, 2026-03-19 | Inputlatenzmethodik | W3C permissive document license; Spezifikationsreferenz |
| [Long Tasks API](https://www.w3.org/TR/longtasks-1/) | W3C Technical Report | Long-Task-Methodik | W3C-Dokumentregeln; Spezifikationsreferenz |
| [High Resolution Time Level 3](https://www.w3.org/TR/hr-time-3/) | W3C Technical Report | monotone Uhren/Time Origins | W3C-Dokumentregeln; Spezifikationsreferenz |
| [WebGPU](https://www.w3.org/TR/webgpu/) | W3C Technical Report | GPU Timestamp Queries | W3C-Dokumentregeln; Spezifikationsreferenz |
| [WebGL EXT_disjoint_timer_query_webgl2](https://registry.khronos.org/webgl/extensions/EXT_disjoint_timer_query_webgl2/) | Revision 4, 2023-06-01 | WebGL GPU Timing | Khronos-Spezifikationsreferenz; keine Codeübernahme |
| [Chrome DevTools Protocol](https://chromedevtools.github.io/devtools-protocol/) | Browsergebundene aktuelle Domains | Environment, Trace, Memory | Protokolldokumentation; mehrere Endpunkte experimentell |
| [Playwright Browser Docs](https://playwright.dev/docs/browsers) | aktuelle offizielle Dokumentation | Branded Channels/Headless-Abgrenzung | Playwright-Dokumentation unter Projektlizenz |

## 22. Offene Unsicherheiten vor der ersten echten Messung

1. Konkrete H1-, H2- und H3-Geräte sowie der tatsächliche Mindesthardwarevertrag.
2. Gewünschte Display-Refresh-Ziele: 60, 90, 120 oder mehrere Zellen.
3. Ob Input-to-visible als Browser-Next-Paint-Näherung genügt oder ein invasiver Pixel-Probe-Run als sekundärer Beleg verlangt wird.
4. Verfügbarkeit und Stabilität von WebGL-/WebGPU-Timestamp-Queries auf den Zieladaptern.
5. Produktseitige Brush-Rate, maximal zulässige Queue-Tiefe und gewollte Cancel-/Supersession-Semantik.
6. Endgültige absolute Latenz- und Memorybudgets nach erster Baseline auf H1 bis H3.
7. Ob Performance-Evidence als CI-Artefakt/Attestation oder zusätzlich committed im Repository gehalten werden soll.

## 23. Abschließende Empfehlung

Der aktuelle Snapshot kann als Korrektheitsbasis für WP03 akzeptiert bleiben, sofern seine Zeitwerte weiterhin ausschließlich diagnostisch behandelt werden. Vor WP05 sollte zuerst BR-01 bis BR-04 als isolierte Benchmark-Infrastruktur spezifiziert und umgesetzt werden. BR-05 wird spätestens vor WP08 und zwingend vor WP12 benötigt. Ein Backend- oder Chunkgrößenentscheid ohne Rohsamples, reale GPU-Hardware, gegenbalancierte Wiederholungen und gepaarte Konfidenzintervalle wäre methodisch nicht belastbar.
