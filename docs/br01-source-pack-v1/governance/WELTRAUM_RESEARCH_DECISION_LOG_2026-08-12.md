# Weltraum-Spiel – Research Decision Log

**Datum:** 2026-08-12  
**Basis:** Voxel-Lab `d95992df05952ac4be6221ca1809c1c9e3c0ac9d`  
**Scope:** Entscheidungen aus R01–R10; keine Implementierung.

Statuswerte: `ACCEPTED`, `ACCEPTED_FOR_LATER`, `REQUIRES_SPIKE`, `DEFERRED`, `REJECTED`, `OWNER_DECISION_REQUIRED`.

| ID | Status | Entscheidung | Wirksam ab | Quellen |
|---|---|---|---|---|
| D-001 | ACCEPTED | Browser-/Chromium-first, harte Blockvoxels und CPU-Zellauthority bleiben bestehen. | sofort | R01–R10 |
| D-002 | ACCEPTED | WP04 verwendet diskrete AO-Stufen 0..3, AO4 im Merge-Key, deterministische Diagonale und Palette-v1. | WP04 | R01, R07 |
| D-003 | ACCEPTED | WP04-Palette bleibt Render/AO-orientiert; physische Materialwerte kommen später aus separatem Katalog. | sofort | R01, R05, R10 |
| D-004 | ACCEPTED | Benchmark Protocol v1 und Rohsample-/Provenienzregeln gelten; aktuelle HUD-Zeiten bleiben Diagnostik. | sofort | R07 |
| D-005 | ACCEPTED | BR-01 bis BR-04 werden zwischen WP04 und WP05 eingefügt; BR-05 vor WP08, BR-06 vor WP12. | Roadmap | R07, R02 |
| D-006 | ACCEPTED_FOR_LATER | WP05 startet mit einem Module Worker, Queue 128, einem In-flight-Request, Transferables und stale rejection. | nach BR-04 | R02, R07 |
| D-007 | ACCEPTED | Kein Enginewechsel jetzt. Raw WebGPU ist WP10-Primärspike, Three WebGPU/TSL der zweite Kandidat. | WP10/WP12 | R03, R07 |
| D-008 | REJECTED | PlayCanvas 2.21.3 als WP10-Volume-DDA-Kandidat. | versionsgebunden | R03 |
| D-009 | DEFERRED | Rust/wgpu/WASM oder Bevy als Produktpfad ohne nachgewiesenen Bedarf. | frühestens WP12/13 | R03, R06 |
| D-010 | ACCEPTED | Keine Lab→Produkt-Integration vor WP12; später rendererneutrales Kernel-Package/Testkit und read-only Fixture Slice. | sofort | R09 |
| D-011 | ACCEPTED | Fehlende Produktnachbarn dürfen ohne Coverage-Vertrag nicht als Air behandelt werden; die Lab-Fixture-Regel bleibt lokal bestehen. | spätere Integration | R09, R02 |
| D-012 | ACCEPTED | `0,25 m` bleibt v1-Referenz; `0,125 m` nur explizite lokale Forschungsdomäne. | sofort | R10, R08 |
| D-013 | ACCEPTED | Lizenz-/Provenienzmanifest für jede echte Übernahme; GPL/NC/unlizenziert nicht kopieren. | sofort | R06, R09, R10 |
| D-014 | OWNER_DECISION_REQUIRED | Explizite Lizenz für `hestia-voxel-kernel-lab`. | vor Release/Contribution/Transfer | R01–R10, besonders R06/R09 |
| D-015 | REQUIRES_SPIKE | Worldgen: Featuregraph + hydrologische 2,5D-Felder + lokale 3D-Operatoren. | separates späteres Programm | R04, R10 |
| D-016 | REQUIRES_SPIKE | Planet: Cube-Sphere + Generator + Eventlog + Brick-Checkpoints. | langfristig | R08 |
| D-017 | REJECTED | Globaler dynamischer SVO/64-Tree als alleinige Planetauthority. | dauerhaft, bis neue Evidenz | R08, R06 |
| D-018 | ACCEPTED_FOR_LATER | Zerstörung: globale Terrainchunks + objektlokale Voxelvolumen, Face-6, atomarer Transfer. | WP14–WP16 | R05, R08, R10 |
| D-019 | ACCEPTED_FOR_LATER | Rapier ist erster Browser-Physikspike; greedy 3D-Cuboids sind Baseline. | WP16 | R05, R06 |
| D-020 | DEFERRED | Jolt oder Rapier-Voxelshape als Produktpfad. | nur bei belegtem Vergleichsbedarf | R05 |
| D-021 | REQUIRES_SPIKE | Assetpipeline: HVOX v1 + Asset Contract v1; GLB nur Proxy/Preview. | separates AP-Programm | R10, R04, R09 |
| D-022 | ACCEPTED | Human Review bleibt zwingend für Art Direction; Metriken sind Regression/Warnings. | sofort | R04, R10 |
| D-023 | DEFERRED | Optionaler früher R11-Scratchspike. Seine Fragestellung wird in WP10 bearbeitet. | WP10 | R03, R07 |

---

## Erläuterungen zu den wichtigsten Entscheidungen

### D-002: WP04

Der AO-Vertrag ist hinreichend präzise, um ohne neue Forschungsrunde implementiert zu werden. Die kritischen Korrektheitspunkte sind Vertexreihenfolge, weltkoordinatenbasierte AO-Samples, AO4-Merge-Key, Diagonalwahl und Seam-Oracles. AO-Dunkelheit `0,60` ist eine visuelle Startkonstante und benötigt Owner-Review, aber keine Architekturdiskussion.

### D-005: Benchmarkfolge

Die alte Roadmap sprang direkt von WP04 zu WP05. R07 zeigt, dass Queue-Drain, Long Tasks, Adoption und spätere A/B-Vergleiche ohne Rohsample-, Environment- und Aggregationsvertrag nicht belastbar sind. BR-01 bis BR-04 sind daher kein optionales Nice-to-have, sondern die Messgrenze für WP05.

### D-010: Integration

Das Hauptspiel besitzt bereits eine geeignete Presentation-Grenze, aber mehrere konkurrierende Voxelpfade. Eine frühe Übernahme würde die Authorityfrage verschärfen. Der erste spätere Schritt ist deshalb absichtlich read-only und fixturegebunden.

### D-015/D-016/D-021

Diese drei Richtungen sind stark genug, um als bevorzugte Forschungsarchitekturen festgehalten zu werden, aber zu groß und zu risikoreich für eine direkte Produktfreigabe. Ihre Stop-Gates sind Teil der Entscheidung.

---

## Änderungsregel

Eine Entscheidung in diesem Log wird nicht still überschrieben. Änderungen erhalten einen neuen Eintrag mit `SUPERSEDES D-xxx`, Datum, Evidenz und betroffenen Golden-/Schema-Versionen.
