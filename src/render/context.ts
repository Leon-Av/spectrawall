/**
 * WebGL2 wrapper: program compilation, uniform plumbing, offscreen targets
 * for tiled export and thumbnails.
 */

import { FRAG_SRC, VERT_SRC } from './shaders';
import type { WallpaperParams, ResolvedStructure } from '../core/params';
import { backgroundHex } from '../core/params';
import { hexToRgb } from '../core/palette';

export interface RenderTargets {
  width: number; // full image width
  height: number;
  phase: number; // loop phase (radians)
  motion: number; // loop radius
}

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error(`Shader compile error: ${log}`);
  }
  return sh;
}

export class Renderer {
  readonly gl: WebGL2RenderingContext;
  private program: WebGLProgram;
  private loc = new Map<string, WebGLUniformLocation | null>();
  private tileTex: WebGLTexture | null = null;
  private tileFbo: WebGLFramebuffer | null = null;
  private tileW = 0;
  private tileH = 0;

  constructor(public canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', {
      antialias: false,
      alpha: false,
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance',
    });
    if (!gl) throw new Error('WebGL2 is not available');
    this.gl = gl;

    const vs = compile(gl, gl.VERTEX_SHADER, VERT_SRC);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG_SRC);
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error(`Program link error: ${gl.getProgramInfoLog(prog)}`);
    }
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    this.program = prog;
    gl.useProgram(prog);
    // empty VAO: no attributes, positions come from gl_VertexID
    gl.bindVertexArray(gl.createVertexArray());
  }

  get maxTextureSize(): number {
    return this.gl.getParameter(this.gl.MAX_TEXTURE_SIZE) as number;
  }

  private u(name: string): WebGLUniformLocation | null {
    if (!this.loc.has(name)) {
      this.loc.set(name, this.gl.getUniformLocation(this.program, name));
    }
    return this.loc.get(name)!;
  }

  private setUniforms(
    p: WallpaperParams,
    s: ResolvedStructure,
    full: RenderTargets,
    offset: { x: number; y: number },
  ) {
    const gl = this.gl;
    gl.useProgram(this.program);

    gl.uniform2f(this.u('uResolution'), full.width, full.height);
    gl.uniform2f(this.u('uPixelOffset'), offset.x, offset.y);
    gl.uniform1i(this.u('uStyle'), p.style === 'mesh' ? 1 : p.style === 'aurora' ? 2 : 0);
    const bg = hexToRgb(backgroundHex(p));
    gl.uniform3f(this.u('uBg'), bg.r, bg.g, bg.b);
    const colors: number[] = [];
    for (let i = 0; i < 6; i++) {
      const c = hexToRgb(p.palette.colors[Math.min(i, p.palette.colors.length - 1)] ?? '#808080');
      colors.push(c.r, c.g, c.b);
    }
    gl.uniform3fv(this.u('uColors'), colors);
    gl.uniform1i(this.u('uColorCount'), p.palette.colors.length);
    gl.uniform1f(this.u('uColorShare'), p.colorShare);
    gl.uniform1f(this.u('uBlur'), p.blur);
    gl.uniform1f(this.u('uVignette'), p.vignette);
    gl.uniform1f(this.u('uGrain'), p.grain.strength);
    gl.uniform1f(this.u('uGrainSize'), p.grain.size);
    gl.uniform1f(this.u('uPhase'), full.phase);
    gl.uniform1f(this.u('uMotion'), full.motion);
    gl.uniform1f(this.u('uLayers'), s.layers);
    gl.uniform1f(this.u('uScale'), s.scale);
    gl.uniform1f(this.u('uWarp'), s.warp);
    gl.uniform1f(this.u('uStreaks'), s.streaks);
    gl.uniform1f(this.u('uIntensity'), s.intensity);
    gl.uniform1f(this.u('uRot'), s.rot);
    gl.uniform2f(this.u('uShift'), s.shift[0], s.shift[1]);
    const blobs: number[] = [];
    for (let i = 0; i < 8; i++) {
      const b = s.blobs[i];
      blobs.push(b.x, b.y, b.r, i * 0.618);
    }
    gl.uniform4fv(this.u('uBlobs'), blobs);
  }

  /** Render one tile into the offscreen target. (x, y) = global GL px offset of its bottom-left corner. */
  renderTile(p: WallpaperParams, s: ResolvedStructure, full: RenderTargets, x: number, y: number, w: number, h: number): void {
    const gl = this.gl;
    if (w !== this.tileW || h !== this.tileH) {
      if (this.tileTex) gl.deleteTexture(this.tileTex);
      if (this.tileFbo) gl.deleteFramebuffer(this.tileFbo);
      this.tileTex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.tileTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      this.tileFbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.tileFbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.tileTex, 0);
      this.tileW = w;
      this.tileH = h;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.tileFbo);
    gl.viewport(0, 0, w, h);
    this.setUniforms(p, s, full, { x, y });
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /** Read the last rendered tile. Rows are bottom-up (GL order). */
  readTile(): Uint8Array {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.tileFbo);
    const buf = new Uint8Array(this.tileW * this.tileH * 4);
    gl.readPixels(0, 0, this.tileW, this.tileH, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    return buf;
  }

  /** Render straight into the visible preview canvas. */
  renderPreview(p: WallpaperParams, s: ResolvedStructure, phase: number, motion: number): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    this.setUniforms(p, s, { width: this.canvas.width, height: this.canvas.height, phase, motion }, { x: 0, y: 0 });
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  dispose(): void {
    const gl = this.gl;
    if (this.tileTex) gl.deleteTexture(this.tileTex);
    if (this.tileFbo) gl.deleteFramebuffer(this.tileFbo);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}
