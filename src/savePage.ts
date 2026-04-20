import type { MapPayload, SavedStarPage, StarSystem } from './types';
import { APP_VERSION } from './version';
import { STANDALONE_TEMPLATE } from './standaloneTemplate';

/**
 * Generate a self-contained HTML snapshot of the current 2D map view.
 * Includes a canvas PNG capture, system metadata, and collapsible raw data.
 */
export function generateSelfContainedHtml(
  canvas: HTMLCanvasElement,
  payload: MapPayload,
  gmNotes: string
): string {
  const dataUrl = canvas.toDataURL('image/png');
  const star = payload.starSystem.primaryStar;
  const starName = payload.starSystem.key || `${star.class}${star.grade}`;
  const dateStr = new Date().toISOString();

  // Count bodies by type for summary
  const counts: Record<string, number> = {};
  const allBodies = [
    ...(payload.starSystem.companionStars || []).map(() => 'Companion'),
    ...(payload.starSystem.circumstellarDisks || []).map(() => 'Disk'),
    ...(payload.starSystem.dwarfPlanets || []).map(() => 'Dwarf'),
    ...(payload.starSystem.terrestrialWorlds || []).map(() => 'Terrestrial'),
    ...(payload.starSystem.iceWorlds || []).map(() => 'Ice'),
    ...(payload.starSystem.gasWorlds || []).map((g) => `Gas ${g.gasClass === 4 ? 'IV/V' : g.gasClass}`),
    ...(payload.starSystem.moons || []).map(() => 'Moon'),
  ];
  allBodies.forEach((b) => {
    counts[b] = (counts[b] || 0) + 1;
  });
  const summaryText = Object.entries(counts)
    .map(([k, v]) => `${v}× ${k}`)
    .join(', ');

  const jsonData = JSON.stringify(payload, null, 2);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${escapeHtml(starName)} — Mneme Star System Map</title>
<style>
  *,*::before,*::after{box-sizing:border-box}
  body{margin:0;padding:24px;background:#0a0a0f;color:#e5e7eb;font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Cantarell,Noto Sans,Helvetica,Arial,sans-serif;line-height:1.5}
  h1{margin:0 0 8px;font-size:1.5rem;color:#ffe4b5}
  .subtitle{color:#9ca3af;font-size:0.9rem;margin-bottom:16px}
  .meta{display:flex;gap:16px;flex-wrap:wrap;margin-bottom:16px;font-size:0.85rem;color:#9ca3af}
  .meta span{background:rgba(255,255,255,0.06);padding:4px 10px;border-radius:6px}
  img{display:block;width:100%;max-width:100%;border-radius:8px;border:1px solid rgba(255,255,255,0.08);background:#0a0a0f}
  details{margin-top:16px;border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:12px;background:rgba(255,255,255,0.03)}
  summary{cursor:pointer;font-weight:600;color:#60a5fa;user-select:none}
  pre{white-space:pre-wrap;word-break:break-word;font-size:11px;color:#9ca3af;max-height:400px;overflow:auto;margin:8px 0 0}
  .notes{margin-top:16px;border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:12px;background:rgba(255,255,255,0.03)}
  .notes h3{margin:0 0 8px;font-size:0.95rem;color:#e5e7eb}
  .notes p{margin:0;white-space:pre-wrap;color:#9ca3af;font-size:0.85rem}
  .footer{margin-top:24px;padding-top:12px;border-top:1px solid rgba(255,255,255,0.06);font-size:11px;color:#4b5563;text-align:center}
</style>
</head>
<body>
<h1>${escapeHtml(starName)}</h1>
<div class="subtitle">${escapeHtml(star.class)}${star.grade}-class star · ${summaryText || 'No planetary bodies'}</div>
<div class="meta">
  <span>Seed: ${payload.starfieldSeed}</span>
  <span>Epoch: ${payload.epoch.year}-${String(payload.epoch.month).padStart(2,'0')}-${String(payload.epoch.day).padStart(2,'0')}</span>
  <span>Saved: ${dateStr.slice(0,10)}</span>
</div>
<img src="${dataUrl}" alt="Star system map" />
${gmNotes ? `<div class="notes"><h3>GM Notes</h3><p>${escapeHtml(gmNotes)}</p></div>` : ''}
<details>
  <summary>View Raw System Data</summary>
  <pre>${escapeHtml(jsonData)}</pre>
</details>
<div class="footer">Generated with Mneme System Map v${APP_VERSION} · <a href="https://game-in-the-brain.github.io/2d-star-system-map/" style="color:#4b5563">Open Live Map</a></div>
</body>
</html>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Save the current page as a self-contained HTML file and sync to shared storage.
 */
export function savePage(
  canvas: HTMLCanvasElement,
  payload: MapPayload,
  gmNotes: string,
  starId?: string
): void {
  const html = generateSelfContainedHtml(canvas, payload, gmNotes);
  const starName = payload.starSystem.key || `${payload.starSystem.primaryStar.class}${payload.starSystem.primaryStar.grade}`;
  const safeName = starName.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'system';

  // Download HTML file
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `mneme-2dmap-${safeName}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  // Sync to shared localStorage for 3D map access
  const id = starId || `generated-${Date.now()}`;
  const savedPage: SavedStarPage = {
    starId: id,
    starName,
    savedAt: new Date().toISOString(),
    payload,
    mwgSystem: payload.starSystem,
    gmNotes,
    version: APP_VERSION,
  };
  localStorage.setItem(`mneme-2dmap-${id}`, JSON.stringify(savedPage));
}

/**
 * Load a saved page from localStorage by starId.
 */
export function loadSavedPage(starId: string): SavedStarPage | null {
  try {
    const raw = localStorage.getItem(`mneme-2dmap-${starId}`);
    if (!raw) return null;
    return JSON.parse(raw) as SavedStarPage;
  } catch {
    return null;
  }
}

/**
 * Export system data as CSV.
 */
export function exportToCsv(system: StarSystem): string {
  const rows: string[][] = [];
  rows.push(['Field', 'Value']);
  rows.push(['Star Class', `${system.primaryStar.class}${system.primaryStar.grade}`]);
  rows.push(['Star Mass', String(system.primaryStar.mass)]);
  if (system.mainWorld) {
    rows.push(['Main World Type', system.mainWorld.type]);
    rows.push(['Main World Distance AU', String(system.mainWorld.distanceAU)]);
    rows.push(['Main World Mass EM', String(system.mainWorld.massEM)]);
  }
  rows.push(['Dwarf Planets', String(system.dwarfPlanets?.length || 0)]);
  rows.push(['Terrestrial Worlds', String(system.terrestrialWorlds?.length || 0)]);
  rows.push(['Ice Worlds', String(system.iceWorlds?.length || 0)]);
  rows.push(['Gas Worlds', String(system.gasWorlds?.length || 0)]);
  rows.push(['Moons', String(system.moons?.length || 0)]);
  rows.push(['Disks', String(system.circumstellarDisks?.length || 0)]);
  return rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n');
}

/**
 * Generate a self-contained interactive HTML file with the full 2D map app inlined.
 * Works offline with all features: animation, zoom, pan, time controls, seed editor.
 */
export function generateInteractiveHtml(payload: MapPayload, gmNotes: string): string {
  const starName = payload.starSystem.key || `${payload.starSystem.primaryStar.class}${payload.starSystem.primaryStar.grade}`;
  const dateStr = new Date().toISOString();

  // Inject the payload into the template
  const injectionScript = `<script>window.__MNEME_INITIAL_PAYLOAD__ = ${JSON.stringify(payload)};</script>`;
  const gmNotesScript = `<script>window.__MNEME_GM_NOTES__ = ${JSON.stringify(gmNotes)};</script>`;

  // Replace title
  let html = STANDALONE_TEMPLATE;
  html = html.replace('<title>Mneme System Map</title>', `<title>${escapeHtml(starName)} — Mneme System Map</title>`);

  // Inject payload before the first <script type="module">
  const firstModuleScript = html.indexOf('<script type="module">');
  if (firstModuleScript !== -1) {
    html = html.slice(0, firstModuleScript) + injectionScript + '\n' + gmNotesScript + '\n' + html.slice(firstModuleScript);
  } else {
    // Fallback: inject before closing </head>
    html = html.replace('</head>', injectionScript + '\n' + gmNotesScript + '\n</head>');
  }

  return html;
}

/**
 * Save an interactive animated map as a self-contained HTML file.
 */
export function saveInteractivePage(payload: MapPayload, gmNotes: string, starId?: string): void {
  const html = generateInteractiveHtml(payload, gmNotes);
  const starName = payload.starSystem.key || `${payload.starSystem.primaryStar.class}${payload.starSystem.primaryStar.grade}`;
  const safeName = starName.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'system';

  // Download HTML file
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `mneme-interactive-${safeName}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  // Sync to shared localStorage for 3D map access
  const id = starId || `generated-${Date.now()}`;
  const savedPage: SavedStarPage = {
    starId: id,
    starName,
    savedAt: new Date().toISOString(),
    payload,
    mwgSystem: payload.starSystem,
    gmNotes,
    version: APP_VERSION,
  };
  localStorage.setItem(`mneme-2dmap-${id}`, JSON.stringify(savedPage));
}

/**
 * Export system data as a simple DOCX-compatible HTML file.
 */
export function exportToDocx(system: StarSystem): string {
  const name = system.key || `${system.primaryStar.class}${system.primaryStar.grade}`;
  const rows = [
    ['Star Class', `${system.primaryStar.class}${system.primaryStar.grade}`],
    ['Star Mass', String(system.primaryStar.mass)],
    ...(system.mainWorld
      ? [
          ['Main World Type', system.mainWorld.type],
          ['Main World Distance AU', String(system.mainWorld.distanceAU)],
          ['Main World Mass EM', String(system.mainWorld.massEM)],
        ]
      : []),
    ['Dwarf Planets', String(system.dwarfPlanets?.length || 0)],
    ['Terrestrial Worlds', String(system.terrestrialWorlds?.length || 0)],
    ['Ice Worlds', String(system.iceWorlds?.length || 0)],
    ['Gas Worlds', String(system.gasWorlds?.length || 0)],
    ['Moons', String(system.moons?.length || 0)],
  ];
  const tableRows = rows
    .map((r) => `<tr><td>${escapeHtml(r[0])}</td><td>${escapeHtml(r[1])}</td></tr>`)
    .join('\n');

  return `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><title>${escapeHtml(name)}</title></head>
<body>
<h1>${escapeHtml(name)}</h1>
<table border="1" cellpadding="6" cellspacing="0">${tableRows}</table>
</body>
</html>`;
}
