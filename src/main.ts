/// <reference types="vite-plugin-pwa/client" />
import type { AppState, MapPayload, StarSystem } from './types';
import { registerSW } from 'virtual:pwa-register';
import { initRenderer, resizeCanvas } from './renderer';
import { initUIControls } from './uiControls';
import { buildSceneGraph } from './dataAdapter';
import { initInputHandlers } from './input';
import { resetCamera } from './camera';
import { generateRandomSystem } from './generator';
import { APP_FULL_VERSION } from './version';
import { savePage, saveInteractivePage, loadSavedPage, exportToCsv, exportToDocx } from './savePage';
import { initEditor, setEditorSystem } from './editor';
import { initTravelPlanner, createTravelPlannerState, refreshTravelPanel } from './travelPlanner';

let currentPayload: MapPayload | null = null;

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

function parseSystemPaste(text: string): MapPayload | null {
  try {
    const trimmed = text.trim();
    if (!trimmed) return null;
    const parsed = JSON.parse(trimmed);
    // Accept either full MapPayload or just StarSystem
    if (parsed.starSystem) {
      return parsed as MapPayload;
    }
    if (parsed.primaryStar) {
      return {
        starSystem: parsed as StarSystem,
        starfieldSeed: generateSeed(),
        epoch: { year: 2300, month: 1, day: 1 },
      };
    }
    return null;
  } catch {
    alert('Invalid JSON. Please paste the full system data copied from MWG.');
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
    gmNotes: '',
    travelPlanner: undefined,
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

function loadSystemIntoState(state: AppState, payload: MapPayload): void {
  currentPayload = payload;
  state.starfieldSeed = payload.starfieldSeed || state.starfieldSeed;
  state.epochDate = new Date(
    Date.UTC(payload.epoch.year, payload.epoch.month - 1, payload.epoch.day)
  );
  state.simDayOffset = 0;
  state.bodies = buildSceneGraph(payload.starSystem);
  state.zones = payload.starSystem.zones;

  // Update seed display
  const seedDisplay = document.getElementById('seed-display') as HTMLInputElement | null;
  if (seedDisplay) seedDisplay.value = state.starfieldSeed;

  // Recalculate maxAU and reset camera
  const maxAU = state.bodies.length > 0 ? Math.max(...state.bodies.map((b) => b.distanceAU)) : 1;
  resetCamera(state.camera, state.width, state.height, maxAU);
  (state as unknown as Record<string, () => void>).initCamera?.();
  (state as unknown as Record<string, () => void>).updateStarfield?.();

  // Update editor
  setEditorSystem(payload.starSystem, state.gmNotes || '');
}

function initPasteControls(state: AppState): void {
  const systemPaste = document.getElementById('system-paste') as HTMLTextAreaElement | null;
  const btnLoadSystem = document.getElementById('btn-load-system') as HTMLButtonElement | null;
  const btnDownloadSystem = document.getElementById('btn-download-system') as HTMLButtonElement | null;
  const btnGenerateSystem = document.getElementById('btn-generate-system') as HTMLButtonElement | null;
  const btnSavePage = document.getElementById('btn-save-page') as HTMLButtonElement | null;
  const btnExportInteractive = document.getElementById('btn-export-interactive') as HTMLButtonElement | null;
  const btnExportCsv = document.getElementById('btn-export-csv') as HTMLButtonElement | null;
  const btnExportDocx = document.getElementById('btn-export-docx') as HTMLButtonElement | null;

  if (btnGenerateSystem) {
    btnGenerateSystem.addEventListener('click', () => {
      const payload = generateRandomSystem();
      loadSystemIntoState(state, payload);
    });
  }

  if (btnLoadSystem && systemPaste) {
    btnLoadSystem.addEventListener('click', () => {
      const payload = parseSystemPaste(systemPaste.value);
      if (payload) {
        try {
          loadSystemIntoState(state, payload);
          systemPaste.value = '';
        } catch (err) {
          console.error('Failed to load system:', err);
          alert(`Failed to load system: ${err instanceof Error ? err.message : String(err)}`);
        }
      } else if (systemPaste.value.trim()) {
        alert('Could not parse system JSON. Make sure you copied it with "Copy for 2D Map" from MWG.');
      }
    });
  }

  if (btnDownloadSystem) {
    btnDownloadSystem.addEventListener('click', () => {
      if (!currentPayload) {
        alert('No system loaded. Generate or paste a system first.');
        return;
      }
      const json = JSON.stringify(currentPayload, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const starName = currentPayload.starSystem.primaryStar
        ? `${currentPayload.starSystem.primaryStar.class}${currentPayload.starSystem.primaryStar.grade}`
        : 'system';
      a.href = url;
      a.download = `mneme-map-${starName.toLowerCase()}-${currentPayload.starfieldSeed}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  }

  if (btnSavePage) {
    btnSavePage.addEventListener('click', () => {
      if (!state.canvas || !currentPayload) {
        alert('No system loaded. Generate or paste a system first.');
        return;
      }
      const starId = currentPayload.starSystem.key || `generated-${Date.now()}`;
      savePage(state.canvas, currentPayload, state.gmNotes || '', starId);
    });
  }

  if (btnExportInteractive) {
    btnExportInteractive.addEventListener('click', async () => {
      if (!currentPayload) {
        alert('No system loaded. Generate or paste a system first.');
        return;
      }
      const starId = currentPayload.starSystem.key || `generated-${Date.now()}`;
      await saveInteractivePage(currentPayload, state.gmNotes || '', starId);
    });
  }

  if (btnExportCsv) {
    btnExportCsv.addEventListener('click', () => {
      if (!currentPayload) {
        alert('No system loaded.');
        return;
      }
      const csv = exportToCsv(currentPayload.starSystem);
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const name = currentPayload.starSystem.key || `${currentPayload.starSystem.primaryStar.class}${currentPayload.starSystem.primaryStar.grade}`;
      a.href = url;
      a.download = `mneme-${name.replace(/\s+/g, '_').toLowerCase()}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  }

  if (btnExportDocx) {
    btnExportDocx.addEventListener('click', () => {
      if (!currentPayload) {
        alert('No system loaded.');
        return;
      }
      const html = exportToDocx(currentPayload.starSystem);
      const blob = new Blob([html], { type: 'application/msword' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const name = currentPayload.starSystem.key || `${currentPayload.starSystem.primaryStar.class}${currentPayload.starSystem.primaryStar.grade}`;
      a.href = url;
      a.download = `mneme-${name.replace(/\s+/g, '_').toLowerCase()}.doc`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  }
}

function main() {
  registerSW({ immediate: true });

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

  const state = createDefaultState();
  state.canvas = canvas;
  state.ctx = ctx;

  // Detect embed mode (FRD-053 Phase 2)
  const urlParams = new URLSearchParams(window.location.search);
  const isEmbed = urlParams.get('embed') === '1';

  // Check for injected payload first (standalone interactive export)
  let urlPayload: MapPayload | null = null;
  const injected = (window as unknown as Record<string, unknown>).__MNEME_INITIAL_PAYLOAD__;
  if (injected && typeof injected === 'object') {
    urlPayload = injected as MapPayload;
    const injectedNotes = (window as unknown as Record<string, unknown>).__MNEME_GM_NOTES__;
    if (typeof injectedNotes === 'string') {
      state.gmNotes = injectedNotes;
    }
  }

  // Fall back to URL params
  if (!urlPayload) {
    const starId = urlParams.get('starId');
    urlPayload = decodeMapPayload(window.location.search);

    if (starId && !urlPayload) {
      const saved = loadSavedPage(starId);
      if (saved) {
        urlPayload = saved.payload;
        state.gmNotes = saved.gmNotes || '';
      }
    }
  }

  // Embed mode: listen for postMessage from parent (MWG)
  if (isEmbed) {
    window.addEventListener('message', (event) => {
      if (event.data && event.data.type === 'mneme-load-system') {
        const payload = event.data.payload as MapPayload;
        if (payload && payload.starSystem) {
          loadSystemIntoState(state, payload);
          // Notify parent that system loaded
          event.source?.postMessage({ type: 'mneme-system-loaded', starId: payload.starSystem.key }, { targetOrigin: '*' });
        }
      }
    });
  }

  if (urlPayload) {
    currentPayload = urlPayload;
    state.starfieldSeed = urlPayload.starfieldSeed || state.starfieldSeed;
    state.epochDate = new Date(
      Date.UTC(urlPayload.epoch.year, urlPayload.epoch.month - 1, urlPayload.epoch.day)
    );
    state.bodies = buildSceneGraph(urlPayload.starSystem);
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
  initPasteControls(state);

  // FRD-053 Phase 2: Embed mode chrome hiding
  if (isEmbed) {
    const controls = document.getElementById('controls');
    const expandBtn = document.getElementById('btn-expand-panel');
    const watermark = document.getElementById('version-watermark');
    const loading = document.getElementById('loading');
    const journeyBtn = document.getElementById('btn-journey');
    const travelPanel = document.getElementById('tab-travel');
    const appDiv = document.getElementById('app');

    // Detach travel panel from controls BEFORE hiding controls so it stays accessible
    if (travelPanel && appDiv) {
      appDiv.appendChild(travelPanel);
      travelPanel.classList.add('travel-embed-overlay');
    }

    if (controls) controls.style.display = 'none';
    if (expandBtn) expandBtn.style.display = 'none';
    if (watermark) watermark.style.display = 'none';
    if (loading) loading.style.display = 'none';

    // Journey FAB toggles the travel overlay
    if (journeyBtn) {
      journeyBtn.style.display = 'flex';
      journeyBtn.addEventListener('click', () => {
        if (!travelPanel) return;
        const isOpen = travelPanel.style.display === 'flex';
        if (isOpen) {
          travelPanel.style.display = 'none';
          journeyBtn.textContent = '✈';
          journeyBtn.title = 'Travel Planner';
          journeyBtn.setAttribute('aria-label', 'Open Travel Planner');
          if (state.travelPlanner) state.travelPlanner.isActive = false;
        } else {
          travelPanel.style.display = 'flex';
          journeyBtn.textContent = '✕';
          journeyBtn.title = 'Close';
          journeyBtn.setAttribute('aria-label', 'Close Travel Planner');
          if (state.travelPlanner) state.travelPlanner.isActive = true;
          refreshTravelPanel(state);
        }
      });
    }

    // Auto-start animation if a system is loaded
    if (currentPayload) {
      const playBtn = document.getElementById('btn-play') as HTMLButtonElement | null;
      const pauseBtn = document.getElementById('btn-pause') as HTMLButtonElement | null;
      if (playBtn && pauseBtn) {
        playBtn.style.display = 'none';
        pauseBtn.style.display = 'inline-block';
      }
      state.isPlaying = true;
    }
  }

  initEditor(state, (system, gmNotes) => {
    state.gmNotes = gmNotes;
    if (currentPayload) {
      currentPayload.starSystem = system;
    }
    // Auto-save to localStorage for persistence
    if (currentPayload) {
      const starId = currentPayload.starSystem.key || `generated-${currentPayload.starfieldSeed}`;
      const savedPage = {
        starId,
        starName: currentPayload.starSystem.key || `${currentPayload.starSystem.primaryStar.class}${currentPayload.starSystem.primaryStar.grade}`,
        savedAt: new Date().toISOString(),
        payload: currentPayload,
        mwgSystem: currentPayload.starSystem,
        gmNotes,
        version: APP_FULL_VERSION.split(' ')[0] || 'dev',
      };
      localStorage.setItem(`mneme-2dmap-${starId}`, JSON.stringify(savedPage));
    }
  });

  state.travelPlanner = createTravelPlannerState();
  initTravelPlanner(state);

  // Render version in UI
  const versionDisplay = document.getElementById('version-display');
  const versionWatermark = document.getElementById('version-watermark');
  if (versionDisplay) versionDisplay.textContent = APP_FULL_VERSION;
  if (versionWatermark) versionWatermark.textContent = APP_FULL_VERSION;
}

main();
