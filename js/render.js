// Renderer — WebGL2 point sprites, one buffer upload per frame.
// Falls back to a sprite-blitting canvas2d path if WebGL is unavailable.

import { TYPES, MAX_TYPES, WORLD, MAX_PARTICLES } from './state.js';

// Particles draw at half alpha, so overlapping ones read as denser rather than
// each one simply hiding what is behind it.
const PARTICLE_ALPHA = 0.5;

const VERT = `#version 300 es
in vec2 aPos;
in float aType;
in float aMass;
uniform float uSize;
uniform vec3 uColors[${MAX_TYPES}];
out vec3 vColor;
void main() {
  vec2 p = aPos / ${WORLD.toFixed(1)} * 2.0 - 1.0;
  gl_Position = vec4(p.x, -p.y, 0.0, 1.0);
  // Mass behaves like area, so radius goes as its square root: a merged
  // particle covers the pixels its parts did instead of ballooning.
  gl_PointSize = uSize * sqrt(aMass);
  vColor = uColors[int(aType)];
}`;

const FRAG = `#version 300 es
precision mediump float;
in vec3 vColor;
out vec4 fragColor;
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(c, c);
  if (r2 > 1.0) discard;
  float a = smoothstep(1.0, 0.25, r2) * ${PARTICLE_ALPHA.toFixed(3)};
  fragColor = vec4(vColor * a, a); // premultiplied
}`;

const QUAD_VERT = `#version 300 es
in vec2 aXY;
void main() { gl_Position = vec4(aXY, 0.0, 1.0); }`;

const QUAD_FRAG = `#version 300 es
precision mediump float;
uniform float uFade;
out vec4 fragColor;
void main() { fragColor = vec4(0.0, 0.0, 0.0, uFade); }`;

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(s) || 'shader compile failed');
  }
  return s;
}

function program(gl, vs, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(p) || 'link failed');
  }
  return p;
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.mode = 'webgl';
    try {
      this._initGL();
    } catch (err) {
      console.warn('WebGL unavailable, falling back to canvas2d:', err);
      this.mode = 'canvas';
      this._initCanvas();
    }
  }

  _initGL() {
    const gl = this.canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      // Needed so trails survive across frames.
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance',
    });
    if (!gl) throw new Error('no webgl2');
    this.gl = gl;

    this.prog = program(gl, VERT, FRAG);
    this.uSize = gl.getUniformLocation(this.prog, 'uSize');
    const cols = new Float32Array(MAX_TYPES * 3);
    TYPES.forEach((t, i) => cols.set(t.color, i * 3));
    gl.useProgram(this.prog);
    gl.uniform3fv(gl.getUniformLocation(this.prog, 'uColors[0]'), cols);

    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    this.vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, MAX_PARTICLES * 4 * 4, gl.DYNAMIC_DRAW);
    const aPos = gl.getAttribLocation(this.prog, 'aPos');
    const aType = gl.getAttribLocation(this.prog, 'aType');
    const aMass = gl.getAttribLocation(this.prog, 'aMass');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(aType);
    gl.vertexAttribPointer(aType, 1, gl.FLOAT, false, 16, 8);
    gl.enableVertexAttribArray(aMass);
    gl.vertexAttribPointer(aMass, 1, gl.FLOAT, false, 16, 12);
    gl.bindVertexArray(null);

    // Fullscreen quad used for the fade/clear pass.
    this.quadProg = program(gl, QUAD_VERT, QUAD_FRAG);
    this.uFade = gl.getUniformLocation(this.quadProg, 'uFade');
    this.quadVao = gl.createVertexArray();
    gl.bindVertexArray(this.quadVao);
    const qb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, qb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aXY = gl.getAttribLocation(this.quadProg, 'aXY');
    gl.enableVertexAttribArray(aXY);
    gl.vertexAttribPointer(aXY, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  _initCanvas() {
    this.ctx = this.canvas.getContext('2d', { alpha: false });
    this.sprites = TYPES.map((t) => {
      const R = 16;
      const c = document.createElement('canvas');
      c.width = c.height = R * 2;
      const g = c.getContext('2d');
      const grd = g.createRadialGradient(R, R, 0, R, R, R);
      grd.addColorStop(0, t.hex);
      grd.addColorStop(0.6, t.hex);
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, R * 2, R * 2);
      return c;
    });
  }

  resize(cssSize, dpr) {
    const px = Math.round(cssSize * dpr);
    if (this.canvas.width !== px || this.canvas.height !== px) {
      this.canvas.width = px;
      this.canvas.height = px;
      if (this.gl) {
        this.gl.viewport(0, 0, px, px);
        this.gl.clear(this.gl.COLOR_BUFFER_BIT);
      }
    }
    this.canvas.style.width = cssSize + 'px';
    this.canvas.style.height = cssSize + 'px';
    this.pxSize = px;
    this.dpr = dpr;
  }

  // `data` is an interleaved [x, y, type, mass] view from the simulation.
  draw(data, n, opts) {
    const scale = this.pxSize / WORLD;
    // Floor at 2 CSS pixels. A radius in world units renders less than half as
    // large on a phone as on a desktop, and below ~2px particles vanish.
    const size = Math.max(2 * this.dpr, opts.radius * 2 * scale);
    if (this.mode === 'webgl') this._drawGL(data, n, size, opts.fade);
    else this._drawCanvas(data, n, size, opts.fade);
  }

  _drawGL(data, n, size, fade) {
    const gl = this.gl;
    if (fade >= 0.999) {
      gl.clear(gl.COLOR_BUFFER_BIT);
    } else {
      gl.useProgram(this.quadProg);
      gl.uniform1f(this.uFade, fade);
      gl.bindVertexArray(this.quadVao);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    if (n === 0) return;

    gl.useProgram(this.prog);
    gl.uniform1f(this.uSize, size);
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, data, 0, n * 4);
    gl.drawArrays(gl.POINTS, 0, n);
    gl.bindVertexArray(null);
  }

  _drawCanvas(data, n, size, fade) {
    const ctx = this.ctx;
    const s = this.pxSize;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = `rgba(0,0,0,${fade})`;
    ctx.fillRect(0, 0, s, s);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = PARTICLE_ALPHA;
    const scale = s / WORLD;
    for (let i = 0, k = 0; i < n; i++, k += 4) {
      const px = size * Math.sqrt(data[k + 3]);
      const h = px * 0.5;
      ctx.drawImage(this.sprites[data[k + 2]], data[k] * scale - h, data[k + 1] * scale - h, px, px);
    }
    ctx.globalAlpha = 1;
  }
}
