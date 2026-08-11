# Design

## Change
`wp02-large-chunk-fixture-world`

## Goal
- Prove that a deterministic sparse map of dense 32^3 chunks can render a 512x128x512-cell browser benchmark world as hard square 0.25 m voxels with halo-correct visible-face seams, one mesh per materialized chunk, shared Three.js presentation, diagnostics, regression coverage, and curated evidence.

## Scope
- Implement WP02 only: signed chunk coordinates and stable fail-closed keys; canonical SparseChunkWorld with defensive dense payloads and 34^3 halo snapshots; exactly nine deterministic technical fixture zones within fixed world bounds and fewer than 256 materialized chunks; synchronous chunk visible-face meshing with local geometry and no seam faces; shared WP01/WP02 Three.js renderer with presets/debug toggles/read-only HUD; separated regular E2E, WP01 evidence, and WP02 evidence including three 1920x1080 PNGs plus manifest; focused units/E2E. Preserve WP01 and all hard block-voxel invariants. Add no dependencies. Exclude WP03+ including greedy meshing, workers, edits, physics, streaming, WebGPU, worldgen/biomes, and Weltraum-Spiel integration.

## Architecture Notes
- Keep CPU occupancy authoritative. `SparseChunkWorld` owns a `Map<ChunkKey, DenseVoxelVolume>`; missing and empty chunks read as air, while constructor/set inputs and snapshots are copied.
- Keep integer cells through world, chunk, fixture, and mesher code. Convert to meters only on Three.js chunk object transforms using `VOXEL_SIZE_METERS = 0.25`.
- Add pure signed world-cell/chunk/local and stable-key conversions at the coordinate boundary. Reject malformed keys and non-integer coordinates rather than rewriting them.
- Copy each 34³ halo from the sparse world. The mesher traverses only the inner 32³ cells, reads neighbors from the halo, and returns local chunk geometry plus chunk identity and counts.
- Preserve `meshVisibleFaces(DenseVoxelVolume)` as the WP01 compatibility wrapper over the same halo-capable meshing logic.
- Build exactly nine deterministic fixture zones with fixed integer formulas and a seeded integer hash only for the designated sparse/random zones. Keep worst-case zones bounded and empty space sparse.
- Feed both labs through one renderer using an array of chunk mesh products, shared materials, one terrain mesh per materialized non-empty chunk, and aggregated debug line geometry. Renderer inputs are snapshots/results and expose no world mutator.
- Use route composition in `main.ts`: no `lab` means WP02, exactly `wp01` or `wp02` selects that lab, and malformed/duplicate values fail closed to a visible error.
- Evidence tests are the sole writers of tracked evidence. Regular E2E writes only beneath ignored Playwright output paths.

## Risks
- Checkerboard and random faces can inflate geometry and frame time; constrain those zone AABBs, never the required world bounds or zone set.
- Halo indexing or signed floor/modulo errors can create duplicate or missing seam faces; lock them with exact boundary and two-full-chunk counts.
- Three.js edge generation can accidentally expose triangle diagonals; derive only the four real edges of each emitted quad.
- Browser rendering may allocate many duplicated debug vertices; debug geometry remains aggregated and presentation-only.
- Evidence manifests cannot contain their own final commit hash without self-reference; record the accepted basis SHA and content hashes only.

## Safe Stop
- Stop on base drift, WP01 regression, package-lock drift, more than 255 materialized chunks, evidence mutation during regular E2E, unavailable real Chrome E2E, or any need for WP03+ systems.
