/** Caméra de la carte : centre en cellules du monde, zoom en pixels CSS par cellule. */
export interface Camera {
  cx: number
  cy: number
  zoom: number
  viewWidth: number
  viewHeight: number
}

export const MAX_ZOOM = 24

export interface WorldSize {
  width: number
  height: number
}

/** Zoom minimal : le monde entier tient dans la vue, avec un peu de marge. */
export function minZoom(camera: Camera, world: WorldSize): number {
  return Math.min(camera.viewWidth / world.width, camera.viewHeight / world.height) * 0.9
}

export function screenToWorld(camera: Camera, sx: number, sy: number): { x: number; y: number } {
  return {
    x: camera.cx + (sx - camera.viewWidth / 2) / camera.zoom,
    y: camera.cy + (sy - camera.viewHeight / 2) / camera.zoom,
  }
}

export function worldToScreen(camera: Camera, wx: number, wy: number): { x: number; y: number } {
  return {
    x: (wx - camera.cx) * camera.zoom + camera.viewWidth / 2,
    y: (wy - camera.cy) * camera.zoom + camera.viewHeight / 2,
  }
}

/** Garde la caméra dans le monde et dans les bornes de zoom. */
export function clampCamera(camera: Camera, world: WorldSize): Camera {
  const zoom = Math.min(MAX_ZOOM, Math.max(minZoom(camera, world), camera.zoom))
  return {
    ...camera,
    zoom,
    cx: Math.min(world.width, Math.max(0, camera.cx)),
    cy: Math.min(world.height, Math.max(0, camera.cy)),
  }
}

export function pan(camera: Camera, world: WorldSize, dxPx: number, dyPx: number): Camera {
  return clampCamera(
    { ...camera, cx: camera.cx - dxPx / camera.zoom, cy: camera.cy - dyPx / camera.zoom },
    world,
  )
}

/** Zoome en gardant fixe le point du monde sous le curseur. */
export function zoomAt(
  camera: Camera,
  world: WorldSize,
  sx: number,
  sy: number,
  factor: number,
): Camera {
  const before = screenToWorld(camera, sx, sy)
  const zoomed = clampCamera({ ...camera, zoom: camera.zoom * factor }, world)
  const after = screenToWorld(zoomed, sx, sy)
  return clampCamera(
    { ...zoomed, cx: zoomed.cx + before.x - after.x, cy: zoomed.cy + before.y - after.y },
    world,
  )
}

export function centerOn(camera: Camera, world: WorldSize, x: number, y: number): Camera {
  return clampCamera({ ...camera, cx: x, cy: y }, world)
}
