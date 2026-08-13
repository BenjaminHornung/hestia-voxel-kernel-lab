# Weltraum-Spiel – Research Register

**Letzte Aktualisierung:** 2026-08-12  
**Kanonischer Voxel-Lab-Research-SHA:** `d95992df05952ac4be6221ca1809c1c9e3c0ac9d`

Dieses Register verfolgt parallele Research-Agenten. Ein Abschlussbericht ist zunächst ein Vorschlag und keine automatisch akzeptierte Architekturentscheidung.

| ID | Forschungsstrang | Status | Eingabe-SHA | Erwartetes Ergebnis | Abhängige Entscheidung |
|---|---|---|---|---|---|
| R01 | Block-AO, Palette, AO-kompatibles Greedy | RUNNING | `d95992df...` | AO-Konvention, Merge-Key, Palette-v1, WP04-Handoff | WP04 |
| R02 | Worker, Scheduler, Revisionen, Adoption | RUNNING | `d95992df...` | Workerprotokoll, bounded Queue, stale rejection, WP05-Handoff | WP05 |
| R03 | WebGPU-/Engine-Bake-off | RUNNING | `d95992df...` | Matrix Raw WebGPU/Three/Babylon/PlayCanvas/wgpu | WP10–WP12 |
| R04 | Voxel-Landschaftsgenerierung | RUNNING | `d95992df...` | Macro/Meso/Micro, Hydrologie, Höhlen, authored Assets | späterer Worldgen-Spike |
| R05 | Destruction, Connectivity, Physik | RUNNING | `d95992df...` | Edit-/Fragment-/Collider-/Physics-Architektur | WP14–WP16 |
| R06 | Open Source und Lizenz-Audit | RUNNING | `d95992df...` | Longlist, Shortlist, Lizenz-/Copy-Risiko | Repo-/Library-Auswahl |
| R07 | Benchmark- und Testmethodik | RUNNING | `d95992df...` | Benchmark Protocol v1, Gates, Rohsample-Schema | WP05/WP08/WP09/WP12 |
| R08 | Planetmaßstab, LOD, Persistenz | RUNNING | `d95992df...` | Multiresolution-Authority, Eventpersistenz, Refinement | Langzeit-Planetarchitektur |
| R09 | Lab → Weltraum-Spiel Integrationsgrenze | RUNNING | `d95992df...` plus aktueller Produkt-SHA | API-, Adapter- und Migrationsgrenzen | spätere Integration |
| R10 | Assetpipeline und visuelle Blockästhetik | RUNNING | `d95992df...` | Asset Contract, Tools, Voxelization, Reviewgates | Asset-/Biome-Pipeline |
| R11 | isolierter Raw-WebGPU-DDA-Spike | NOT STARTED / OPTIONAL | separater Scratch | lauffähiger neutraler DDA-Prototyp | WP10-Vorwissen |

---

## Abschlussdatensatz pro Research-Bericht

Beim Abschluss ist folgender Block auszufüllen:

```text
Agent ID:
Titel:
Status:
Abschlussdatum:
Basis-SHA(s):
Berichtsdatei:
Quellenanzahl:
Primärquellen:
Community-Quellen:
Lizenzrelevante Findings:

Kernaussagen:
1.
2.
3.

Empfohlene Entscheidungen:
1.
2.

Offene Unsicherheiten:
1.
2.

Widersprüche zu anderen Berichten:
1.
2.

Empfohlene nächste kleine Gates:
1.
2.
3.

Projektentscheidung:
PROPOSED / ACCEPTED / REJECTED / DEFERRED

Entscheidungsdatum:
Entscheidungsbegründung:
```

---

## Synthese-Reihenfolge

### Vor WP04

Benötigt:

- R01 Block-AO/Palette;
- optional relevante Findings aus R07 Benchmarkmethodik.

### Vor WP05

Benötigt:

- R02 Worker/Scheduler;
- R07 Benchmarkmethodik;
- integrierter WP04-Stand.

### Vor WP10

Benötigt:

- R03 Engine-Bake-off;
- R07 Benchmarkmethodik;
- Entscheidung, ob R11 als Scratch-Spike ausgeführt wird.

### Vor WP12

Benötigt:

- Ergebnisse WP09–WP11;
- R03;
- R06;
- R07.

### Vor Integration ins Weltraum-Spiel

Benötigt:

- WP12-Entscheidung;
- R09 Integrationsgrenze;
- relevante R05-/R08-Folgen;
- explizite Produktentscheidung.

### Vor Landschafts-/Biome-Arbeit

Benötigt:

- R04 Worldgen;
- R08 Planet-LOD/Persistenz;
- R10 Assetpipeline;
- ein kleines authored Visual Gate;
- keine direkte Rückkehr zum alten großen Surface-Prototyp.
