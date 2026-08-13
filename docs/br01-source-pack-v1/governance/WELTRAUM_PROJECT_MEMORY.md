# Weltraum-Spiel – kanonischer Projektstand

**Letzte Aktualisierung:** 2026-08-12  
**Status:** Lebendes Projektgedächtnis  
**Zweck:** Verbindliche, projektweite Zusammenfassung der aktuell akzeptierten Entscheidungen, Git-Stände, Forschungsstränge und Arbeitsregeln.

> Dieses Dokument unterscheidet strikt zwischen **akzeptierter Projektwahrheit**, **laufender Forschung**, **Vorschlägen** und **historisch abgelehnten Richtungen**.  
> Ein Research-Bericht wird nicht automatisch zu einer Architekturentscheidung. Eine Entscheidung gilt erst als akzeptiert, wenn sie ausdrücklich reviewed und in dieses Dokument oder den Decision Log übernommen wurde.

---

## 1. Produktvision

Das Ziel ist ein browserbasiertes, physikalisch glaubwürdiges Weltraumspiel mit:

- harten, quadratischen Block-/Microvoxels;
- keiner geglätteten Low-Poly-/Heightfield-Hauptdarstellung für den interaktiven Nahbereich;
- echter Laufzeitzerstörung;
- später strukturell getrennten Fragmenten und physikalischer Reaktion;
- prozeduralen Planeten;
- adaptiver räumlicher Auflösung;
- persistenten Änderungen, auch in zuvor unbesuchten Regionen;
- einer Browser-/Chromium-first-Entwicklungsstrategie, damit Chrome DevTools, Playwright und KI-Agenten echte Browserzustände autonom prüfen können;
- realer beziehungsweise nachvollziehbar vereinfachter Physik statt frei erfundener Sci-Fi-Antriebe;
- schrittweiser, evidenzbasierter Entwicklung statt eines großen unkontrollierten Engine-Neubaus.

Three.js ist aktuell der akzeptierte **Mesh-Referenzpfad**, aber noch nicht als endgültige Produktengine festgelegt.

---

## 2. Kanonische Repositories

### Produktrepository

`BenjaminHornung/Weltraum-Spiel`

Rolle:

- bestehendes Spiel;
- Flight, Navigation, UI, Persistence und weitere Produktbereiche;
- alte Hestia-/Surface-/Voxel-Versuche bleiben vorerst historische Referenz;
- keine neue Voxel-Lab-Technik wird vor WP12 ungeprüft integriert.

### Technologie-Lab

`BenjaminHornung/hestia-voxel-kernel-lab`

Rolle:

- vollständig projektunabhängiger Browser-Voxel-Bake-off;
- keine Imports aus `Weltraum-Spiel`;
- TypeScript, Vite, Vitest, Playwright;
- Three.js/WebGL2 als Mesh-Referenz;
- später Raw WebGPU als separater Volume-DDA-Vergleich;
- serielle, kleine Arbeitspakete mit Review nach jedem Commit.

---

## 3. Aktuelle Git-Wahrheit

### Voxel-Lab

```text
main:
9a0f7554d028c0ee36b6ca620d7b3fd56f21454f

integration/voxel-kernel-lab-v1:
d95992df05952ac4be6221ca1809c1c9e3c0ac9d
```

Der Integrationsbranch enthält WP00 bis WP03.

`main` bleibt bewusst beim Bootstrap-Stand. Die laufende Forschung und Entwicklung wird im Integrationsbranch fortgeführt, bis ein späterer, bewusst geplanter Promotion-Schritt erfolgt.

### Verbindlicher Research-SHA

Alle aktuell laufenden read-only Research-Agenten verwenden für das Voxel-Lab exakt:

```text
d95992df05952ac4be6221ca1809c1c9e3c0ac9d
```

---

## 4. Akzeptierte Arbeitspakete

## WP00 – Repository Bootstrap

**Status:** ACCEPTED

Ergebnis:

- separates öffentliches Repository;
- `main`;
- `integration/voxel-kernel-lab-v1`;
- README, AGENTS und Work-Package-Grundregeln;
- kein Produkt- oder Voxelcode aus `Weltraum-Spiel`.

## WP01 – Visible-Face-Baseline

**Status:** ACCEPTED

Bewiesen:

- privates deterministisches `32³`-Dense-Volume;
- `Uint8Array`, Material `0 = Air`;
- Plattform, Treppe und hohler Würfel;
- exposed faces only;
- exakt achsenausgerichtete Normalen;
- ein aggregiertes Three.js-Mesh, kein Mesh pro Voxel;
- Browserdarstellung, Orbit/Zoom/Reset, Blockkanten und Normalen-Debug;
- Vitest- und Playwright-Vertrag;
- getrennte reguläre E2E- und kuratierte Evidence-Läufe.

Kanonische Fixture-Werte:

```text
Occupied voxels: 1.169
Quads:            2.238
Triangles:        4.476
```

## WP02 – Große sparse Chunk-Fixture-Welt

**Status:** ACCEPTED

Weltvertrag:

```text
Voxelgröße:          0,25 m
Weltzellen:          512 × 128 × 512
physische Größe:     128 × 32 × 128 m
Chunkgröße:          32³
Candidate Chunks:    1.024
Materialized Chunks: 51
Occupied Voxels:     97.989
World Hash:          fnv1a32:b58829bb
```

Architektur:

- sparse `Map<ChunkKey, DenseVoxelVolume>`;
- dichte `32³`-Payloads;
- `34³`-Halo;
- negative Weltkoordinaten;
- fehlende Chunks lesen als Air;
- defensive Snapshots;
- halo-korrekte Chunk-Seams;
- ein Filled Mesh pro materialisiertem Chunk;
- Golden Fixture Contract;
- globale world-space Blockkanten-Deduplizierung;
- Speicherbericht und Evidence-Manifest.

Visible-Face-Golden:

```text
Covered Unit Faces: 59.350
Quads:               59.350
Triangles:           118.700
Neutral Mesh:        7.359.400 B
```

## WP03 – Deterministisches Greedy Meshing A/B

**Status:** ACCEPTED und integriert

Bewiesen:

- Visible-Face- und Greedy-Mesher konsumieren dieselbe Golden-Welt;
- identische materialbewusste World-Space-Unit-Face-Coverage;
- keine Silhouetten-, Material- oder Chunk-Seam-Abweichung;
- kein Cross-Chunk-Quad-Merging;
- getrennte Unit-Block-Edges und tatsächliche Mesh-Quad-Edges;
- nur ein aktiver Filled-Mesh-Satz im Renderer;
- Browser-A/B-Routen und kuratierte Evidence.

Greedy-Golden:

```text
Covered Unit Faces: 59.350
Coverage Hash:
sha256:3e2c700c99a650413821586a01da0705491101b2d1dc1944730acb0db006b04e

Greedy Quads:       19.073
Greedy Triangles:   38.146
Greedy Neutral Mesh: 2.365.052 B
```

Reduktion gegenüber Visible Faces:

```text
Quads:         67,8635 %
Triangles:     67,8635 %
Neutral Mesh:  67,8635 %
Draw Calls:    unverändert
```

Wichtige Einordnung:

- Greedy ist im aktuellen TypeScript-Einzellauf CPU-seitig diagnostisch langsamer als Visible Faces;
- diese Zeitwerte sind kein Benchmark-Gate;
- WP03 beweist Geometrie- und Coverage-Korrektheit, nicht die endgültige CPU-Performance;
- Worker, Scratch-Buffer-Reuse und gegebenenfalls WASM werden später geprüft.

---

## 5. Aktuelle technische Invarianten

Diese Regeln dürfen spätere Agenten nicht still verändern:

1. CPU-seitiger Voxelzustand ist Authority.
2. Rendererprodukte sind abgeleitet und wegwerfbar.
3. `Uint8Array`-Materialzellen, `0 = Air`.
4. Near-Field-Referenzgröße aktuell `0,25 m`.
5. Sparse World aus dichten `32³`-Chunks.
6. Mesher arbeiten auf unveränderlichen `34³`-Halo-Snapshots.
7. Nur harte, quadratische Voxel:
   - Normalen ausschließlich `±X`, `±Y`, `±Z`;
   - keine geglätteten Normalen;
   - keine diagonalen Heightfield-Flächen;
   - keine Surface Nets;
   - kein Marching Cubes;
   - kein Dual Contouring als Near-Field-Hauptdarstellung.
8. Kein Three.js-Objekt beziehungsweise keine Instanz pro Voxel als Produktpfad.
9. Visible Faces bleibt Referenzoracle.
10. Greedy darf nur semantisch kompatible Faces mergen.
11. Kein Cross-Chunk-Merge, solange lokale Chunk-Rebuilds gewünscht sind.
12. Golden Contracts dürfen nur durch eine ausdrücklich versionierte Entscheidung geändert werden.
13. Reguläre E2E-Läufe verändern keine getrackte Evidence.
14. Kuratierte Evidence wird über separate Scripts erzeugt.
15. Timingdiagnostik ist keine Performancebehauptung.
16. Keine zweite World-Truth in Renderer, UI, Collision oder Tests.

---

## 6. Serielle Write-Roadmap

Nächste Arbeitspakete:

```text
WP04 Block-AO und Palette
WP05 Worker/Scheduler/revisionssichere Adoption
WP06 DDA-Picking ohne Mutation
WP07 Einzelvoxel hinzufügen/entfernen
WP08 Brush-Edits und 100-/1.000-Edit-Stress
WP09 32³-vs-64³ Vergleich
WP10 Raw-WebGPU-Volume-DDA für ein Objekt
WP11 WebGPU-Fixtures und Edits
WP12 Technologieentscheidung
```

Erst nach WP12:

```text
WP13 optional Sparse 8³ Bricks ODER Rust/WASM
WP14 lokale Connectivity ohne Physik
WP15 getrennte Komponente als statisches Voxelobjekt
WP16 genau ein kontrolliertes Rapier-Fragment
```

Keine spätere Phase darf vorgezogen werden, nur weil ein Agent freie Kapazität hat.

---

## 7. Parallelitäts- und Git-Regeln

### Schreibarbeit

- Maximal ein Write-Agent pro Repository.
- Jeder Write-Agent:
  - startet vom letzten akzeptierten Integrations-SHA;
  - arbeitet in isoliertem Worktree und Branch;
  - implementiert genau ein Arbeitspaket;
  - baut, testet und erzeugt Evidence;
  - commitet und pusht;
  - führt keinen Merge durch;
  - beginnt nicht das nächste Arbeitspaket.
- Nach jedem Push folgt unabhängiges Review.
- Bei Findings wird derselbe Branch korrigiert.
- Nur akzeptierte Heads werden per `--ff-only` integriert.

### Parallele Forschung

Read-only Research-, Audit- und Planungsagenten dürfen parallel laufen.

Sie dürfen nicht:

- committen;
- pushen;
- mergen;
- Repositories verändern;
- Package-/Lockfiles ändern;
- `.devtoolbox` einführen;
- zukünftige WP04+-Implementierung vorwegnehmen;
- fremde Benchmarks als eigene Ergebnisse darstellen.

---

## 8. Aktive Research-Stränge

Aktuell laufend beziehungsweise gestartet:

1. Block-AO, Palette und AO-kompatibles Greedy Meshing.
2. Web Worker, bounded Scheduler, Revisionen und stale-result rejection.
3. WebGPU-/Engine-Bake-off:
   - Raw WebGPU;
   - Three.js WebGPURenderer/TSL;
   - Babylon.js;
   - PlayCanvas;
   - Rust/wgpu/WASM.
4. Blockige Voxel-Landschaftsgenerierung und Art-Direction-Pipeline.
5. Zerstörung, Connectivity, Fragmente und Physik.
6. Open-Source-GitHub- und Lizenz-Audit.
7. Benchmark-, Profiling- und Testmethodik.
8. Planetmaßstab, Streaming, adaptive Auflösung und persistente Ereignisse.
9. Read-only Integrationsgrenze Voxel-Lab → Weltraum-Spiel.
10. Voxel-Assetpipeline und visuelle Blockästhetik.

Optionaler isolierter Spike:

11. Raw-WebGPU-Volume-DDA in einem vollständig separaten Scratch-Projekt.

Die Research-Berichte sind zunächst **PROPOSED**, nicht automatisch **ACCEPTED**.

---

## 9. Noch offene Technologieentscheidungen

Noch nicht entschieden:

- endgültige Produktengine;
- Three.js WebGL2 versus Three.js WebGPU;
- Raw WebGPU versus Babylon.js/PlayCanvas für Volume-DDA;
- TypeScript-only versus Rust/WASM für Meshing/Connectivity;
- endgültige Chunkgröße `32³` versus `64³`;
- Dense Chunks versus Sparse `8³` Bricks;
- Terrainmesh versus Volume-DDA versus Hybrid;
- Rapier versus Jolt für spätere Fragmentphysik;
- Planet-Tile-System und Multiresolution-Authority;
- genaue Save-/Event-/Generatorversionsstrategie;
- Assetauthoring-Toolchain;
- Near-Field-Voxelgröße für hochwertige Assets, möglicherweise `0,125 m`.

Diese Entscheidungen werden erst nach den vorgesehenen Research- und Bake-off-Gates getroffen.

---

## 10. Historisch abgelehnte oder eingefrorene Richtungen

Nicht erneut als akzeptierte Grundlage behandeln:

- den früheren `surface-play`-Pfad als direkte Produktbasis;
- Surface Nets als Near-Field-Hauptdarstellung für die gewünschte Blockoptik;
- glatte Low-Poly-/Heightfield-Terrainprojektionen;
- Primitive-Bäume aus Kugeln, Zylindern, Dodekaedern oder Kegeln als finale Voxelassetlösung;
- „Noise → quantisierte Höhe“ als vollständige Landschafts-Art-Direction;
- eine komplette eigene Game-Engine ohne vorherigen Backend-Bake-off;
- vollständige Physik, Connectivity, Planetstreaming und Art Direction in einem einzigen Agentenauftrag;
- visuelle Selbstfreigabe durch Agents ohne Owner-Gate;
- technische Unit-Test-Erfolge als Ersatz für visuelle Qualität;
- fremde Benchmarkzahlen als eigene Performance-Evidence.

Der alte Weltraum-Spiel-Code bleibt als Referenz und Lernquelle erhalten. Er wird aber nicht automatisch in das neue Lab übernommen.

---

## 11. Source-of-Truth-Hierarchie

Bei Widersprüchen gilt:

1. Aktueller GitHub-Remote-SHA und tatsächlich committed Code.
2. Golden Contracts, Tests und reproduzierbare Evidence auf diesem SHA.
3. Akzeptierter unabhängiger Review und Fast-Forward-Integrationsbericht.
4. Dieses Projektgedächtnis und der Decision Log.
5. Abgeschlossene Research-Berichte.
6. Laufende Research-Berichte und Agentenempfehlungen.
7. Chat-Zusammenfassungen.
8. Historische Prototypdokumente und alte Screenshots.

ModifiedAt oder ein neuer Dateiname allein beweisen keine Aktualität.

---

## 12. Statusvokabular

- **ACCEPTED** – reviewed und explizit als Projektwahrheit übernommen.
- **INTEGRATED** – akzeptierter Commit wurde auf den Integrationsbranch fast-forwarded.
- **PROPOSED** – Research- oder Architekturvorschlag, noch nicht entschieden.
- **RUNNING** – Agent arbeitet daran.
- **BLOCKED** – kann ohne konkrete Entsperrbedingung nicht weitergehen.
- **REJECTED** – ausdrücklich verworfen; darf nicht still wieder eingeführt werden.
- **DEFERRED** – bewusst später.
- **HISTORICAL** – nur Referenz, keine aktuelle Produktwahrheit.
- **UNKNOWN** – nicht ausreichend belegt.

---

## 13. Update-Protokoll

Nach jedem abgeschlossenen Agentenbericht:

1. Bericht als Markdown im Projekt speichern.
2. Im Research Register:
   - Status;
   - Datum;
   - Basis-SHA;
   - Quellen;
   - wichtigste Findings;
   - offene Fragen;
   - empfohlene Entscheidung
   eintragen.
3. Vorschläge nicht automatisch akzeptieren.
4. Widersprüche zwischen Berichten markieren.
5. Eine Synthese beziehungsweise Entscheidung durchführen.
6. Nur akzeptierte Entscheidungen in dieses Dokument und den Decision Log übernehmen.
7. Ersetzte Aussagen ausdrücklich als superseded markieren, nicht still löschen.

Nach jedem Write-Arbeitspaket:

1. Branch und finalen SHA eintragen.
2. Reviewstatus dokumentieren.
3. Golden-/Evidence-Werte übernehmen.
4. Erst nach Fast-Forward den Status auf INTEGRATED setzen.
5. Den nächsten Write-Agenten an den neuen Integrations-SHA binden.
