import type { CameraState, Point } from './types';

export function createDefaultCamera(): CameraState {
  return { x: 0, y: 0, zoom: 1 };
}

/**
 * Convert world coordinates (AU) to screen coordinates (px).
 */
export function worldToScreen(point: Point, camera: CameraState, cx: number, cy: number): Point {
  return {
    x: cx + (point.x - camera.x) * camera.zoom,
    y: cy + (point.y - camera.y) * camera.zoom,
  };
}

/**
 * Convert screen coordinates (px) to world coordinates (AU).
 */
export function screenToWorld(point: Point, camera: CameraState, cx: number, cy: number): Point {
  return {
    x: camera.x + (point.x - cx) / camera.zoom,
    y: camera.y + (point.y - cy) / camera.zoom,
  };
}

/**
 * Logarithmic distance scaler so inner and outer bodies both fit.
 * Returns a visual radius in arbitrary world units.
 */
export function logScaleDistance(au: number, scaleFactor = 80): number {
  return Math.log10(au + 1) * scaleFactor;
}

/**
 * Zoom the camera in or out around a specific screen point.
 * factor > 1 zooms in, factor < 1 zooms out.
 */
export function zoomTo(camera: CameraState, screenPoint: Point, cx: number, cy: number, factor: number): void {
  const worldBefore = screenToWorld(screenPoint, camera, cx, cy);
  camera.zoom *= factor;
  // Clamp zoom to reasonable bounds
  camera.zoom = Math.max(0.1, Math.min(camera.zoom, 50));
  const worldAfter = screenToWorld(screenPoint, camera, cx, cy);
  camera.x += worldAfter.x - worldBefore.x;
  camera.y += worldAfter.y - worldBefore.y;
}

/**
 * Pan the camera by a screen-pixel delta.
 */
export function pan(camera: CameraState, dx: number, dy: number): void {
  camera.x -= dx / camera.zoom;
  camera.y -= dy / camera.zoom;
}

/**
 * Reset camera to a default view that fits the outermost body.
 */
export function resetCamera(camera: CameraState, width: number, height: number, maxAU: number): void {
  const targetZoom = Math.min(width, height) / (logScaleDistance(maxAU, 80) * 2.5);
  camera.zoom = targetZoom > 0 ? targetZoom : 1;
  camera.x = 0;
  camera.y = 0;
}
