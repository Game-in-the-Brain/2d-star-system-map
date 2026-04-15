import type { AppState, MapPayload } from './types';
import { initRenderer, resizeCanvas } from './renderer';
import { initUIControls } from './uiControls';
import { buildSceneGraph } from './dataAdapter';
import { initInputHandlers } from './input';
import { resetCamera } from './camera';

function decodeMapPayload(search: string): MapPayload | null {
  const params = new URLSearchParams(search);
  const encoded = params.get('system');
  if (!encoded) return null;
  try {
    const json = decodeURIComponent(
      Array.from(atob(encoded))
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(json) as MapPayload;
  } catch {
    console.error('Failed to decode map payload');
    return null;
  }
}

function createDefaultState(): AppState {
  return {
    ctx: null,
    canvas: null,
    bodies: [],
    camera: { x: 0, y: 0, zoom: 1 },
    isPlaying: true,
    isReversed: false,
    speed: 1,
    simDayOffset: 0,
    epochDate: new Date(Date.UTC(2300, 0, 1)),
    starfieldSeed: generateSeed(),
    lastFrameTime: performance.now(),
    width: window.innerWidth,
    height: window.innerHeight,
  };
}

function generateSeed(length = 8): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function main() {
  const canvas = document.getElementById('starmap') as HTMLCanvasElement | null;
  if (!canvas) {
    console.error('Canvas #starmap not found');
    return;
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    console.error('Could not get 2D context');
    return;
  }

  const payload = decodeMapPayload(window.location.search);
  const state = createDefaultState();
  state.canvas = canvas;
  state.ctx = ctx;

  if (payload) {
    state.starfieldSeed = payload.starfieldSeed || state.starfieldSeed;
    state.epochDate = new Date(
      Date.UTC(payload.epoch.year, payload.epoch.month - 1, payload.epoch.day)
    );
    state.bodies = buildSceneGraph(payload.starSystem);
  }

  resizeCanvas(state);
  window.addEventListener('resize', () => {
    resizeCanvas(state);
    (state as unknown as Record<string, () => void>).updateStarfield?.();
  });

  const maxAU = state.bodies.length > 0 ? Math.max(...state.bodies.map((b) => b.distanceAU)) : 1;
  resetCamera(state.camera, state.width, state.height, maxAU);

  const resetView = () => {
    resetCamera(state.camera, state.width, state.height, maxAU);
    (state as unknown as Record<string, () => void>).initCamera?.();
  };

  initUIControls(state, resetView);
  initInputHandlers(state, resetView);
  initRenderer(state);
}

main();
