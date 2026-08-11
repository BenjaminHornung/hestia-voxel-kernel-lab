# Proposal

## Change
`wp02-large-chunk-fixture-world`

## Problem
- WP01 proves a single dense 32³ visible-face volume, but it does not prove signed chunk coordinates, sparse world ownership, cross-chunk face suppression, or browser presentation at the intended fixture-world scale.

## Goal
- Prove that a deterministic sparse map of dense 32^3 chunks can render a 512x128x512-cell browser benchmark world as hard square 0.25 m voxels with halo-correct visible-face seams, one mesh per materialized chunk, shared Three.js presentation, diagnostics, regression coverage, and curated evidence.

## Scope
- Implement WP02 only: signed chunk coordinates and stable fail-closed keys; canonical SparseChunkWorld with defensive dense payloads and 34^3 halo snapshots; exactly nine deterministic technical fixture zones within fixed world bounds and fewer than 256 materialized chunks; synchronous chunk visible-face meshing with local geometry and no seam faces; shared WP01/WP02 Three.js renderer with presets/debug toggles/read-only HUD; separated regular E2E, WP01 evidence, and WP02 evidence including three 1920x1080 PNGs plus manifest; focused units/E2E. Preserve WP01 and all hard block-voxel invariants. Add no dependencies. Exclude WP03+ including greedy meshing, workers, edits, physics, streaming, WebGPU, worldgen/biomes, and Weltraum-Spiel integration.

## Acceptance
- The default and `?lab=wp02` routes render a deterministic 512×128×512-cell, 128×32×128-m benchmark field from fewer than 256 materialized dense 32³ chunks.
- `?lab=wp01` retains the accepted 1,169 occupied / 2,238 quad / 4,476 triangle baseline.
- Cross-chunk halo meshing emits no internal seam faces and remains deterministic and axis-aligned.
- Build, units, two regular E2E runs, separated WP01/WP02 evidence runs, artifact checks, technical review, and final clean verification pass.
