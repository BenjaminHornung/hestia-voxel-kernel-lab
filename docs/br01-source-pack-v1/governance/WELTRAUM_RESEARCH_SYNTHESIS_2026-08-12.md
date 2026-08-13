# Weltraum-Spiel – Synthese der abgeschlossenen Voxel-Forschung R01–R10

**Synthesedatum:** 2026-08-12  
**Kanonischer Voxel-Lab-Stand:** `d95992df05952ac4be6221ca1809c1c9e3c0ac9d`  
**Remote-Prüfung:** `integration/voxel-kernel-lab-v1` wurde gegen diesen SHA verglichen und war identisch.  
**Status:** Research-Synthese und Entscheidungsgrundlage; keine Implementierung, kein Commit und kein Merge.

> Dieses Dokument ersetzt die einzelnen Abschlussberichte nicht. Es ordnet ihre Aussagen, löst Widersprüche auf und trennt akzeptierte Entscheidungen von späteren Spikes und bewusst aufgeschobenen Fragen.

---

## 1. Vollständigkeit und Quelleninventar

Alle zehn geplanten Research-Stränge R01 bis R10 liegen als Abschlussberichte vor. R11 war als optionaler früher Raw-WebGPU-Spike vorgesehen und wurde nicht ausgeführt; seine technische Fragestellung wird in der regulären WP10-Folge behandelt.

| ID | Forschungsstrang | Kanonische Berichtsdatei | Basis | Rohes Quelleninventar |
|---|---|---|---|---:|
| R01 | Block-AO, Palette und AO-kompatibles Greedy Meshing | `WP04_Block_AO_Palette_Research_Abschlussbericht(1).md` | `d95992df05952ac4be6221ca1809c1c9e3c0ac9d` | 25 |
| R02 | Worker, bounded Scheduler, Revisionen und Adoption | `wp05_worker_scheduler_abschlussbericht(1).md` | `d95992df05952ac4be6221ca1809c1c9e3c0ac9d` | 39 |
| R03 | WebGPU-/Engine-Bake-off | `03_webgpu_engine_bakeoff_abschlussbericht(2).md` | `d95992df05952ac4be6221ca1809c1c9e3c0ac9d` | 59 |
| R04 | Blockige Voxel-Landschaftsgenerierung | `04_voxel_landscape_generation_research_report(1).md` | `d95992df05952ac4be6221ca1809c1c9e3c0ac9d` | 52 |
| R05 | Zerstörung, Connectivity, Fragmente und Physik | `05_destruction_connectivity_physics_research_report(1).md` | `d95992df05952ac4be6221ca1809c1c9e3c0ac9d` | 27 |
| R06 | Open-Source-GitHub- und Lizenz-Audit | `06_open_source_github_license_audit_report.md` | `d95992df05952ac4be6221ca1809c1c9e3c0ac9d` | 45 Repositories plus Standards/Dokumentation; URL-Zahl nicht normalisiert |
| R07 | Benchmark-, Profiling- und Testmethodik | `07_benchmark_test_methodology_audit_report(1).md` | `d95992df05952ac4be6221ca1809c1c9e3c0ac9d` | 51 |
| R08 | Planetmaßstab, adaptive Auflösung und persistente Ereignisse | `08_planet_scale_streaming_lod_persistence_research_report(1).md` | `d95992df05952ac4be6221ca1809c1c9e3c0ac9d` | 47 |
| R09 | Integrationsgrenze Voxel-Lab → Weltraum-Spiel | `09_weltraum_integration_boundary_audit_report(1).md` | `d95992df05952ac4be6221ca1809c1c9e3c0ac9d` plus `15f3550bd604856b25d40a7ac700ec4d5106b89e` | 58 |
| R10 | Voxel-Assetpipeline und visuelle Blockästhetik | `10_asset_pipeline_visual_style_research_report(1).md` | `d95992df05952ac4be6221ca1809c1c9e3c0ac9d` | 46 |


**Duplikatbereinigung:** `05_destruction_connectivity_physics_research_report(1).md` und `(2).md` sind byteidentisch. Beide besitzen SHA-256 `79ccccb489e01a1d2858979a3983f4b6073fee48e5c876ae256bb653b0b363f0`. Für das Register zählt nur `(1)` als kanonische Datei.

---

## 2. Gesamturteil

Die Berichte bestätigen die bisherige Grundstrategie und liefern keinen Grund für einen erneuten Architektur-Neustart:

1. Das Voxel-Lab bleibt **Browser-/Chromium-first**, TypeScript-first und strikt getrennt vom Produktrepository.
2. Harte quadratische Blockvoxels bleiben die Near-Field-Zieltopologie. Surface Nets, Marching Cubes, geglättete Normalen und diagonale Heightfield-Flächen bleiben ausgeschlossen.
3. Die CPU-seitigen Materialzellen sind Authority. Meshes, GPU-Volumes, Collider, LOD-Proxys, Instanzbatches und Screenshots sind abgeleitete, verwerfbare Produkte.
4. Der nächste Write-Schritt ist **WP04 Block-AO und Palette** auf dem unveränderten Integrations-SHA.
5. Nach WP04 wird vor WP05 eine kleine, serielle Benchmark-Grundlage eingefügt: **BR-01 bis BR-04**. Sie verhindert, dass Worker-, Chunk- oder Backendentscheidungen auf HUD-Diagnostik beruhen.
6. Es gibt **keinen Enginewechsel jetzt**. Raw WebGPU wird in WP10 als neutrale DDA-Messsonde geprüft; Three.js WebGPURenderer/TSL ist der zweite Kandidat. Die Produktentscheidung bleibt WP12 vorbehalten.
7. Weltgenerierung, Planetmaßstab, Assetpipeline, Connectivity und Physik erhalten klare Zielrichtungen, bleiben aber vorerst getrennte, später zu beweisende Programme.
8. Vor WP12 beginnt **keine Integration** des Lab-Kerns in `Weltraum-Spiel`.
9. Lizenz- und Provenienzregeln werden verbindlich. Fremder Code wird nicht aus GPL-, nichtkommerziellen oder unlizenzierten Quellen übernommen. Der Lizenzstatus des eigenen öffentlichen Voxel-Labs bleibt eine Owner-Entscheidung.

---

## 3. Berichtübergreifende Konvergenz

| Thema | Gemeinsames Ergebnis |
|---|---|
| Authority | Kanonische Zellbelegung und Materialidentität liegen außerhalb von Three.js, GPU und Physiksolver. |
| Ableitungen | Render-Mesh, Volume-DDA-Ressourcen, Collider, LOD, Massenprojektionen und Instanzbatches tragen Source-Revisionen und dürfen neu gebaut werden. |
| Determinismus | Integer-/quantisierte Koordinaten, stabile Sortierung, versionsgebundene Algorithmen, Hashes und unveränderliche Snapshots. |
| Chunking | `32³` und `34³`-Halo bleiben bis WP09 die Referenz; `64³` wird nicht vorab zum Sieger erklärt. |
| Threading | Ein langlebiger Module Worker zuerst; Transferables; bounded Queue; keine SAB-/OffscreenCanvas-Ausweitung in WP05. |
| Adoption | Workerresultate sind Kandidaten. Epoch, Revision, Request-ID und Worker-Generation werden am Main Thread geprüft. |
| Rendering | Three/WebGL2 bleibt Referenz; Raw WebGPU erst als isolierter Volume-DDA-Vergleich. |
| Testmethodik | Korrektheit vor Performance; Rohsamples statt HUD-Scraping; Cold/Warm/Stress/Trace getrennt; A/B-Reihenfolge gegenbalanciert. |
| Worldgen | Feature-/Constraint-Graph für Macroformen, hydrologische 2D/2,5D-Felder, lokale 3D-Operatoren und erst danach harte Voxelmaterialisierung. |
| Planet | Cube-Sphere-Hierarchie als stärkster Kandidat; Generator + geordnete Events + Brick-Checkpoints; Render-LOD und Simulation getrennt. |
| Zerstörung | Globale statische Terrainchunks plus objektlokale Voxelvolumen; Face-6-Connectivity; atomarer Zelltransfer; Rapier später als erster Browser-Spike. |
| Assets | HVOX/Materialvolumen ist Gameplaywahrheit; GLB ist Preview/Proxy; stabile Materialkeys, Anchors, Provenienz und Human Review. |
| Integration | Erst nach WP12; rendererneutrales Kernel-Package/Testkit; read-only Golden-Fixture-Vertical-Slice zuerst. |
| Lizenz | Commitgenaue Provenienz; permissive Lizenzen mit Pflichten; GPL/NC/unlizenziert nur als Research-Inspiration. |

---

## 4. Akzeptierte Entscheidungen

### A-01 – WP04-Vertrag

**Status: ACCEPTED FOR IMPLEMENTATION**

- AO-Stufen `0..3`, wobei `0` am dunkelsten und `3` unoccludiert ist.
- Formel: Sind beide Seitenoccluder belegt, ist AO `0`; sonst `3 - (side1 + side2 + corner)`.
- Samples liegen auf der Außenseite der sichtbaren Fläche.
- `contributesToAo` stammt aus Palette-v1, nicht aus `materialId !== 0`.
- Vier AO-Werte werden in emittierter Vertexreihenfolge gespeichert und als 2-Bit-Werte gepackt.
- Greedy-Merge nur bei gleicher Face-ID, Material-ID und identischer AO4-Signatur.
- Deterministische Diagonalregel aus den gegenüberliegenden AO-Summen.
- Der vorhandene `34³`-Halo ist ausreichend.
- WP04 verwendet normalisierte RGB8-Vertexfarben, keinen Custom Shader und keine neue Dependency.
- WP02-/WP03-Goldens und Evidence bleiben byteidentisch; WP04 erhält eine eigene Route und eigene Goldens.

### A-02 – Materialregistrierung wird geschichtet

**Status: ACCEPTED**

WP04 Palette-v1 bleibt bewusst klein: sichtbare Farbe, `opaque`, `contributesToAo`. Spätere Dichte-, Reibungs-, Struktur-, Bruch- und Brandwerte liegen in einem separaten physischen Materialkatalog. Die Zelle speichert weiterhin nur einen stabilen 8-Bit-Slot. RGB ist niemals Materialidentität.

### A-03 – Benchmark Protocol v1

**Status: ACCEPTED**

- Bestehende WP03-Zeiten bleiben ausschließlich Diagnostik.
- Repository-SHA, Build-Hash, Szenario, Browser, CPU, GPU, Treiber, Auflösung, DPR, Refresh und Energiezustand werden gebunden.
- Rohsamples werden vor Aggregation gespeichert; das HUD ist keine Messdatenquelle.
- Cold, Warm-up, Measurement, Stress und Trace sind getrennte Runs.
- A/B-Reihenfolgen werden mindestens als ABBA/BAAB gegenbalanciert.
- Long Tasks, Input-Liveness, Workerphasen, Adoption und GPU-Fähigkeiten werden getrennt erfasst.

### A-04 – WP05-Workerarchitektur

**Status: ACCEPTED FOR LATER IMPLEMENTATION**

- Genau ein langlebiger Dedicated Module Worker als Startpfad.
- Höchstens 128 wartende Produkte und genau ein In-flight-Request.
- Wartende Rezepte enthalten Metadaten, keine Halos.
- Halo unmittelbar vor Dispatch aus der Authority erzeugen und als exklusiven `ArrayBuffer` transferieren.
- Kein `SharedArrayBuffer`, kein `OffscreenCanvas`, kein Worker-internes Backlog und kein synchroner Mesher-Fallback.
- `newest revision wins`, Coalescing, stale-result rejection, Worker-Generation und kontrollierter Restart.

### A-05 – Backend-/Enginefolge

**Status: ACCEPTED; FINAL DECISION DEFERRED TO WP12**

- Three.js bleibt vorläufig Scene-, Kamera- und WebGL2-Fallbackpfad.
- WP10 prüft Raw WebGPU als primären neutralen DDA-Spike.
- Three.js WebGPURenderer/TSL r185 ist der zweite praktische Vergleich.
- Babylon.js wird erst praktisch geprüft, wenn Three einen öffentlichen API-Blocker zeigt.
- PlayCanvas 2.21.3 ist für diesen konkreten Volume-DDA-Spike versionsgebunden ausgeschlossen.
- Rust/wgpu/WASM wird nicht aus bloßem Performanceverdacht eingeführt.

### A-06 – Integrationsgrenze

**Status: ACCEPTED**

- Keine Produktintegration vor WP12.
- Lab-Three-Renderer wird nicht ins Produkt kopiert.
- Nach WP12 entsteht zunächst eine rendererneutrale Package-/Testkit-Grenze.
- Das erste Produktgate ist ein read-only Golden-Fixture-Slice hinter Feature Flag über die vorhandene `MeshArtifact`-/`RenderBackend`-Grenze.
- Player, Weapons, Collision, Physics, Planetstreaming und Persistence bleiben dabei entkoppelt.
- Adaptive, Structural und der neue Kernel dürfen keine drei konkurrierenden Authorities werden.

### A-07 – Lizenz- und Provenienzregeln

**Status: ACCEPTED**

- Fremde SHAs, Lizenztexte, NOTICE-Dateien, Änderungen und Assets werden getrennt dokumentiert.
- GPL-, nichtkommerzielle und unlizensierte Quellen werden nicht kopiert oder portiert.
- Voxelize, `block-mesh-rs`, Cubiquity, Divine Voxel Engine und Godot Voxel Tools sind Research-Shortlist, keine automatische Dependency-Liste.
- Rapier bleibt der stärkste erste Browser-Physikkandidat.
- Der öffentliche Voxel-Lab-Stand ohne LICENSE wird vor externer Wiederverwendung, Contributions oder Release ausdrücklich geklärt.

### A-08 – Auflösung und visuelle Freigabe

**Status: ACCEPTED**

- `0,25 m` bleibt v1-Referenz für Lab, Standardassets und Near Field.
- `0,125 m` ist nur eine explizite lokale Hero-/Detail-Forschungsdomäne; keine globale Umstellung.
- Visuelle und Art-Direction-Gates brauchen menschliche Owner-Freigabe. Pixelmetriken und Screenshots sind Regressionsevidenz, keine Geschmacksautorität.

---

## 5. Akzeptierte Forschungsrichtungen mit Stop-Gates

### C-01 – Worldgen-Hybrid

**Status: ACCEPTED RESEARCH DIRECTION / IMPLEMENTATION DEFERRED**

Macroformen und Hotspots werden durch Feature-/Constraint-Graphen beschrieben. Klima, Hydrologie, Erosion und Boden arbeiten auf 2D/2,5D-Feldern. Höhlen, Überhänge, Bögen und Wurzeln kommen aus lokalen 3D-Operatoren. Erst der validierte Zustand wird in aktive harte `0,25 m`-Voxelchunks materialisiert.

Das ist **keine Rückkehr zu Low-Poly-Terrain**: Das Höhenfeld ist eine Generationsrepräsentation, nicht die sichtbare Near-Field-Geometrie oder Gameplaywahrheit.

Stop-Gates: deterministische Felder, null Seams, korrekte Hydrologie, lesbare Macroformen, lokale volumetrische Topologie, authored Assets und Human Art Freeze.

### C-02 – Planetarchitektur

**Status: ACCEPTED CANDIDATE / REQUIRES SPIKES**

Stärkster Kandidat ist Cube-Sphere-Quadtree plus radiale Sparse-Bricks, versionierter Generator, geordnetes Ereignislog und kanonische Brick-Checkpoints. Render-, Collider-, Occupancy-, Atmosphären- und Massenproxies bleiben abgeleitet.

Stop-Gates: Cube-Face-Ownership, Fixed-Point-/Quantisierungsvertrag, deterministisches Event-Replay, semantisch neutrale Kompaktion, blockige 1:2-LOD-Nähte, Save-Fault-Recovery und LOD-invariante Massenaggregate.

### C-03 – Zerstörung und Physik

**Status: ACCEPTED DIRECTION / DEFERRED TO WP14–WP16**

Globale statische Terrainchunks und objektlokale Voxelvolumen bilden gemeinsam die Zielstruktur. Connectivity verwendet Face-6-Nachbarschaft und konservative, resumierbare regionale Flood Fills. Das Erreichen einer Analysegrenze bedeutet `Unknown`, niemals `Detached`. Fragmenttransfer ist revisionsgeprüft und atomar.

Rapier wird zuerst mit greedy 3D-Cuboid-Compounds und voxelbasierten Mass Properties geprüft. Rapier Voxelshape und Jolt bleiben Vergleichskandidaten.

### C-04 – Assetpipeline

**Status: ACCEPTED DIRECTION / SEPARATE PROGRAM DEFERRED**

Kanonisches Assetprodukt ist `HVOX v1` plus `asset.hestia.json`. Blender, VOX, Vengi, Blockbench oder Qubicle sind Quellen. GLB ist ausschließlich Preview-/Proxyprodukt. AO wird aus Belegung berechnet, nicht in Farben eingebrannt. Worldgen darf Assetfamilien erst nach Rights-, Contract-, Silhouetten-, Scatter-, LOD- und Human-Review-Gates verwenden.

---

## 6. Aufgelöste Widersprüche

### Palette-v1 gegen physische Materialien

Kein Konflikt: WP04 implementiert nur die Render-/AO-Palette. R05/R10 definieren einen späteren physischen Katalog, der über stabile Materialkeys beziehungsweise Slots referenziert wird. Physikfelder werden nicht in WP04 gezogen.

### Fehlender Chunk = Air

Im deterministischen Lab bleibt diese Fixture-Regel bestehen. Im Produkt darf ein nicht geladener Nachbar nicht ohne Coverage-Beweis als Air gelten. Ein künftiger Neighborhood-Snapshot enthält explizite Abdeckung, Epoch und Digest.

### Heightfield-Generierung gegen echte Voxels

Das 2,5D-Feld ist nur der günstige Generator für Basisoberfläche und Hydrologie. Interaktion, Darstellung und Zerstörung im aktiven Nahbereich bleiben harte Voxelzellen; lokale 3D-Operatoren erlauben Überhänge und Höhlen.

### Three.js gegen Raw WebGPU

Kein aktueller Enginekonflikt: Three bleibt Produktreferenz und Fallback. Raw WebGPU misst WP10s Kernfrage ohne Engineabstraktion. Erst WP12 kann eine Änderung akzeptieren.

### `0,25 m` gegen `0,125 m`

`0,25 m` bleibt Standardauthority. `0,125 m` ist eine getrennte lokale Forschungsdomäne und darf nicht denselben Raum gleichzeitig autoritativ überdecken.

### Rapier gegen Jolt

Rapier ist der erste Browser-Spike wegen der kleineren JS/WASM-Integrationsgrenze. Jolt wird nur bei einem belegten Rapier-Defizit praktisch vertieft.

### Globaler SVO gegen Cube-Sphere

Ein global dynamischer SVO/64-Tree wird als alleinige Planetwahrheit verworfen. Sparse Baumprinzipien dürfen innerhalb von Tiles oder als abgeleitete Occupancy-Strukturen verwendet werden.

### R07 gegen die alte WP05-Reihenfolge

R07 findet echte methodische Blocker für Liveness- und Performanceaussagen. Daher werden BR-01 bis BR-04 zwischen WP04 und WP05 eingefügt. Das ändert keine Geometrie- oder Produktarchitektur, sondern schafft die Mess- und Provenienzgrundlage, auf die WP05 angewiesen ist.

---

## 7. Revidierte serielle Roadmap

```text
WP04  Block-AO und Palette
BR-01 Benchmark-Contracts und Provenienz
BR-02 In-Browser-Telemetrie
BR-03 Playwright/CDP Runner
BR-04 Aggregator und Statistikfixtures
WP05  Worker/Scheduler/revisionssichere Adoption
WP06  DDA-Picking ohne Mutation
WP07  Einzelvoxel hinzufügen/entfernen
BR-05 GPU-/Memory-/Leak-Messpfad
WP08  Brush-Edits und 100-/1.000-Edit-Stress
WP09  32³-vs-64³ Vergleich
WP10  Raw-WebGPU-DDA plus Three-WebGPU/TSL-Vergleich
WP11  WebGPU-Fixtures und Edits
BR-06 Kalibrierte Gates und unabhängiger Review
WP12  Technologieentscheidung
```

Nur danach:

```text
WP13 optional: Sparse 8³ Bricks ODER Rust/WASM
WP14 Face-6-Connectivity, mark-only
WP15 genau eine statische Fragmentextraktion
WP16 genau ein kontrolliertes Rapier-Fragment
```

R11 als vorgezogener separater Raw-WebGPU-Spike wird **DEFERRED TO WP10**. Die Forschungsfrage geht nicht verloren, aber sie wird nicht doppelt implementiert.

---

## 8. Unmittelbarer nächster Write-Auftrag

Der nächste Agent erhält ausschließlich den synthetisierten WP04-Prompt. Er startet von `{BASE}`, arbeitet auf `agent/wp-04-block-ao-palette`, verändert `Weltraum-Spiel` nicht, führt keinen Merge aus und beginnt weder BR-01 noch WP05.

Nach Push folgen unabhängiger technischer Review, Evidence-/UI-Review, gegebenenfalls ein Fix-Commit auf demselben Branch und erst danach ein separater Fast-Forward-Integrationsauftrag.

---

## 9. Owner-Entscheidungen, die noch offen bleiben

1. **Lizenz des öffentlichen Voxel-Labs:** All rights reserved durch fehlende Lizenz, PolyForm Noncommercial, permissive Lizenz oder andere explizite Regel. Keine automatische Entscheidung in dieser Synthese.
2. **Separates Assetpipeline-Repository/Programm:** AP-01 bis AP-10 sind gut definiert, dürfen aber nicht in WP04–WP12 hineingemischt werden.
3. **Zielbrowser außerhalb Chrome/Edge:** Für die spätere Produkt-/WebGPU-Entscheidung muss der Supportscope explizit werden.
4. **Hardwareprofile H1–H3:** Vor blockierenden Performancebudgets müssen konkrete Geräte benannt und kalibriert werden.
5. **Langfristige Produktlizenz-/Contribution-Strategie:** Besonders relevant, bevor Kernelcode zwischen dem unlizenzierten Lab und dem PolyForm-Produkt bewegt wird.

---

## 10. No-Go-Liste aus der Gesamtsynthese

- kein Mesh, Collider oder Rigid Body pro Voxel;
- kein Render-Mesh als Material-, Massen-, Collision- oder Persistenzwahrheit;
- keine dynamischen Trimeshes als Standard für Fragmente;
- kein unbounded Flood Fill oder Meshing auf dem Main Thread;
- keine stale Workeradoption ohne vollständigen Revisionscheck;
- kein globaler SVO/64-Tree als alleinige Planetauthority;
- kein Noise-only-Worldgen;
- kein GLB, RGB oder Instanzindex als Gameplayidentität;
- kein Baked AO in Assetpalette;
- kein Enginewechsel ohne fairen, gepaarten Backend-Spike;
- keine Code-/Shader-/Assetkopie aus GPL-, NC- oder unlizenzierten Quellen;
- keine Produktintegration vor WP12;
- keine visuelle Selbstfreigabe durch Agents.

---

## 11. Abschluss

Die Forschung ist vollständig genug, um ohne weitere Architekturrecherche mit WP04 fortzufahren. Sie ist zugleich eindeutig genug, um spätere Fehlwege zu verhindern: zuerst AO, danach Messgrundlage, dann Worker/Edits, dann fairer Chunk- und Backendvergleich. Welt, Planet, Assets und Physik bleiben in klar beschriebenen, späteren Gates statt erneut in einen monolithischen Prototypen zu fließen.
