import type { Point } from './types';

/**
 * Deterministic PRNG: Mulberry32.
 * Given a seed string, returns a function that yields numbers in [0, 1).
 */
export function mulberry32(seedStr: string): () => number {
  // Hash the seed string into a 32-bit integer
  let h = 1779033703 ^ seedStr.length;
  for (let i = 0; i < seedStr.length; i++) {
    h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let state = h >>> 0;

  return function () {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Star {
  x: number;
  y: number;
  radius: number;
  opacity: number;
  colour: string;
}

export interface Nebula {
  x: number;
  y: number;
  radius: number;
  colour: string;
  opacity: number;
}

const STAR_COLOURS = ['#ffffff', '#dbeafe', '#fef3c7'];
const NEBULA_COLOURS = ['#4c1d95', '#312e81', '#1e3a8a', '#831843']; // violet, indigo, blue, pink

/**
 * Generate a seeded starfield for a given viewport size.
 */
export function generateStarfield(seed: string, width: number, height: number, density = 300): Star[] {
  const rng = mulberry32(seed);
  const count = Math.max(100, Math.floor((width * height) / (1920 * 1080) * density));
  const stars: Star[] = [];

  for (let i = 0; i < count; i++) {
    stars.push({
      x: rng() * width,
      y: rng() * height,
      radius: 0.5 + rng() * 1.5,
      opacity: 0.1 + rng() * 0.7,
      colour: STAR_COLOURS[Math.floor(rng() * STAR_COLOURS.length)],
    });
  }

  return stars;
}

/**
 * Generate faint nebula clouds for a given viewport size.
 */
export function generateNebula(seed: string, width: number, height: number): Nebula[] {
  const rng = mulberry32(`${seed}-nebula`);
  const count = 3 + Math.floor(rng() * 4); // 3–6 clouds
  const nebulas: Nebula[] = [];

  for (let i = 0; i < count; i++) {
    nebulas.push({
      x: rng() * width,
      y: rng() * height,
      radius: 100 + rng() * 300,
      colour: NEBULA_COLOURS[Math.floor(rng() * NEBULA_COLOURS.length)],
      opacity: 0.03 + rng() * 0.05,
    });
  }

  return nebulas;
}

/**
 * Draw nebula clouds onto the canvas.
 */
export function drawNebula(ctx: CanvasRenderingContext2D, nebulas: Nebula[]): void {
  ctx.save();
  for (const n of nebulas) {
    const g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.radius);
    g.addColorStop(0, n.colour);
    g.addColorStop(1, 'transparent');
    ctx.globalAlpha = n.opacity;
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/**
 * Draw the starfield onto the canvas.
 */
export function drawStarfield(ctx: CanvasRenderingContext2D, stars: Star[]): void {
  ctx.save();
  for (const star of stars) {
    ctx.globalAlpha = star.opacity;
    ctx.fillStyle = star.colour;
    ctx.beginPath();
    ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
