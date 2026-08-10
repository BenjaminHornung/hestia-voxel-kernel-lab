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
import { FrameIntervalTelemetry } from '../diagnostics/telemetry';
import { VOLUME_SIZE, VoxelMaterial } from '../voxel/constants';
import { MATERIAL_COLORS } from '../voxel/palette';
import type { VisibleFaceMesh } from '../voxel/types';

interface HudElements {
  readonly renderer: HTMLElement;
  readonly volume: HTMLElement;
  readonly occupied: HTMLElement;
  readonly quads: HTMLElement;
  readonly triangles: HTMLElement;
  readonly drawCalls: HTMLElement;
  readonly current: HTMLElement;
  readonly p50: HTMLElement;
  readonly p95: HTMLElement;
  readonly status: HTMLElement;
}

function requiredElement<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Required element not found: ${selector}`);
  }
  return element;
}

function createEdgePositions(positions: Float32Array): Float32Array {
  const edges = new Map<string, readonly [number, number]>();
  const edgeCorners = [[0, 1], [1, 2], [2, 3], [3, 0]] as const;

  for (let quad = 0; quad < positions.length / 12; quad += 1) {
    const baseVertex = quad * 4;
    for (const [startCorner, endCorner] of edgeCorners) {
      const start = baseVertex + startCorner;
      const end = baseVertex + endCorner;
      const startOffset = start * 3;
      const endOffset = end * 3;
      const startKey = `${positions[startOffset]},${positions[startOffset + 1]},${positions[startOffset + 2]}`;
      const endKey = `${positions[endOffset]},${positions[endOffset + 1]},${positions[endOffset + 2]}`;
      const key = startKey < endKey ? `${startKey}|${endKey}` : `${endKey}|${startKey}`;
      edges.set(key, [start, end]);
    }
  }

  const lines = new Float32Array(edges.size * 6);
  let offset = 0;
  for (const [start, end] of edges.values()) {
    lines.set(positions.subarray(start * 3, start * 3 + 3), offset);
    lines.set(positions.subarray(end * 3, end * 3 + 3), offset + 3);
    offset += 6;
  }
  return lines;
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

export class ThreeVoxelRenderer {
  readonly #root: HTMLElement;
  readonly #renderer: WebGLRenderer;
  readonly #camera: PerspectiveCamera;
  readonly #controls: OrbitControls;
  readonly #meshGeometry: BufferGeometry;
  readonly #meshMaterial: MeshLambertMaterial;
  readonly #voxelMesh: Mesh;
  readonly #edgeGeometry: BufferGeometry;
  readonly #edgeMaterial: LineBasicMaterial;
  readonly #edgeLines: LineSegments;
  readonly #normalGeometry: BufferGeometry;
  readonly #normalMaterial: LineBasicMaterial;
  readonly #normalLines: LineSegments;
  readonly #hud: HudElements;
  readonly #telemetry = new FrameIntervalTelemetry();
  readonly #wireframeToggle: HTMLInputElement;
  readonly #normalToggle: HTMLInputElement;
  readonly #resetButton: HTMLButtonElement;
  readonly #resize = (): void => this.resize();
  readonly #toggleWireframe = (): void => {
    this.#voxelMesh.visible = !this.#wireframeToggle.checked;
    this.#edgeLines.visible = true;
  };
  readonly #toggleNormals = (): void => {
    this.#normalLines.visible = this.#normalToggle.checked;
  };
  readonly #resetCamera = (): void => this.#controls.reset();
  #animationFrame = 0;
  #lastFrameTime = 0;
  #disposed = false;

  constructor(root: HTMLElement, data: VisibleFaceMesh, occupiedCount: number) {
    this.#root = root;
    const canvas = requiredElement<HTMLCanvasElement>(root, '[data-testid="voxel-canvas"]');
    const context = canvas.getContext('webgl2', { antialias: true, alpha: false });
    if (!context) {
      throw new Error('WebGL2 is required for the visible-face baseline.');
    }

    this.#renderer = new WebGLRenderer({ canvas, context, antialias: true });
    this.#renderer.outputColorSpace = SRGBColorSpace;
    this.#renderer.setClearColor(0x23272d, 1);
    this.#renderer.setPixelRatio(window.devicePixelRatio);

    const scene = new Scene();
    this.#camera = new PerspectiveCamera(42, 1, 0.1, 200);
    this.#camera.position.set(43, 32, -17);

    this.#meshGeometry = new BufferGeometry();
    this.#meshGeometry.setAttribute('position', new BufferAttribute(data.positions, 3));
    this.#meshGeometry.setAttribute('normal', new BufferAttribute(data.normals, 3));
    this.#meshGeometry.setIndex(new BufferAttribute(data.indices, 1));
    const colors = new Float32Array(data.materialIds.length * 3);
    const color = new Color();
    for (let vertex = 0; vertex < data.materialIds.length; vertex += 1) {
      const material = data.materialIds[vertex] as Exclude<VoxelMaterial, VoxelMaterial.Air>;
      color.setHex(MATERIAL_COLORS[material]);
      colors[vertex * 3] = color.r;
      colors[vertex * 3 + 1] = color.g;
      colors[vertex * 3 + 2] = color.b;
    }
    this.#meshGeometry.setAttribute('color', new BufferAttribute(colors, 3));
    this.#meshGeometry.computeBoundingSphere();
    this.#meshMaterial = new MeshLambertMaterial({
      vertexColors: true,
      flatShading: true,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    });
    this.#voxelMesh = new Mesh(this.#meshGeometry, this.#meshMaterial);
    scene.add(this.#voxelMesh);

    this.#edgeGeometry = new BufferGeometry();
    this.#edgeGeometry.setAttribute('position', new BufferAttribute(createEdgePositions(data.positions), 3));
    this.#edgeMaterial = new LineBasicMaterial({ color: 0x15191f, transparent: true, opacity: 0.72 });
    this.#edgeLines = new LineSegments(this.#edgeGeometry, this.#edgeMaterial);
    scene.add(this.#edgeLines);

    this.#normalGeometry = new BufferGeometry();
    this.#normalGeometry.setAttribute('position', new BufferAttribute(createNormalPositions(data), 3));
    this.#normalMaterial = new LineBasicMaterial({ color: 0xffd36a });
    this.#normalLines = new LineSegments(this.#normalGeometry, this.#normalMaterial);
    this.#normalLines.visible = false;
    scene.add(this.#normalLines);

    scene.add(new HemisphereLight(0xd9e5f2, 0x35302a, 2.25));
    const keyLight = new DirectionalLight(0xffffff, 2.8);
    keyLight.position.set(-12, 30, 18);
    scene.add(keyLight);

    this.#controls = new OrbitControls(this.#camera, canvas);
    this.#controls.minDistance = 18;
    this.#controls.maxDistance = 100;
    this.#controls.target.set(16, 3.5, 16);
    this.#controls.update();
    this.#controls.saveState();

    this.#wireframeToggle = requiredElement<HTMLInputElement>(root, '[data-testid="wireframe-toggle"]');
    this.#normalToggle = requiredElement<HTMLInputElement>(root, '[data-testid="normal-toggle"]');
    this.#resetButton = requiredElement<HTMLButtonElement>(root, '[data-testid="camera-reset"]');
    this.#hud = {
      renderer: requiredElement(root, '[data-testid="metric-renderer"]'),
      volume: requiredElement(root, '[data-testid="metric-volume"]'),
      occupied: requiredElement(root, '[data-testid="metric-occupied"]'),
      quads: requiredElement(root, '[data-testid="metric-quads"]'),
      triangles: requiredElement(root, '[data-testid="metric-triangles"]'),
      drawCalls: requiredElement(root, '[data-testid="metric-draw-calls"]'),
      current: requiredElement(root, '[data-testid="metric-frame-current"]'),
      p50: requiredElement(root, '[data-testid="metric-frame-p50"]'),
      p95: requiredElement(root, '[data-testid="metric-frame-p95"]'),
      status: requiredElement(root, '[data-testid="app-status"]'),
    };

    this.#hud.renderer.textContent = `Three.js WebGL2 · ${this.#renderer.capabilities.getMaxAnisotropy()}× max AF`;
    this.#hud.volume.textContent = `${VOLUME_SIZE} × ${VOLUME_SIZE} × ${VOLUME_SIZE}`;
    this.#hud.occupied.textContent = occupiedCount.toLocaleString('en-US');
    this.#hud.quads.textContent = data.quadCount.toLocaleString('en-US');
    this.#hud.triangles.textContent = data.triangleCount.toLocaleString('en-US');
    this.#hud.status.textContent = 'Ready';

    this.#wireframeToggle.addEventListener('change', this.#toggleWireframe);
    this.#normalToggle.addEventListener('change', this.#toggleNormals);
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
    this.#normalToggle.removeEventListener('change', this.#toggleNormals);
    this.#resetButton.removeEventListener('click', this.#resetCamera);
    this.#controls.dispose();
    this.#meshGeometry.dispose();
    this.#meshMaterial.dispose();
    this.#edgeGeometry.dispose();
    this.#edgeMaterial.dispose();
    this.#normalGeometry.dispose();
    this.#normalMaterial.dispose();
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

  private updateHud(): boolean {
    const frame = this.#telemetry.snapshot();
    this.#hud.drawCalls.textContent = String(this.#renderer.info.render.calls);
    this.#hud.current.textContent = `${frame.current.toFixed(1)} ms`;
    this.#hud.p50.textContent = `${frame.p50.toFixed(1)} ms`;
    this.#hud.p95.textContent = `${frame.p95.toFixed(1)} ms`;
    return frame.current > 0;
  }
}
