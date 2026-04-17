/**
 * testHarness.ts
 *
 * Test harness for the 2D star system map.
 * Loads test-batch.json, renders a filterable table of 1000 generated systems,
 * and opens any selected system in the 2D map renderer (index.html?system=...).
 *
 * Two testing modes:
 *  1. Primary (production) — MWG encodes a StarSystem as Base64 in ?system= and
 *     opens index.html. This harness is not involved.
 *  2. Test mode — this page: browse batch worlds, click "View Map" to open any.
 */

import type { BatchSystem } from './batchAdapter';
import { batchToMapPayload, encodePayload } from './batchAdapter';

// ── Filter state ────────────────────────────────────────────────────────────

interface Filters {
  starClass: string;   // '' = all
  worldType: string;   // '' = all
  starport: string;    // '' = all
  hotJupiter: string;  // '' = all | 'yes' | 'no'
  search: string;      // ID prefix filter
}

let allSystems: BatchSystem[] = [];
let filters: Filters = { starClass: '', worldType: '', starport: '', hotJupiter: '', search: '' };
let currentPage = 0;
const PAGE_SIZE = 100;

// ── DOM refs ─────────────────────────────────────────────────────────────────

function el<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

// ── Filtering ─────────────────────────────────────────────────────────────────

function applyFilters(): BatchSystem[] {
  return allSystems.filter((s) => {
    if (filters.starClass && s.star.class !== filters.starClass) return false;
    if (filters.worldType && s.mainWorld?.type !== filters.worldType) return false;
    if (filters.starport && s.inhabitants.starportClass !== filters.starport) return false;
    if (filters.hotJupiter === 'yes' && !s.planetarySystem.hotJupiterPresent) return false;
    if (filters.hotJupiter === 'no' && s.planetarySystem.hotJupiterPresent) return false;
    if (filters.search && !s.id.startsWith(filters.search)) return false;
    return true;
  });
}

// ── Formatting helpers ────────────────────────────────────────────────────────

function fmtPop(n: number): string {
  if (n === 0) return '—';
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + 'B';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

function fmtHab(h: number): string {
  const sign = h >= 0 ? '+' : '';
  return sign + h.toFixed(1);
}

function zoneColour(zone: string): string {
  switch (zone) {
    case 'Green': return '#4ade80';
    case 'Amber': return '#fbbf24';
    case 'Red':   return '#f87171';
    default:      return '#9ca3af';
  }
}

function starportBadge(cls: string): string {
  const colours: Record<string, string> = {
    A: '#818cf8', B: '#60a5fa', C: '#34d399',
    D: '#fbbf24', E: '#fb923c', X: '#9ca3af',
  };
  const col = colours[cls] ?? '#9ca3af';
  return `<span class="badge" style="background:${col}22;color:${col};border-color:${col}55">${cls}</span>`;
}

function worldTypeBadge(type: string): string {
  const colours: Record<string, string> = {
    Terrestrial: '#4ade80',
    Dwarf:       '#9ca3af',
    Habitat:     '#c084fc',
  };
  const col = colours[type] ?? '#e5e7eb';
  return `<span class="badge" style="background:${col}22;color:${col};border-color:${col}55">${type}</span>`;
}

// ── Render table ──────────────────────────────────────────────────────────────

function renderTable(filtered: BatchSystem[]): void {
  const tbody = el<HTMLTableSectionElement>('tbl-body');
  const pageStart = currentPage * PAGE_SIZE;
  const pageEnd = Math.min(pageStart + PAGE_SIZE, filtered.length);
  const slice = filtered.slice(pageStart, pageEnd);

  tbody.innerHTML = slice
    .map((s, localIdx) => {
      const globalIdx = pageStart + localIdx + 1;
      const mw = s.mainWorld;
      const hab = mw ? fmtHab(mw.habitability) : '—';
      const pop = mw ? fmtPop(mw.population) : '—';
      const worldHtml = mw ? worldTypeBadge(mw.type) : '<span class="badge muted">—</span>';
      const portHtml = starportBadge(s.inhabitants.starportClass);
      const tz = s.inhabitants.travelZone;
      const tzDot = `<span style="color:${zoneColour(tz)}" title="${tz}">●</span>`;
      const hotJ = s.planetarySystem.hotJupiterPresent
        ? '<span class="hot-j" title="Hot Jupiter">🔥</span>'
        : '<span class="muted">—</span>';

      return `<tr data-idx="${globalIdx - 1}">
        <td class="num">${globalIdx}</td>
        <td class="mono">${s.id.slice(0, 8)}</td>
        <td class="star">${s.star.class}${s.star.grade}</td>
        <td>${worldHtml}</td>
        <td class="num ${mw && mw.habitability >= 0 ? 'pos' : 'neg'}">${hab}</td>
        <td class="num">${pop}</td>
        <td class="num">${s.inhabitants.techLevel}</td>
        <td>${portHtml} ${tzDot}</td>
        <td class="num">${s.planetarySystem.totalBodies}</td>
        <td class="center">${hotJ}</td>
        <td><button class="btn-view" data-idx="${globalIdx - 1}">View Map</button></td>
      </tr>`;
    })
    .join('');

  // Attach click handlers
  tbody.querySelectorAll<HTMLButtonElement>('.btn-view').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.idx ?? '0', 10);
      openMap(allSystems[idx]);
    });
  });

  // Row click (anywhere except the button)
  tbody.querySelectorAll<HTMLTableRowElement>('tr').forEach((row) => {
    row.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).classList.contains('btn-view')) return;
      const idx = parseInt(row.dataset.idx ?? '0', 10);
      openMap(allSystems[idx]);
    });
  });

  updatePager(filtered.length);
}

function updateCount(n: number, total: number): void {
  el('count-display').textContent = `Showing ${n} of ${total} systems`;
}

function updatePager(total: number): void {
  const maxPage = Math.max(0, Math.ceil(total / PAGE_SIZE) - 1);
  el<HTMLButtonElement>('btn-prev').disabled = currentPage === 0;
  el<HTMLButtonElement>('btn-next').disabled = currentPage >= maxPage;
  const start = currentPage * PAGE_SIZE + 1;
  const end = Math.min((currentPage + 1) * PAGE_SIZE, total);
  el('page-info').textContent = total === 0 ? 'No results' : `${start}–${end} of ${total}`;
}

// ── Re-render on filter change ────────────────────────────────────────────────

function refresh(): void {
  currentPage = 0;
  const filtered = applyFilters();
  updateCount(filtered.length, allSystems.length);
  renderTable(filtered);
}

// ── Open map ──────────────────────────────────────────────────────────────────

function openMap(s: BatchSystem): void {
  const payload = batchToMapPayload(s);
  const encoded = encodePayload(payload);
  const url = new URL('index.html', window.location.href);
  url.searchParams.set('system', encoded);
  window.open(url.toString(), '_blank');
}

// ── Random pick ───────────────────────────────────────────────────────────────

function openRandom(): void {
  const filtered = applyFilters();
  if (filtered.length === 0) return;
  const s = filtered[Math.floor(Math.random() * filtered.length)];
  openMap(s);
}

// ── Wire up filter controls ───────────────────────────────────────────────────

function wireFilters(): void {
  const classButtons = document.querySelectorAll<HTMLButtonElement>('[data-filter="class"]');
  classButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      classButtons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      filters.starClass = btn.dataset.value ?? '';
      refresh();
    });
  });

  const typeButtons = document.querySelectorAll<HTMLButtonElement>('[data-filter="type"]');
  typeButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      typeButtons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      filters.worldType = btn.dataset.value ?? '';
      refresh();
    });
  });

  const portButtons = document.querySelectorAll<HTMLButtonElement>('[data-filter="port"]');
  portButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      portButtons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      filters.starport = btn.dataset.value ?? '';
      refresh();
    });
  });

  const hjButtons = document.querySelectorAll<HTMLButtonElement>('[data-filter="hj"]');
  hjButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      hjButtons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      filters.hotJupiter = btn.dataset.value ?? '';
      refresh();
    });
  });

  el<HTMLInputElement>('search-input').addEventListener('input', (e) => {
    filters.search = (e.target as HTMLInputElement).value.trim().toLowerCase();
    refresh();
  });

  el('btn-random').addEventListener('click', openRandom);

  el('btn-prev').addEventListener('click', () => {
    if (currentPage > 0) {
      currentPage--;
      renderTable(applyFilters());
    }
  });

  el('btn-next').addEventListener('click', () => {
    const filtered = applyFilters();
    const maxPage = Math.ceil(filtered.length / PAGE_SIZE) - 1;
    if (currentPage < maxPage) {
      currentPage++;
      renderTable(filtered);
    }
  });
}

// ── Boot ──────────────────────────────────────────────────────────────────────

async function boot(): Promise<void> {
  const status = el('status');
  status.textContent = 'Loading batch data…';

  try {
    const res = await fetch('./test-batch.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json() as { systems: BatchSystem[] };
    allSystems = data.systems;
  } catch (err) {
    status.textContent = `Failed to load test-batch.json: ${String(err)}`;
    return;
  }

  status.textContent = '';
  wireFilters();
  refresh();
}

boot();
