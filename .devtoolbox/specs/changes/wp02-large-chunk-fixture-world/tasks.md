# Tasks

## Phase 1 - Discovery and Contract
- [ ] Confirm exact integration basis, isolated branch/worktree, repository rules, WP01 architecture, and review checklist
- [ ] Validate proposal, design, behavioral spec, and this execution plan

## Phase 2 - Integer Chunk Core
- [ ] Implement voxel size/world bounds, signed chunk mapping, stable fail-closed keys, sparse dense-chunk ownership, and defensive snapshots
- [ ] Implement 34³ halo snapshots and deterministic local chunk visible-face output while preserving the WP01 wrapper
- [ ] Add focused coordinate, sparse-world, halo, seam, locality, normal, and byte-determinism unit tests

## Phase 3 - Deterministic Fixture
- [ ] Implement exactly nine bounded technical zones and metadata in the fixed 512×128×512 world
- [ ] Add fixture bounds, seed-isolation, hash determinism, sparse-count, and no-`Math.random` tests

## Phase 4 - Shared Browser Presentation
- [ ] Route WP01 and WP02 through one Three.js multi-chunk renderer with shared materials and full disposal
- [ ] Add overview/zone/seam presets, active-zone display, block-edge/chunk-bound/wireframe/normal controls, and read-only telemetry HUD
- [ ] Preserve hard block edges, axis normals, local chunk transforms, frustum bounds, and one mesh per materialized non-empty chunk

## Phase 5 - Browser Tests and Evidence
- [ ] Separate regular, WP01 evidence, and WP02 evidence tags/scripts without dependency or lockfile changes
- [ ] Add WP01 route regression and WP02 functional E2E with error traps, camera/control checks, and test-output-only screenshots
- [ ] Generate three curated 1920×1080 WP02 PNGs and manifest with fixture/world/artifact hashes and diagnostics

## Phase 6 - Review, Verification, and Handoff
- [ ] Run install/build/units, two regular E2E runs with tracked-evidence hash comparison, both evidence runs, artifact validation, and diff/status checks
- [ ] Resolve focused technical review and final human Plannotator review findings, then rerun affected verification
- [ ] Commit `#VOXEL-LAB-002 Add large sparse chunk fixture world`, run the fresh post-commit suite, push only the agent branch, and report exact evidence
