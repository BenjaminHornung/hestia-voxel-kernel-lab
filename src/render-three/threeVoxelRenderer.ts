import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DirectionalLight,
  HemisphereLight,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshLambertMaterial,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { MemoryDiagnostics, NeutralMeshMemory, SceneMemoryDiagnostics } from '../diagnostics/memory';
import { FrameIntervalTelemetry, type DurationSummary } from '../diagnostics/telemetry';
import { VOLUME_SIZE, VoxelMaterial } from '../voxel/constants';
import { MATERIAL_COLORS } from '../voxel/palette';
import type { ChunkVisibleFaceMesh, MesherMode, Vec3, VisibleFaceMesh } from '../voxel/types';
import { createWorldEdgePositions } from './worldEdgeAggregation';

export interface RendererCameraPreset {
  readonly id: string;
  readonly label: string;
  readonly positionMeters: Vec3;
  readonly targetMeters: Vec3;
  readonly zoneId: string | null;
}

export interface MesherStatistics {
  readonly mesherMode: MesherMode;
  readonly coveredUnitFaces: number;
  readonly quadCount: number;
  readonly triangleCount: number;
  readonly memory: NeutralMeshMemory;
  readonly timing: DurationSummary;
}

export interface MesherComparison {
  readonly visible: MesherStatistics;
  readonly greedy: MesherStatistics;
  readonly quadReduction: { readonly absolute: number; readonly percent: number };
  readonly triangleReduction: { readonly absolute: number; readonly percent: number };
  readonly neutralMeshByteReduction: { readonly absolute: number; readonly percent: number };
}

export interface VoxelLabScene {
  readonly lab: 'wp01' | 'wp02' | 'wp03';
  readonly mesherMode: MesherMode;
  readonly sceneLabel: string;
  readonly voxelSizeMeters: number;
  readonly worldCells: Vec3;
  readonly worldMeters: Vec3;
  readonly chunkEdge: number;
  readonly candidateChunks: number;
  readonly materializedChunks: number;
  readonly occupiedVoxels: number;
  readonly fixtureBuildDurationMs: number;
  readonly haloTiming: DurationSummary;
  readonly meshTiming: DurationSummary;
  readonly chunks: readonly ChunkVisibleFaceMesh[];
  readonly coveredUnitFaces: number;
  readonly comparison: MesherComparison | null;
  readonly blockEdgePositions?: Float32Array;
  readonly meshQuadEdgePositions?: Float32Array;
  readonly cameraPresets: readonly RendererCameraPreset[];
  readonly zoneCount: number;
  readonly worldHash: string;
  readonly memory: SceneMemoryDiagnostics;
}

interface HudElements {
  readonly lab: HTMLElement;
  readonly renderer: HTMLElement;
  readonly volume: HTMLElement;
  readonly worldMeters: HTMLElement;
  readonly voxelSize: HTMLElement;
  readonly chunkEdge: HTMLElement;
  readonly candidateChunks: HTMLElement;
  readonly materializedChunks: HTMLElement;
  readonly occupied: HTMLElement;
  readonly quads: HTMLElement;
  readonly quadsLabel: HTMLElement;
  readonly triangles: HTMLElement;
  readonly activeMesher: HTMLElement;
  readonly worldHash: HTMLElement;
  readonly coveredUnitFaces: HTMLElement;
  readonly visibleQuads: HTMLElement;
  readonly greedyQuads: HTMLElement;
  readonly quadReduction: HTMLElement;
  readonly visibleTriangles: HTMLElement;
  readonly greedyTriangles: HTMLElement;
  readonly triangleReduction: HTMLElement;
  readonly visibleMeshBytes: HTMLElement;
  readonly greedyMeshBytes: HTMLElement;
  readonly meshByteReduction: HTMLElement;
  readonly visibleMeshing: HTMLElement;
  readonly greedyMeshing: HTMLElement;
  readonly activeFilledMeshSets: HTMLElement;
  readonly residentChunkMeshes: HTMLElement;
  readonly drawCalls: HTMLElement;
  readonly fixtureBuild: HTMLElement;
  readonly haloTotal: HTMLElement;
  readonly haloP50: HTMLElement;
  readonly haloP95: HTMLElement;
  readonly meshTotal: HTMLElement;
  readonly meshP50: HTMLElement;
  readonly meshP95: HTMLElement;
  readonly current: HTMLElement;
  readonly p50: HTMLElement;
  readonly p95: HTMLElement;
  readonly activePreset: HTMLElement;
  readonly activeZone: HTMLElement;
  readonly candidateDenseVoxelBytes: HTMLElement;
  readonly materializedVoxelPayloadBytes: HTMLElement;
  readonly chunkMetadataBytesEstimate: HTMLElement;
  readonly haloBytesPerSnapshot: HTMLElement;
  readonly haloBytesTotalProcessed: HTMLElement;
  readonly meshPositionBytes: HTMLElement;
  readonly meshNormalBytes: HTMLElement;
  readonly meshIndexBytes: HTMLElement;
  readonly meshMaterialIdBytes: HTMLElement;
  readonly meshTotalBytes: HTMLElement;
  readonly debugEdgeBytes: HTMLElement;
  readonly debugMeshQuadEdgeBytes: HTMLElement;
  readonly debugNormalBytes: HTMLElement;
  readonly debugChunkBoundsBytes: HTMLElement;
  readonly colorAttributeBytes: HTMLElement;
  readonly gpuMemoryBytes: HTMLElement;
  readonly status: HTMLElement;
}

function requiredElement<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Required element not found: ${selector}`);
  }
  return element;
}

function createNormalPositions(mesh: VisibleFaceMesh): Float32Array {
  const lines = new Float32Array(mesh.quadCount * 6);
  for (let quad = 0; quad < mesh.quadCount; quad += 1) {
    const vertexOffset = quad * 12;
    const lineOffset = quad * 6;
    for (let axis = 0; axis < 3; axis += 1) {
      const center = (
        mesh.positions[vertexOffset + axis]!
        + mesh.positions[vertexOffset + 3 + axis]!
        + mesh.positions[vertexOffset + 6 + axis]!
        + mesh.positions[vertexOffset + 9 + axis]!
      ) / 4;
      lines[lineOffset + axis] = center;
      lines[lineOffset + 3 + axis] = center + mesh.normals[vertexOffset + axis]! * 0.28;
    }
  }
  return lines;
}

export function createWorldNormalPositions(
  chunks: readonly ChunkVisibleFaceMesh[],
  voxelSizeMeters: number,
): Float32Array {
  const positions: number[] = [];
  for (const chunk of chunks) {
    const localPositions = createNormalPositions(chunk);
    const origin = [
      chunk.coord.x * VOLUME_SIZE * voxelSizeMeters,
      chunk.coord.y * VOLUME_SIZE * voxelSizeMeters,
      chunk.coord.z * VOLUME_SIZE * voxelSizeMeters,
    ];
    for (let offset = 0; offset < localPositions.length; offset += 3) {
      positions.push(
        localPositions[offset]! * voxelSizeMeters + origin[0]!,
        localPositions[offset + 1]! * voxelSizeMeters + origin[1]!,
        localPositions[offset + 2]! * voxelSizeMeters + origin[2]!,
      );
    }
  }
  return new Float32Array(positions);
}

function createChunkBoundsPositions(chunks: readonly ChunkVisibleFaceMesh[], voxelSizeMeters: number): Float32Array {
  const positions: number[] = [];
  const edges = [[0, 1], [1, 3], [3, 2], [2, 0], [4, 5], [5, 7], [7, 6], [6, 4], [0, 4], [1, 5], [2, 6], [3, 7]] as const;
  for (const chunk of chunks) {
    const minX = chunk.coord.x * VOLUME_SIZE * voxelSizeMeters;
    const minY = chunk.coord.y * VOLUME_SIZE * voxelSizeMeters;
    const minZ = chunk.coord.z * VOLUME_SIZE * voxelSizeMeters;
    const maxX = minX + VOLUME_SIZE * voxelSizeMeters;
    const maxY = minY + VOLUME_SIZE * voxelSizeMeters;
    const maxZ = minZ + VOLUME_SIZE * voxelSizeMeters;
    const corners = [
      [minX, minY, minZ], [maxX, minY, minZ], [minX, maxY, minZ], [maxX, maxY, minZ],
      [minX, minY, maxZ], [maxX, minY, maxZ], [minX, maxY, maxZ], [maxX, maxY, maxZ],
    ] as const;
    for (const [start, end] of edges) {
      positions.push(...corners[start], ...corners[end]);
    }
  }
  return new Float32Array(positions);
}

function createVertexColors(materialIds: Uint8Array): Float32Array {
  const colors = new Float32Array(materialIds.length * 3);
  const color = new Color();
  for (let vertex = 0; vertex < materialIds.length; vertex += 1) {
    const material = materialIds[vertex] as Exclude<VoxelMaterial, VoxelMaterial.Air>;
    color.setHex(MATERIAL_COLORS[material]);
    colors[vertex * 3] = color.r;
    colors[vertex * 3 + 1] = color.g;
    colors[vertex * 3 + 2] = color.b;
  }
  return colors;
}

export class ThreeVoxelRenderer {
  readonly #root: HTMLElement;
  readonly #canvas: HTMLCanvasElement;
  readonly #renderer: WebGLRenderer;
  readonly #camera: PerspectiveCamera;
  readonly #controls: OrbitControls;
  readonly #meshGeometries: BufferGeometry[] = [];
  readonly #meshMaterial: MeshLambertMaterial;
  readonly #voxelMeshes: Mesh[] = [];
  readonly #edgeGeometry: BufferGeometry;
  readonly #edgeMaterial: LineBasicMaterial;
  readonly #edgeLines: LineSegments;
  readonly #meshQuadEdgeGeometry: BufferGeometry;
  readonly #meshQuadEdgeMaterial: LineBasicMaterial;
  readonly #meshQuadEdgeLines: LineSegments;
  readonly #normalGeometry: BufferGeometry;
  readonly #normalMaterial: LineBasicMaterial;
  readonly #normalLines: LineSegments;
  readonly #chunkBoundsGeometry: BufferGeometry;
  readonly #chunkBoundsMaterial: LineBasicMaterial;
  readonly #chunkBoundsLines: LineSegments;
  readonly #hud: HudElements;
  readonly #telemetry = new FrameIntervalTelemetry();
  readonly #wireframeToggle: HTMLInputElement;
  readonly #blockEdgeToggle: HTMLInputElement;
  readonly #meshQuadEdgeToggle: HTMLInputElement;
  readonly #normalToggle: HTMLInputElement;
  readonly #chunkBoundsToggle: HTMLInputElement;
  readonly #cameraPresetSelect: HTMLSelectElement;
  readonly #mesherSelect: HTMLSelectElement;
  readonly #cameraPresets: readonly RendererCameraPreset[];
  readonly #resetButton: HTMLButtonElement;
  readonly #resize = (): void => this.resize();
  readonly #toggleWireframe = (): void => {
    for (const mesh of this.#voxelMeshes) {
      mesh.visible = !this.#wireframeToggle.checked;
    }
    this.#edgeLines.visible = this.#wireframeToggle.checked || this.#blockEdgeToggle.checked;
    this.#meshQuadEdgeLines.visible = !this.#wireframeToggle.checked && this.#meshQuadEdgeToggle.checked;
  };
  readonly #toggleBlockEdges = (): void => {
    this.#edgeLines.visible = this.#wireframeToggle.checked || this.#blockEdgeToggle.checked;
  };
  readonly #toggleMeshQuadEdges = (): void => {
    this.#meshQuadEdgeLines.visible = !this.#wireframeToggle.checked && this.#meshQuadEdgeToggle.checked;
  };
  readonly #toggleNormals = (): void => {
    this.#normalLines.visible = this.#normalToggle.checked;
  };
  readonly #toggleChunkBounds = (): void => {
    this.#chunkBoundsLines.visible = this.#chunkBoundsToggle.checked;
  };
  readonly #changeCameraPreset = (): void => this.applyCameraPreset(this.#cameraPresetSelect.value);
  readonly #changeMesher = (): void => {
    const target = new URL(window.location.href);
    target.search = new URLSearchParams({ lab: 'wp03', mesher: this.#mesherSelect.value }).toString();
    window.location.assign(target);
  };
  readonly #keyboardCameraPreset = (event: KeyboardEvent): void => {
    if (event.key === 'Home') {
      event.preventDefault();
      this.#controls.reset();
      return;
    }
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
      return;
    }
    event.preventDefault();
    const current = this.#cameraPresets.findIndex(({ id }) => id === this.#cameraPresetSelect.value);
    const direction = event.key === 'ArrowRight' ? 1 : -1;
    const next = (current + direction + this.#cameraPresets.length) % this.#cameraPresets.length;
    this.applyCameraPreset(this.#cameraPresets[next]!.id);
  };
  readonly #resetCamera = (): void => this.#controls.reset();
  #animationFrame = 0;
  #lastFrameTime = 0;
  #disposed = false;

  constructor(root: HTMLElement, data: VoxelLabScene) {
    this.#root = root;
    const canvas = requiredElement<HTMLCanvasElement>(root, '[data-testid="voxel-canvas"]');
    this.#canvas = canvas;
    const context = canvas.getContext('webgl2', { antialias: true, alpha: false });
    if (!context) {
      throw new Error('WebGL2 is required for the visible-face lab.');
    }

    this.#renderer = new WebGLRenderer({ canvas, context, antialias: true });
    this.#renderer.outputColorSpace = SRGBColorSpace;
    this.#renderer.setClearColor(0xe9edf0, 1);
    this.#renderer.setPixelRatio(window.devicePixelRatio);

    const scene = new Scene();
    this.#camera = new PerspectiveCamera(42, 1, 0.05, 500);
    this.#meshMaterial = new MeshLambertMaterial({
      vertexColors: true,
      flatShading: true,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    });

    let colorAttributeBytes = 0;
    for (const chunk of data.chunks) {
      if (chunk.quadCount === 0) {
        continue;
      }
      const geometry = new BufferGeometry();
      geometry.setAttribute('position', new BufferAttribute(chunk.positions, 3));
      geometry.setAttribute('normal', new BufferAttribute(chunk.normals, 3));
      const colors = createVertexColors(chunk.materialIds);
      colorAttributeBytes += colors.byteLength;
      geometry.setAttribute('color', new BufferAttribute(colors, 3));
      geometry.setIndex(new BufferAttribute(chunk.indices, 1));
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      const mesh = new Mesh(geometry, this.#meshMaterial);
      mesh.position.set(
        chunk.coord.x * VOLUME_SIZE * data.voxelSizeMeters,
        chunk.coord.y * VOLUME_SIZE * data.voxelSizeMeters,
        chunk.coord.z * VOLUME_SIZE * data.voxelSizeMeters,
      );
      mesh.scale.setScalar(data.voxelSizeMeters);
      scene.add(mesh);
      this.#meshGeometries.push(geometry);
      this.#voxelMeshes.push(mesh);
    }

    const edgePositions = data.blockEdgePositions ?? createWorldEdgePositions(data.chunks, data.voxelSizeMeters);
    const meshQuadEdgePositions = data.meshQuadEdgePositions ?? new Float32Array();
    const normalPositionArray = createWorldNormalPositions(data.chunks, data.voxelSizeMeters);
    this.#edgeGeometry = new BufferGeometry();
    this.#edgeGeometry.setAttribute('position', new BufferAttribute(edgePositions, 3));
    this.#edgeMaterial = new LineBasicMaterial({ color: 0x111820, transparent: true, opacity: 0.88 });
    this.#edgeLines = new LineSegments(this.#edgeGeometry, this.#edgeMaterial);
    scene.add(this.#edgeLines);

    this.#meshQuadEdgeGeometry = new BufferGeometry();
    this.#meshQuadEdgeGeometry.setAttribute('position', new BufferAttribute(meshQuadEdgePositions, 3));
    this.#meshQuadEdgeMaterial = new LineBasicMaterial({ color: 0x6d28d9 });
    this.#meshQuadEdgeLines = new LineSegments(this.#meshQuadEdgeGeometry, this.#meshQuadEdgeMaterial);
    this.#meshQuadEdgeLines.visible = false;
    scene.add(this.#meshQuadEdgeLines);

    this.#normalGeometry = new BufferGeometry();
    this.#normalGeometry.setAttribute('position', new BufferAttribute(normalPositionArray, 3));
    this.#normalMaterial = new LineBasicMaterial({ color: 0xa33d0b });
    this.#normalLines = new LineSegments(this.#normalGeometry, this.#normalMaterial);
    this.#normalLines.visible = false;
    scene.add(this.#normalLines);

    this.#chunkBoundsGeometry = new BufferGeometry();
    const chunkBoundsPositions = createChunkBoundsPositions(data.chunks, data.voxelSizeMeters);
    const memory: MemoryDiagnostics = {
      ...data.memory,
      debugEdgeBytes: edgePositions.byteLength,
      debugMeshQuadEdgeBytes: meshQuadEdgePositions.byteLength,
      debugNormalBytes: normalPositionArray.byteLength,
      debugChunkBoundsBytes: chunkBoundsPositions.byteLength,
      colorAttributeBytes,
      gpuMemoryBytes: null,
    };
    this.#chunkBoundsGeometry.setAttribute('position', new BufferAttribute(chunkBoundsPositions, 3));
    this.#chunkBoundsMaterial = new LineBasicMaterial({ color: 0x246b91, transparent: true, opacity: 0.78 });
    this.#chunkBoundsLines = new LineSegments(this.#chunkBoundsGeometry, this.#chunkBoundsMaterial);
    this.#chunkBoundsLines.visible = false;
    scene.add(this.#chunkBoundsLines);

    scene.add(new HemisphereLight(0xd9e5f2, 0x35302a, 2.25));
    const keyLight = new DirectionalLight(0xffffff, 2.8);
    keyLight.position.set(-48, 72, 38);
    scene.add(keyLight);

    this.#controls = new OrbitControls(this.#camera, canvas);
    this.#controls.minDistance = 1.5;
    this.#controls.maxDistance = 300;

    this.#wireframeToggle = requiredElement<HTMLInputElement>(root, '[data-testid="wireframe-toggle"]');
    this.#blockEdgeToggle = requiredElement<HTMLInputElement>(root, '[data-testid="block-edge-toggle"]');
    this.#meshQuadEdgeToggle = requiredElement<HTMLInputElement>(root, '[data-testid="mesh-quad-edge-toggle"]');
    this.#normalToggle = requiredElement<HTMLInputElement>(root, '[data-testid="normal-toggle"]');
    this.#chunkBoundsToggle = requiredElement<HTMLInputElement>(root, '[data-testid="chunk-bounds-toggle"]');
    this.#cameraPresetSelect = requiredElement<HTMLSelectElement>(root, '[data-testid="camera-preset"]');
    this.#mesherSelect = requiredElement<HTMLSelectElement>(root, '[data-testid="mesher-select"]');
    this.#cameraPresets = data.cameraPresets;
    this.#resetButton = requiredElement<HTMLButtonElement>(root, '[data-testid="camera-reset"]');
    this.#hud = {
      lab: requiredElement(root, '[data-testid="metric-lab"]'),
      renderer: requiredElement(root, '[data-testid="metric-renderer"]'),
      volume: requiredElement(root, '[data-testid="metric-volume"]'),
      worldMeters: requiredElement(root, '[data-testid="metric-world-meters"]'),
      voxelSize: requiredElement(root, '[data-testid="metric-voxel-size"]'),
      chunkEdge: requiredElement(root, '[data-testid="metric-chunk-edge"]'),
      candidateChunks: requiredElement(root, '[data-testid="metric-candidate-chunks"]'),
      materializedChunks: requiredElement(root, '[data-testid="metric-materialized-chunks"]'),
      occupied: requiredElement(root, '[data-testid="metric-occupied"]'),
      quads: requiredElement(root, '[data-testid="metric-quads"]'),
      quadsLabel: requiredElement(root, '[data-testid="metric-quads-label"]'),
      triangles: requiredElement(root, '[data-testid="metric-triangles"]'),
      activeMesher: requiredElement(root, '[data-testid="metric-active-mesher"]'),
      worldHash: requiredElement(root, '[data-testid="metric-world-hash"]'),
      coveredUnitFaces: requiredElement(root, '[data-testid="metric-covered-unit-faces"]'),
      visibleQuads: requiredElement(root, '[data-testid="metric-visible-quads"]'),
      greedyQuads: requiredElement(root, '[data-testid="metric-greedy-quads"]'),
      quadReduction: requiredElement(root, '[data-testid="metric-quad-reduction"]'),
      visibleTriangles: requiredElement(root, '[data-testid="metric-visible-triangles"]'),
      greedyTriangles: requiredElement(root, '[data-testid="metric-greedy-triangles"]'),
      triangleReduction: requiredElement(root, '[data-testid="metric-triangle-reduction"]'),
      visibleMeshBytes: requiredElement(root, '[data-testid="metric-visible-mesh-bytes"]'),
      greedyMeshBytes: requiredElement(root, '[data-testid="metric-greedy-mesh-bytes"]'),
      meshByteReduction: requiredElement(root, '[data-testid="metric-mesh-byte-reduction"]'),
      visibleMeshing: requiredElement(root, '[data-testid="metric-visible-meshing"]'),
      greedyMeshing: requiredElement(root, '[data-testid="metric-greedy-meshing"]'),
      activeFilledMeshSets: requiredElement(root, '[data-testid="metric-active-filled-mesh-sets"]'),
      residentChunkMeshes: requiredElement(root, '[data-testid="metric-resident-chunk-meshes"]'),
      drawCalls: requiredElement(root, '[data-testid="metric-draw-calls"]'),
      fixtureBuild: requiredElement(root, '[data-testid="metric-fixture-build"]'),
      haloTotal: requiredElement(root, '[data-testid="metric-halo-total"]'),
      haloP50: requiredElement(root, '[data-testid="metric-halo-p50"]'),
      haloP95: requiredElement(root, '[data-testid="metric-halo-p95"]'),
      meshTotal: requiredElement(root, '[data-testid="metric-mesh-total"]'),
      meshP50: requiredElement(root, '[data-testid="metric-mesh-p50"]'),
      meshP95: requiredElement(root, '[data-testid="metric-mesh-p95"]'),
      current: requiredElement(root, '[data-testid="metric-frame-current"]'),
      p50: requiredElement(root, '[data-testid="metric-frame-p50"]'),
      p95: requiredElement(root, '[data-testid="metric-frame-p95"]'),
      activePreset: requiredElement(root, '[data-testid="metric-active-preset"]'),
      activeZone: requiredElement(root, '[data-testid="active-zone"]'),
      candidateDenseVoxelBytes: requiredElement(root, '[data-testid="metric-candidate-dense-voxel-bytes"]'),
      materializedVoxelPayloadBytes: requiredElement(root, '[data-testid="metric-materialized-voxel-payload-bytes"]'),
      chunkMetadataBytesEstimate: requiredElement(root, '[data-testid="metric-chunk-metadata-bytes-estimate"]'),
      haloBytesPerSnapshot: requiredElement(root, '[data-testid="metric-halo-bytes-per-snapshot"]'),
      haloBytesTotalProcessed: requiredElement(root, '[data-testid="metric-halo-bytes-total-processed"]'),
      meshPositionBytes: requiredElement(root, '[data-testid="metric-mesh-position-bytes"]'),
      meshNormalBytes: requiredElement(root, '[data-testid="metric-mesh-normal-bytes"]'),
      meshIndexBytes: requiredElement(root, '[data-testid="metric-mesh-index-bytes"]'),
      meshMaterialIdBytes: requiredElement(root, '[data-testid="metric-mesh-material-id-bytes"]'),
      meshTotalBytes: requiredElement(root, '[data-testid="metric-mesh-total-bytes"]'),
      debugEdgeBytes: requiredElement(root, '[data-testid="metric-debug-edge-bytes"]'),
      debugMeshQuadEdgeBytes: requiredElement(root, '[data-testid="metric-debug-mesh-quad-edge-bytes"]'),
      debugNormalBytes: requiredElement(root, '[data-testid="metric-debug-normal-bytes"]'),
      debugChunkBoundsBytes: requiredElement(root, '[data-testid="metric-debug-chunk-bounds-bytes"]'),
      colorAttributeBytes: requiredElement(root, '[data-testid="metric-renderer-color-attribute-bytes"]'),
      gpuMemoryBytes: requiredElement(root, '[data-testid="metric-gpu-memory-bytes"]'),
      status: requiredElement(root, '[data-testid="app-status"]'),
    };

    const quads = data.chunks.reduce((total, chunk) => total + chunk.quadCount, 0);
    const triangles = data.chunks.reduce((total, chunk) => total + chunk.triangleCount, 0);
    const formatVec = (value: Vec3): string => value.join(' × ');
    const formatDuration = (value: number): string => `${value.toFixed(1)} ms`;
    const formatBytes = (value: number): string => `${value.toLocaleString('en-US')} B`;
    const formatReduction = ({ absolute, percent }: { readonly absolute: number; readonly percent: number }): string => (
      `${absolute.toLocaleString('en-US')} (${percent.toFixed(1)}%)`
    );
    const formatTiming = ({ total, p50, p95 }: DurationSummary): string => (
      `${total.toFixed(1)} / ${p50.toFixed(1)} / ${p95.toFixed(1)} ms`
    );
    this.#hud.lab.textContent = data.sceneLabel;
    this.#hud.renderer.textContent = `Three/WebGL2 · ${data.mesherMode === 'visible' ? 'Visible Faces' : 'Greedy'}`;
    this.#hud.volume.textContent = formatVec(data.worldCells);
    this.#hud.worldMeters.textContent = `${formatVec(data.worldMeters)} m`;
    this.#hud.voxelSize.textContent = `${data.voxelSizeMeters.toFixed(2)} m`;
    this.#hud.chunkEdge.textContent = String(data.chunkEdge);
    this.#hud.candidateChunks.textContent = data.candidateChunks.toLocaleString('en-US');
    this.#hud.materializedChunks.textContent = data.materializedChunks.toLocaleString('en-US');
    this.#hud.occupied.textContent = data.occupiedVoxels.toLocaleString('en-US');
    this.#hud.quads.textContent = quads.toLocaleString('en-US');
    this.#hud.quadsLabel.textContent = data.lab === 'wp03' ? 'Active mesh quads' : 'Exposed quads';
    this.#hud.triangles.textContent = triangles.toLocaleString('en-US');
    this.#hud.activeMesher.textContent = data.mesherMode === 'visible' ? 'Visible Faces' : 'Greedy';
    this.#hud.worldHash.textContent = data.worldHash;
    this.#hud.coveredUnitFaces.textContent = data.coveredUnitFaces.toLocaleString('en-US');
    this.#hud.activeFilledMeshSets.textContent = '1';
    if (data.comparison) {
      this.#hud.visibleQuads.textContent = data.comparison.visible.quadCount.toLocaleString('en-US');
      this.#hud.greedyQuads.textContent = data.comparison.greedy.quadCount.toLocaleString('en-US');
      this.#hud.quadReduction.textContent = formatReduction(data.comparison.quadReduction);
      this.#hud.visibleTriangles.textContent = data.comparison.visible.triangleCount.toLocaleString('en-US');
      this.#hud.greedyTriangles.textContent = data.comparison.greedy.triangleCount.toLocaleString('en-US');
      this.#hud.triangleReduction.textContent = formatReduction(data.comparison.triangleReduction);
      this.#hud.visibleMeshBytes.textContent = formatBytes(data.comparison.visible.memory.meshTotalBytes);
      this.#hud.greedyMeshBytes.textContent = formatBytes(data.comparison.greedy.memory.meshTotalBytes);
      this.#hud.meshByteReduction.textContent = formatReduction(data.comparison.neutralMeshByteReduction);
      this.#hud.visibleMeshing.textContent = formatTiming(data.comparison.visible.timing);
      this.#hud.greedyMeshing.textContent = formatTiming(data.comparison.greedy.timing);
    }
    this.#hud.candidateDenseVoxelBytes.textContent = formatBytes(memory.candidateDenseVoxelBytes);
    this.#hud.materializedVoxelPayloadBytes.textContent = formatBytes(memory.materializedVoxelPayloadBytes);
    this.#hud.chunkMetadataBytesEstimate.textContent = `${formatBytes(memory.chunkMetadataBytesEstimate)} estimate`;
    this.#hud.haloBytesPerSnapshot.textContent = formatBytes(memory.haloBytesPerSnapshot);
    this.#hud.haloBytesTotalProcessed.textContent = formatBytes(memory.haloBytesTotalProcessed);
    this.#hud.meshPositionBytes.textContent = formatBytes(memory.meshPositionBytes);
    this.#hud.meshNormalBytes.textContent = formatBytes(memory.meshNormalBytes);
    this.#hud.meshIndexBytes.textContent = formatBytes(memory.meshIndexBytes);
    this.#hud.meshMaterialIdBytes.textContent = formatBytes(memory.meshMaterialIdBytes);
    this.#hud.meshTotalBytes.textContent = formatBytes(memory.meshTotalBytes);
    this.#hud.debugEdgeBytes.textContent = formatBytes(memory.debugEdgeBytes);
    this.#hud.debugMeshQuadEdgeBytes.textContent = formatBytes(memory.debugMeshQuadEdgeBytes);
    this.#hud.debugNormalBytes.textContent = formatBytes(memory.debugNormalBytes);
    this.#hud.debugChunkBoundsBytes.textContent = formatBytes(memory.debugChunkBoundsBytes);
    this.#hud.colorAttributeBytes.textContent = formatBytes(memory.colorAttributeBytes);
    this.#hud.gpuMemoryBytes.textContent = memory.gpuMemoryBytes === null ? 'Unknown / unavailable' : formatBytes(memory.gpuMemoryBytes);
    this.#hud.residentChunkMeshes.textContent = this.#voxelMeshes.length.toLocaleString('en-US');
    this.#hud.fixtureBuild.textContent = formatDuration(data.fixtureBuildDurationMs);
    this.#hud.haloTotal.textContent = formatDuration(data.haloTiming.total);
    this.#hud.haloP50.textContent = formatDuration(data.haloTiming.p50);
    this.#hud.haloP95.textContent = formatDuration(data.haloTiming.p95);
    this.#hud.meshTotal.textContent = formatDuration(data.meshTiming.total);
    this.#hud.meshP50.textContent = formatDuration(data.meshTiming.p50);
    this.#hud.meshP95.textContent = formatDuration(data.meshTiming.p95);
    this.#hud.status.textContent = 'Ready';
    this.#root.dataset.lab = data.lab;
    this.#root.dataset.mesher = data.mesherMode;
    this.#root.dataset.zoneCount = String(data.zoneCount);
    this.#root.dataset.worldHash = data.worldHash;
    if (data.lab === 'wp03') {
      document.title = 'Hestia Voxel Kernel Lab — Greedy Meshing A/B';
    }
    this.#mesherSelect.value = data.mesherMode;

    this.#cameraPresetSelect.replaceChildren(...this.#cameraPresets.map((preset) => {
      const option = document.createElement('option');
      option.value = preset.id;
      option.textContent = preset.label;
      return option;
    }));
    const initialPreset = this.#cameraPresets[0];
    if (!initialPreset) {
      throw new RangeError('At least one camera preset is required.');
    }
    this.applyCameraPreset(initialPreset.id);

    this.#wireframeToggle.addEventListener('change', this.#toggleWireframe);
    this.#blockEdgeToggle.addEventListener('change', this.#toggleBlockEdges);
    this.#meshQuadEdgeToggle.addEventListener('change', this.#toggleMeshQuadEdges);
    this.#normalToggle.addEventListener('change', this.#toggleNormals);
    this.#chunkBoundsToggle.addEventListener('change', this.#toggleChunkBounds);
    this.#cameraPresetSelect.addEventListener('change', this.#changeCameraPreset);
    this.#mesherSelect.addEventListener('change', this.#changeMesher);
    this.#canvas.addEventListener('keydown', this.#keyboardCameraPreset);
    this.#resetButton.addEventListener('click', this.#resetCamera);
    window.addEventListener('resize', this.#resize);
    this.resize();

    const renderFrame = (time: number): void => {
      if (this.#disposed) {
        return;
      }
      if (this.#lastFrameTime > 0) {
        this.#telemetry.record(time - this.#lastFrameTime);
      }
      this.#lastFrameTime = time;
      this.#controls.update();
      this.#renderer.render(scene, this.#camera);
      if (this.updateHud()) {
        this.#root.dataset.ready = 'true';
      }
      this.#animationFrame = requestAnimationFrame(renderFrame);
    };
    this.#animationFrame = requestAnimationFrame(renderFrame);
  }

  dispose(): void {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;
    cancelAnimationFrame(this.#animationFrame);
    window.removeEventListener('resize', this.#resize);
    this.#wireframeToggle.removeEventListener('change', this.#toggleWireframe);
    this.#blockEdgeToggle.removeEventListener('change', this.#toggleBlockEdges);
    this.#meshQuadEdgeToggle.removeEventListener('change', this.#toggleMeshQuadEdges);
    this.#normalToggle.removeEventListener('change', this.#toggleNormals);
    this.#chunkBoundsToggle.removeEventListener('change', this.#toggleChunkBounds);
    this.#cameraPresetSelect.removeEventListener('change', this.#changeCameraPreset);
    this.#mesherSelect.removeEventListener('change', this.#changeMesher);
    this.#canvas.removeEventListener('keydown', this.#keyboardCameraPreset);
    this.#resetButton.removeEventListener('click', this.#resetCamera);
    this.#controls.dispose();
    for (const geometry of this.#meshGeometries) {
      geometry.dispose();
    }
    this.#meshMaterial.dispose();
    this.#edgeGeometry.dispose();
    this.#edgeMaterial.dispose();
    this.#meshQuadEdgeGeometry.dispose();
    this.#meshQuadEdgeMaterial.dispose();
    this.#normalGeometry.dispose();
    this.#normalMaterial.dispose();
    this.#chunkBoundsGeometry.dispose();
    this.#chunkBoundsMaterial.dispose();
    this.#renderer.dispose();
    this.#renderer.forceContextLoss();
  }

  private resize(): void {
    const width = Math.max(this.#root.clientWidth, 1);
    const height = Math.max(this.#root.clientHeight, 1);
    this.#renderer.setSize(width, height, false);
    this.#camera.aspect = width / height;
    this.#camera.updateProjectionMatrix();
  }

  private applyCameraPreset(id: string): void {
    const preset = this.#cameraPresets.find((candidate) => candidate.id === id);
    if (!preset) {
      throw new RangeError(`Unknown camera preset: ${id}`);
    }
    this.#camera.position.set(...preset.positionMeters);
    this.#controls.target.set(...preset.targetMeters);
    this.#controls.update();
    this.#controls.saveState();
    this.#cameraPresetSelect.value = preset.id;
    this.#hud.activePreset.textContent = preset.label;
    const zone = preset.zoneId ? this.#cameraPresets.find((candidate) => candidate.id === preset.zoneId) : null;
    this.#hud.activeZone.textContent = zone?.label ?? preset.label;
  }

  private updateHud(): boolean {
    const frame = this.#telemetry.snapshot();
    this.#hud.drawCalls.textContent = String(this.#renderer.info.render.calls);
    this.#hud.current.textContent = `${frame.current.toFixed(1)} ms`;
    this.#hud.p50.textContent = `${frame.p50.toFixed(1)} ms`;
    this.#hud.p95.textContent = `${frame.p95.toFixed(1)} ms`;
    return frame.current > 0;
  }
}
