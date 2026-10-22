import type { GameView, WorldSnapshot } from '@/views/types'
import type { Camera } from '../camera'
import { fogToTexels, ownerMask } from '../grids'
import type { MapRenderer, OverlayState } from '../MapRenderer'
import { OverlayPainter } from '../overlay'
import { INK, PAPER, paletteArray, PLAYER_INK } from '../palette'
import { FRAGMENT_SHADER, VERTEX_SHADER } from './shaders'

/** Le joueur dans la grille de propriétaires (voir le moteur). */
const PLAYER_OWNER = 1

type TextureName = 'uElevation' | 'uBiome' | 'uFog' | 'uTerritory'

/**
 * Rendu WebGL2 sans bibliothèque : un seul triangle plein écran, le shader fait tout.
 * Les grilles du monde vivent dans des textures R8 ; seules les zones modifiées sont renvoyées.
 */
export class WebGlMapRenderer implements MapRenderer {
  private readonly gl: WebGL2RenderingContext
  private readonly program: WebGLProgram
  private readonly textures = new Map<TextureName, WebGLTexture>()
  private readonly uniforms = new Map<string, WebGLUniformLocation | null>()
  private readonly overlay: OverlayPainter
  private world: WorldSnapshot | null = null
  private pixelRatio = 1

  constructor(
    private readonly canvas: HTMLCanvasElement,
    overlayCanvas: HTMLCanvasElement,
    private readonly options: { revealAll?: boolean } = {},
  ) {
    const gl = canvas.getContext('webgl2', { antialias: false, preserveDrawingBuffer: false })
    if (!gl) throw new Error('WebGL2 indisponible')
    this.gl = gl
    this.program = link(gl, VERTEX_SHADER, FRAGMENT_SHADER)
    this.overlay = new OverlayPainter(overlayCanvas)

    const buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    const location = gl.getAttribLocation(this.program, 'aPosition')
    gl.enableVertexAttribArray(location)
    gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0)
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)
  }

  setWorld(world: WorldSnapshot): void {
    this.world = world
    const empty = new Uint8Array(world.width * world.height)
    this.upload('uElevation', world.width, world.height, world.elevation, true)
    this.upload('uBiome', world.width, world.height, world.biome, false)
    this.upload('uFog', world.width, world.height, empty, true)
    this.upload('uTerritory', world.width, world.height, empty, true)
  }

  applyView(view: GameView): void {
    if (view.fog) this.patch('uFog', view.fog, fogToTexels(view.fog))
    if (view.territory)
      this.patch('uTerritory', view.territory, ownerMask(view.territory, PLAYER_OWNER))
  }

  resize(cssWidth: number, cssHeight: number, pixelRatio: number): void {
    this.pixelRatio = pixelRatio
    this.canvas.width = Math.max(1, Math.round(cssWidth * pixelRatio))
    this.canvas.height = Math.max(1, Math.round(cssHeight * pixelRatio))
    this.overlay.resize(cssWidth, cssHeight, pixelRatio)
  }

  render(camera: Camera, overlay: OverlayState): void {
    const { gl, world } = this
    if (!world) return
    gl.viewport(0, 0, this.canvas.width, this.canvas.height)
    gl.useProgram(this.program)
    gl.uniform2f(this.uniform('uView'), this.canvas.width, this.canvas.height)
    gl.uniform2f(this.uniform('uCenter'), camera.cx, camera.cy)
    gl.uniform1f(this.uniform('uZoom'), camera.zoom * this.pixelRatio)
    gl.uniform2f(this.uniform('uWorld'), world.width, world.height)
    gl.uniform3fv(this.uniform('uPalette'), paletteArray())
    gl.uniform3fv(this.uniform('uPaper'), PAPER)
    gl.uniform3fv(this.uniform('uInk'), INK)
    gl.uniform3fv(this.uniform('uPlayerInk'), PLAYER_INK)
    gl.uniform1f(this.uniform('uRevealAll'), this.options.revealAll ? 1 : 0)
    const names: TextureName[] = ['uElevation', 'uBiome', 'uFog', 'uTerritory']
    names.forEach((name, unit) => {
      gl.activeTexture(gl.TEXTURE0 + unit)
      gl.bindTexture(gl.TEXTURE_2D, this.textures.get(name) ?? null)
      gl.uniform1i(this.uniform(name), unit)
    })
    gl.drawArrays(gl.TRIANGLES, 0, 3)
    this.overlay.paint(camera, overlay)
  }

  dispose(): void {
    for (const texture of this.textures.values()) this.gl.deleteTexture(texture)
    this.textures.clear()
    this.gl.deleteProgram(this.program)
  }

  private uniform(name: string): WebGLUniformLocation | null {
    if (!this.uniforms.has(name)) {
      this.uniforms.set(name, this.gl.getUniformLocation(this.program, name))
    }
    return this.uniforms.get(name) ?? null
  }

  private upload(name: TextureName, w: number, h: number, data: Uint8Array, linear: boolean) {
    const { gl } = this
    const old = this.textures.get(name)
    if (old) gl.deleteTexture(old)
    const texture = gl.createTexture()
    if (!texture) throw new Error('Texture impossible à créer')
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, w, h, 0, gl.RED, gl.UNSIGNED_BYTE, data)
    const filter = linear ? gl.LINEAR : gl.NEAREST
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    this.textures.set(name, texture)
  }

  private patch(
    name: TextureName,
    rect: { x: number; y: number; w: number; h: number },
    data: Uint8Array,
  ) {
    const texture = this.textures.get(name)
    if (!texture) return
    const { gl } = this
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texSubImage2D(
      gl.TEXTURE_2D,
      0,
      rect.x,
      rect.y,
      rect.w,
      rect.h,
      gl.RED,
      gl.UNSIGNED_BYTE,
      data,
    )
  }
}

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)
  if (!shader) throw new Error('Shader impossible à créer')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(`Shader invalide : ${gl.getShaderInfoLog(shader)}`)
  }
  return shader
}

function link(gl: WebGL2RenderingContext, vertex: string, fragment: string): WebGLProgram {
  const program = gl.createProgram()
  if (!program) throw new Error('Programme impossible à créer')
  gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, vertex))
  gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, fragment))
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`Programme invalide : ${gl.getProgramInfoLog(program)}`)
  }
  return program
}
