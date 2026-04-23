/**
 * SOI-Safe Travel Calculator panel.
 * DOM panel, routing-mode toggle, result display.
 * FRD-060 §30
 */

import type { SceneBody, TravelBody, TravelResult, RoutingMode } from './types';
import { toTravelBody, calculateTravel } from './travelCalc';

let panelEl: HTMLDivElement | null = null;
let currentBodies: SceneBody[] = [];
let currentStarMassSolar = 1;

function createPanel(): HTMLDivElement {
  const el = document.createElement('div');
  el.id = 'travel-calc-panel';
  el.className = 'travel-calc-panel';
  el.innerHTML = `
    <div class="tcp-header">
      <span>⏱ Travel Calculator</span>
      <button id="tcp-close" class="tcp-close">✕</button>
    </div>
    <div class="tcp-body">
      <div class="tcp-row">
        <label>From</label>
        <select id="tcp-origin"></select>
      </div>
      <div class="tcp-row">
        <label>To</label>
        <select id="tcp-dest"></select>
      </div>
      <div class="tcp-row">
        <label>Accel</label>
        <input id="tcp-accel" type="number" step="0.01" min="0.01" value="0.1" /> G
      </div>
      <div class="tcp-row tcp-routing">
        <label>Routing</label>
        <label><input type="radio" name="tcp-routing" value="direct" checked /> Direct</label>
        <label><input type="radio" name="tcp-routing" value="soi-safe" /> SOI-Safe</label>
      </div>
      <div id="tcp-results" class="tcp-results" style="display:none;">
        <div class="tcp-result-row"><span>Distance</span><span id="tcp-res-dist">—</span></div>
        <div class="tcp-result-row"><span>Flight time</span><span id="tcp-res-time">—</span></div>
        <div id="tcp-soi-section" style="display:none;">
          <div class="tcp-divider">SOI Intersections</div>
          <div id="tcp-soi-list"></div>
        </div>
        <div id="tcp-detour-section" style="display:none;">
          <div class="tcp-divider">Detour</div>
          <div class="tcp-result-row"><span>Path</span><span id="tcp-res-detour-dist">—</span></div>
          <div class="tcp-result-row"><span>Total</span><span id="tcp-res-detour-total">—</span></div>
          <button id="tcp-copy-detour" class="tcp-copy">Copy</button>
        </div>
        <div id="tcp-wait-section" style="display:none;">
          <div class="tcp-divider">Wait Alternative</div>
          <div class="tcp-result-row"><span>Wait</span><span id="tcp-res-wait">—</span></div>
          <div class="tcp-result-row"><span>Total</span><span id="tcp-res-wait-total">—</span></div>
          <button id="tcp-copy-wait" class="tcp-copy">Copy</button>
        </div>
      </div>
    </div>
  `;
  return el;
}

function populateDropdowns(): void {
  const originSel = document.getElementById('tcp-origin') as HTMLSelectElement | null;
  const destSel = document.getElementById('tcp-dest') as HTMLSelectElement | null;
  if (!originSel || !destSel) return;

  const opts = currentBodies
    .filter(b => !b.type.startsWith('star'))
    .map(b => `<option value="${b.id}">${b.label} (${b.type}) @ ${b.distanceAU.toFixed(2)} AU</option>`)
    .join('');

  originSel.innerHTML = '<option value="">— Select —</option>' + opts;
  destSel.innerHTML = '<option value="">— Select —</option>' + opts;
}

function getInputs(): { originId: string; destId: string; accelG: number; routing: RoutingMode } | null {
  const originSel = document.getElementById('tcp-origin') as HTMLSelectElement | null;
  const destSel = document.getElementById('tcp-dest') as HTMLSelectElement | null;
  const accelIn = document.getElementById('tcp-accel') as HTMLInputElement | null;
  const routingRadio = document.querySelector('input[name="tcp-routing"]:checked') as HTMLInputElement | null;

  if (!originSel || !destSel || !accelIn || !routingRadio) return null;
  if (!originSel.value || !destSel.value || originSel.value === destSel.value) return null;

  return {
    originId: originSel.value,
    destId: destSel.value,
    accelG: parseFloat(accelIn.value) || 0.1,
    routing: routingRadio.value as RoutingMode,
  };
}

function formatDays(days: number): string {
  if (days >= 365) return `${(days / 365).toFixed(1)}y`;
  if (days >= 1) return `${days.toFixed(1)}d`;
  return `${(days * 24).toFixed(1)}h`;
}

function recalculate(): void {
  const inputs = getInputs();
  const resultsDiv = document.getElementById('tcp-results');
  if (!inputs || !resultsDiv) {
    if (resultsDiv) resultsDiv.style.display = 'none';
    return;
  }

  const originBody = currentBodies.find(b => b.id === inputs.originId);
  const destBody = currentBodies.find(b => b.id === inputs.destId);
  if (!originBody || !destBody) return;

  const starMassEM = currentStarMassSolar * SOLAR_TO_EM;
  const origin = toTravelBody(originBody, currentStarMassSolar);
  const destination = toTravelBody(destBody, currentStarMassSolar);
  const allTravelBodies = currentBodies.map(b => toTravelBody(b, currentStarMassSolar));

  const result = calculateTravel(
    { origin, destination, accelG: inputs.accelG, routingMode: inputs.routing, departureOffsetDays: 0 },
    allTravelBodies,
    starMassEM
  );

  resultsDiv.style.display = 'block';

  const distEl = document.getElementById('tcp-res-dist');
  const timeEl = document.getElementById('tcp-res-time');
  if (distEl) distEl.textContent = `${result.pathDistanceAU.toFixed(2)} AU`;
  if (timeEl) timeEl.textContent = formatDays(result.flightTimeDays);

  // SOI intersections
  const soiSection = document.getElementById('tcp-soi-section');
  const soiList = document.getElementById('tcp-soi-list');
  if (soiSection && soiList) {
    if (result.soiIntersections.length > 0) {
      soiSection.style.display = 'block';
      soiList.innerHTML = result.soiIntersections.map(hit =>
        `<div class="tcp-soi-hit">⚠ ${hit.bodyLabel} +${hit.detourAddedAU.toFixed(3)} AU  +${formatDays(brachTime(hit.detourAddedAU, inputs.accelG))}</div>`
      ).join('');
    } else {
      soiSection.style.display = 'none';
    }
  }

  // Detour
  const detourSection = document.getElementById('tcp-detour-section');
  const detourDistEl = document.getElementById('tcp-res-detour-dist');
  const detourTotalEl = document.getElementById('tcp-res-detour-total');
  if (detourSection && detourDistEl && detourTotalEl) {
    if (result.detourAddedAU > 0) {
      detourSection.style.display = 'block';
      detourDistEl.textContent = `${result.pathDistanceAU.toFixed(2)} AU`;
      detourTotalEl.textContent = `${formatDays(result.totalTimeDays)}`;
    } else {
      detourSection.style.display = 'none';
    }
  }

  // Wait alternative
  const waitSection = document.getElementById('tcp-wait-section');
  const waitEl = document.getElementById('tcp-res-wait');
  const waitTotalEl = document.getElementById('tcp-res-wait-total');
  if (waitSection && waitEl && waitTotalEl) {
    if (result.waitAlternative) {
      waitSection.style.display = 'block';
      waitEl.textContent = `${formatDays(result.waitAlternative.waitDays)} → clear`;
      waitTotalEl.textContent = `${formatDays(result.waitAlternative.totalTimeDays)}`;
    } else {
      waitSection.style.display = 'none';
    }
  }
}

function brachTime(distAU: number, accelG: number): number {
  const G_MS2 = 9.80665;
  const AU_TO_M = 1.496e11;
  const DAY_TO_S = 86400;
  const dM = distAU * AU_TO_M;
  const aMs2 = accelG * G_MS2;
  return (2 * Math.sqrt(dM / (2 * aMs2))) / DAY_TO_S;
}

export function openTravelPanel(bodies: SceneBody[], starMassSolar: number): void {
  currentBodies = bodies;
  currentStarMassSolar = starMassSolar;

  if (!panelEl) {
    panelEl = createPanel();
    document.body.appendChild(panelEl);

    document.getElementById('tcp-close')?.addEventListener('click', closeTravelPanel);
    document.getElementById('tcp-origin')?.addEventListener('change', recalculate);
    document.getElementById('tcp-dest')?.addEventListener('change', recalculate);
    document.getElementById('tcp-accel')?.addEventListener('input', recalculate);
    document.querySelectorAll('input[name="tcp-routing"]').forEach(r => r.addEventListener('change', recalculate));
    document.getElementById('tcp-copy-detour')?.addEventListener('click', () => {
      const text = document.getElementById('tcp-res-detour-total')?.textContent ?? '';
      navigator.clipboard.writeText(`Detour: ${text}`).catch(() => {});
    });
    document.getElementById('tcp-copy-wait')?.addEventListener('click', () => {
      const text = document.getElementById('tcp-res-wait-total')?.textContent ?? '';
      navigator.clipboard.writeText(`Wait: ${text}`).catch(() => {});
    });
  }

  populateDropdowns();
  panelEl.style.display = 'block';
  recalculate();
}

export function closeTravelPanel(): void {
  if (panelEl) panelEl.style.display = 'none';
}

export function isTravelPanelOpen(): boolean {
  return panelEl?.style.display === 'block';
}

const SOLAR_TO_EM = 332946;
