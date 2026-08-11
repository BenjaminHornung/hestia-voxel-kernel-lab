# Capability: large-sparse-chunk-fixture-world

## Requirement
- Prove that a deterministic sparse map of dense 32^3 chunks can render a 512x128x512-cell browser benchmark world as hard square 0.25 m voxels with halo-correct visible-face seams, one mesh per materialized chunk, shared Three.js presentation, diagnostics, regression coverage, and curated evidence.

## Scope
- Implement WP02 only: signed chunk coordinates and stable fail-closed keys; canonical SparseChunkWorld with defensive dense payloads and 34^3 halo snapshots; exactly nine deterministic technical fixture zones within fixed world bounds and fewer than 256 materialized chunks; synchronous chunk visible-face meshing with local geometry and no seam faces; shared WP01/WP02 Three.js renderer with presets/debug toggles/read-only HUD; separated regular E2E, WP01 evidence, and WP02 evidence including three 1920x1080 PNGs plus manifest; focused units/E2E. Preserve WP01 and all hard block-voxel invariants. Add no dependencies. Exclude WP03+ including greedy meshing, workers, edits, physics, streaming, WebGPU, worldgen/biomes, and Weltraum-Spiel integration.

## Scenarios
### Scenario: Signed cells map without ambiguity
- Given integer world cells including -65, -64, -33, -32, -31, -1, 0, 1, 31, 32, 33, 63, 64, and 65
- When cells map to 32³ chunks and positive local cells and then round-trip through stable chunk keys
- Then floor division is used for negatives, locals remain in 0..31, and malformed/non-integer inputs are rejected

### Scenario: Sparse world owns dense chunks
- Given a canonical sparse world with candidate bounds X/Z -8..7 and Y 0..3
- When missing, empty, non-empty, input-payload, and snapshot behavior is exercised
- Then missing reads as air, empty chunks are absent, non-empty chunks are defensive copies, snapshots cannot mutate authority, and materialized count reflects the map rather than 1,024 candidates

### Scenario: Halo removes chunk seams
- Given two full adjacent 32³ chunks and their copied 34³ halo snapshots
- When each inner chunk is synchronously visible-face meshed
- Then combined output is exactly 10,240 quads and 20,480 triangles, no internal X-seam face exists, removing the neighbor restores boundary faces, positions remain local 0..32, and repeated inputs return byte-identical arrays

### Scenario: Benchmark fixture is deterministic and sparse
- Given the fixed world bounds and a fixture seed
- When the builder creates solid-cube, hollow-shell, staircase, hard-voxel-sphere, tunnel, checkerboard, sparse-10-percent, random-50-percent, and multi-component-field zones
- Then exactly nine unique zones and their cell/meter AABBs remain in bounds, at least three cross chunk boundaries, only the seeded sparse/random zones vary with seed, no `Math.random` is used, and fewer than 256 chunks materialize

### Scenario: Browser renders both labs through one path
- Given the production preview
- When `/` or `?lab=wp02` loads
- Then the large world renders with shared materials, at most one terrain mesh per materialized non-empty chunk, local-to-meter chunk transforms, active frustum bounds, aggregated chunk/debug lines, nine zone presets plus overview and seam closeup, and read-only diagnostics
- And `?lab=wp01` retains 32³, 1,169 occupied voxels, 2,238 quads, and 4,476 triangles

### Scenario: Hard voxel presentation remains invariant
- Given any rendered chunk mesh
- When faces, normals, triangle indices, block edges, wireframe, and the hard-voxel-sphere are inspected
- Then faces and normals are axis-aligned, every quad has two triangles, visible block edges contain no triangle diagonals, and no smooth/isosurface/per-voxel-mesh path exists

### Scenario: Regular E2E is evidence-safe
- Given tracked WP01 and WP02 evidence bytes
- When the no-retry regular Playwright suite runs twice in real Google Chrome
- Then screenshots are written only under ignored test output and all tracked evidence hashes remain unchanged

### Scenario: Curated evidence is reproducible
- Given the production preview at 1920×1080, DPR 1, and fixed warm-up
- When WP01 and WP02 evidence scripts run separately
- Then WP01 emits only its baseline, WP02 emits overview/seam/checkerboard PNGs plus a parseable manifest containing the accepted basis, dimensions, zones, fixture/world hash, counts, presets, PNG dimensions/SHA-256, and diagnostic classification

### Scenario: Invalid lab selection fails closed
- Given duplicated, unsupported, or inconsistent `lab` query values
- When application composition parses the route
- Then it does not silently select a different fixture and reports a visible initialization error
