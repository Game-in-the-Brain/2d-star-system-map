import type { AppState } from './types';

export function initUIControls(state: AppState, onResetView?: () => void): void {
  const btnPlay = document.getElementById('btn-play') as HTMLButtonElement | null;
  const btnPause = document.getElementById('btn-pause') as HTMLButtonElement | null;
  const btnReverse = document.getElementById('btn-reverse') as HTMLButtonElement | null;
  const speedSelect = document.getElementById('speed-select') as HTMLSelectElement | null;
  const btnStepMinus7 = document.getElementById('btn-step-minus-7') as HTMLButtonElement | null;
  const btnStepMinus1 = document.getElementById('btn-step-minus-1') as HTMLButtonElement | null;
  const btnStepPlus1 = document.getElementById('btn-step-plus-1') as HTMLButtonElement | null;
  const btnStepPlus7 = document.getElementById('btn-step-plus-7') as HTMLButtonElement | null;
  const btnReset = document.getElementById('btn-reset') as HTMLButtonElement | null;
  const btnResetView = document.getElementById('btn-reset-view') as HTMLButtonElement | null;
  const dateDisplay = document.getElementById('date-display') as HTMLElement | null;
  const seedDisplay = document.getElementById('seed-display') as HTMLInputElement | null;
  const btnSeedRegen = document.getElementById('btn-seed-regen') as HTMLButtonElement | null;
  const btnSeedCopy = document.getElementById('btn-seed-copy') as HTMLButtonElement | null;
  const seedPaste = document.getElementById('seed-paste') as HTMLInputElement | null;
  const btnSeedApply = document.getElementById('btn-seed-apply') as HTMLButtonElement | null;
  const btnCollapsePanel = document.getElementById('btn-collapse-panel') as HTMLButtonElement | null;
  const btnExpandPanel = document.getElementById('btn-expand-panel') as HTMLButtonElement | null;
  const controlPanel = document.getElementById('controls') as HTMLElement | null;

  function updateDateDisplay() {
    if (!dateDisplay) return;
    const msPerDay = 86400000;
    const totalMs = state.epochDate.getTime() + state.simDayOffset * msPerDay;
    const date = new Date(totalMs);
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    const d = String(date.getUTCDate()).padStart(2, '0');
    dateDisplay.textContent = `${y}-${m}-${d}`;
    dateDisplay.classList.toggle('playing', state.isPlaying);
  }

  function updatePlayPause() {
    if (btnPlay && btnPause) {
      btnPlay.style.display = state.isPlaying ? 'none' : 'inline-block';
      btnPause.style.display = state.isPlaying ? 'inline-block' : 'none';
    }
  }

  function updateSeed() {
    if (seedDisplay) seedDisplay.value = state.starfieldSeed;
  }

  // Panel collapse / expand
  function setPanelCollapsed(collapsed: boolean) {
    if (!controlPanel || !btnExpandPanel) return;
    if (collapsed) {
      controlPanel.classList.add('collapsed');
      btnExpandPanel.style.display = 'flex';
    } else {
      controlPanel.classList.remove('collapsed');
      btnExpandPanel.style.display = 'none';
    }
  }

  if (btnCollapsePanel) {
    btnCollapsePanel.addEventListener('click', () => setPanelCollapsed(true));
  }

  if (btnExpandPanel) {
    btnExpandPanel.addEventListener('click', () => setPanelCollapsed(false));
  }

  // Default to collapsed on narrow viewports (phones)
  const isMobile = window.innerWidth <= 768;
  if (isMobile) {
    setPanelCollapsed(true);
  }

  // Hook into RAF by updating the date display each frame via a lightweight interval
  const dateUpdater = setInterval(updateDateDisplay, 100);
  window.addEventListener('beforeunload', () => clearInterval(dateUpdater));

  if (btnPlay) {
    btnPlay.addEventListener('click', () => {
      state.isPlaying = true;
      updatePlayPause();
    });
  }

  if (btnPause) {
    btnPause.addEventListener('click', () => {
      state.isPlaying = false;
      updatePlayPause();
    });
  }

  if (btnReverse) {
    btnReverse.addEventListener('click', () => {
      state.isReversed = !state.isReversed;
      btnReverse.classList.toggle('active', state.isReversed);
    });
  }

  if (speedSelect) {
    speedSelect.addEventListener('change', () => {
      state.speed = parseFloat(speedSelect.value) || 1;
    });
  }

  if (btnStepMinus7) {
    btnStepMinus7.addEventListener('click', () => {
      state.simDayOffset -= 7;
      state.isPlaying = false;
      updatePlayPause();
      updateDateDisplay();
    });
  }

  if (btnStepMinus1) {
    btnStepMinus1.addEventListener('click', () => {
      state.simDayOffset -= 1;
      state.isPlaying = false;
      updatePlayPause();
      updateDateDisplay();
    });
  }

  if (btnStepPlus1) {
    btnStepPlus1.addEventListener('click', () => {
      state.simDayOffset += 1;
      state.isPlaying = false;
      updatePlayPause();
      updateDateDisplay();
    });
  }

  if (btnStepPlus7) {
    btnStepPlus7.addEventListener('click', () => {
      state.simDayOffset += 7;
      state.isPlaying = false;
      updatePlayPause();
      updateDateDisplay();
    });
  }

  if (btnReset) {
    btnReset.addEventListener('click', () => {
      state.simDayOffset = 0;
      updateDateDisplay();
    });
  }

  if (btnResetView) {
    btnResetView.addEventListener('click', () => {
      onResetView?.();
    });
  }

  if (btnSeedRegen) {
    btnSeedRegen.addEventListener('click', () => {
      state.starfieldSeed = generateSeed();
      updateSeed();
      (state as unknown as Record<string, () => void>).updateStarfield?.();
    });
  }

  if (btnSeedCopy && seedDisplay) {
    btnSeedCopy.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(seedDisplay.value);
      } catch {
        // ignore
      }
    });
  }

  if (btnSeedApply && seedPaste) {
    btnSeedApply.addEventListener('click', () => {
      const val = seedPaste.value.trim();
      if (val) {
        state.starfieldSeed = val.slice(0, 8);
        updateSeed();
        (state as unknown as Record<string, () => void>).updateStarfield?.();
      }
    });
  }

  updatePlayPause();
  updateDateDisplay();
  updateSeed();
}

function generateSeed(length = 8): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}
