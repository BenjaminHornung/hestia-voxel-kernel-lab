import './style.css';
import { ThreeVoxelRenderer } from './render-three/threeVoxelRenderer';
import { createVisibleFaceFixture } from './voxel/fixtures';
import { meshVisibleFaces } from './voxel/visibleFaceMesher';

const root = document.querySelector<HTMLElement>('#voxel-app');
if (!root) {
  throw new Error('Voxel application root is missing.');
}

const volume = createVisibleFaceFixture();
const mesh = meshVisibleFaces(volume);
const app = new ThreeVoxelRenderer(root, mesh, volume.occupiedCount);
const dispose = (): void => {
  window.removeEventListener('beforeunload', dispose);
  app.dispose();
};

window.addEventListener('beforeunload', dispose, { once: true });
if (import.meta.hot) {
  import.meta.hot.dispose(dispose);
}
