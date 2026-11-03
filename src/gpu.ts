// A tiny instanced-quad renderer. WebGPU on a float16, extended-range canvas where available, so colour
// values above 1.0 shine brighter than white on HDR displays; WebGL2 otherwise (same look, clamped to SDR).

export const STRIDE = 12 // floats per instance: x y size angle | r g b a | aspect shape soft extra
export const MAX = 9000
export type Draw = (data: Float32Array, count: number, w: number, h: number) => void
export type Renderer = { draw: Draw; kind: string; atlas: (letters: HTMLCanvasElement, cell: number) => void }

// Letters live in a 13×2 grid of 128px slots; each is drawn `cell` px tall in the top-left of its slot.
export const SLOT = 128
const ATLAS_W = SLOT * 13, ATLAS_H = SLOT * 2

// Shapes: 0 spark (hot core + halo), 1 shard (pointed sliver), 2 flake (triangle), 3 ring, 4 lit rounded-square rim
// (extra = light angle), 5 cloud, 6 letter (extra = 0..25), 7 filled tile (corner radius matching the CSS tiles).
const WGSL = /* wgsl */ `
struct U { view: vec2f, cell: f32, pad: f32 }
@group(0) @binding(0) var<uniform> u: U;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var atlas: texture_2d<f32>;
struct V { @builtin(position) pos: vec4f, @location(0) uv: vec2f, @location(1) col: vec4f, @location(2) p: vec4f }

@vertex fn vs(@builtin(vertex_index) vi: u32, @location(0) a: vec4f, @location(1) col: vec4f, @location(2) b: vec4f) -> V {
  let c = vec2f(f32(vi & 1u), f32(vi >> 1u)) * 2.0 - 1.0;
  let l = c * vec2f(a.z, a.z / b.x);
  let r = vec2f(cos(a.w), sin(a.w));
  let p = a.xy + vec2f(l.x * r.x - l.y * r.y, l.x * r.y + l.y * r.x);
  var o: V;
  o.pos = vec4f(p.x / u.view.x * 2.0 - 1.0, 1.0 - p.y / u.view.y * 2.0, 0.0, 1.0);
  o.uv = c;
  o.col = col;
  o.p = b;
  return o;
}

@fragment fn fs(i: V) -> @location(0) vec4f {
  let s = i.p.y;
  let soft = i.p.z;
  let r = length(i.uv);
  let slot = vec2f(i.p.w % 13.0, floor(i.p.w / 13.0)) * ${SLOT}.0;
  let letter = textureSample(atlas, samp, (slot + (i.uv * 0.5 + 0.5) * u.cell) / vec2f(${ATLAS_W}.0, ${ATLAS_H}.0)).a;
  let edge = select(abs(i.uv.x) + abs(i.uv.y), max(abs(i.uv.x) * 1.732 + i.uv.y, -2.0 * i.uv.y), s > 1.5);
  var cov = 1.0 - smoothstep(1.0 - max(fwidth(edge), 1e-4) - soft, 1.0, edge);
  let fade = 1.0 - smoothstep(0.9, 1.0, r);
  let q = abs(i.uv) - vec2f(0.78);
  let box = length(max(q, vec2f(0.0))) + min(max(q.x, q.y), 0.0) - 0.12;
  let lit = 0.12 + 0.88 * pow(max(dot(i.uv / max(r, 0.001), vec2f(cos(i.p.w), sin(i.p.w))), 0.0), 3.0);
  let tq = abs(i.uv) - vec2f(0.76);
  let tile = length(max(tq, vec2f(0.0))) + min(max(tq.x, tq.y), 0.0) - 0.24;
  let tileFill = 1.0 - smoothstep(-max(fwidth(tile), 1e-4), 0.0, tile);
  if (s < 0.5) { cov = (exp(-r * r * 6.0) * 0.55 + exp(-r * r * 50.0)) * fade; }
  else if (s > 6.5) { cov = tileFill; }
  else if (s > 5.5) { cov = letter; }
  else if (s > 4.5) { cov = exp(-r * r * 3.5) * fade; }
  else if (s > 3.5) { cov = exp(-pow(box / max(soft, 0.005), 2.0)) * (1.0 - smoothstep(0.95, 1.0, max(abs(i.uv.x), abs(i.uv.y)))) * lit; }
  else if (s > 2.5) { cov = exp(-pow((r - 0.9) / max(soft, 0.005), 2.0)) * fade; }
  return vec4f(i.col.rgb * i.col.a * cov, 1.0);
}`

const VERT = `#version 300 es
uniform vec2 view;
layout(location = 0) in vec4 a;
layout(location = 1) in vec4 col;
layout(location = 2) in vec4 b;
out vec2 uv; out vec4 vcol; out vec4 vp;
void main() {
  vec2 c = vec2(float(gl_VertexID & 1), float(gl_VertexID >> 1)) * 2.0 - 1.0;
  vec2 l = c * vec2(a.z, a.z / b.x);
  vec2 r = vec2(cos(a.w), sin(a.w));
  vec2 p = a.xy + vec2(l.x * r.x - l.y * r.y, l.x * r.y + l.y * r.x);
  gl_Position = vec4(p.x / view.x * 2.0 - 1.0, 1.0 - p.y / view.y * 2.0, 0.0, 1.0);
  uv = c; vcol = col; vp = b;
}`

const FRAG = `#version 300 es
precision highp float;
uniform sampler2D atlas;
uniform float cell;
in vec2 uv; in vec4 vcol; in vec4 vp; out vec4 o;
void main() {
  float s = vp.y, soft = vp.z, r = length(uv);
  vec2 slot = vec2(mod(vp.w, 13.0), floor(vp.w / 13.0)) * ${SLOT}.0;
  float letter = texture(atlas, (slot + (uv * 0.5 + 0.5) * cell) / vec2(${ATLAS_W}.0, ${ATLAS_H}.0)).a;
  float edge = s > 1.5 ? max(abs(uv.x) * 1.732 + uv.y, -2.0 * uv.y) : abs(uv.x) + abs(uv.y);
  float cov = 1.0 - smoothstep(1.0 - max(fwidth(edge), 1e-4) - soft, 1.0, edge);
  float fade = 1.0 - smoothstep(0.9, 1.0, r);
  vec2 q = abs(uv) - vec2(0.78);
  float box = length(max(q, vec2(0.0))) + min(max(q.x, q.y), 0.0) - 0.12;
  float lit = 0.12 + 0.88 * pow(max(dot(uv / max(r, 0.001), vec2(cos(vp.w), sin(vp.w))), 0.0), 3.0);
  vec2 tq = abs(uv) - vec2(0.76);
  float tile = length(max(tq, vec2(0.0))) + min(max(tq.x, tq.y), 0.0) - 0.24;
  float tileFill = 1.0 - smoothstep(-max(fwidth(tile), 1e-4), 0.0, tile);
  if (s < 0.5) cov = (exp(-r * r * 6.0) * 0.55 + exp(-r * r * 50.0)) * fade;
  else if (s > 6.5) cov = tileFill;
  else if (s > 5.5) cov = letter;
  else if (s > 4.5) cov = exp(-r * r * 3.5) * fade;
  else if (s > 3.5) cov = exp(-pow(box / max(soft, 0.005), 2.0)) * (1.0 - smoothstep(0.95, 1.0, max(abs(uv.x), abs(uv.y)))) * lit;
  else if (s > 2.5) cov = exp(-pow((r - 0.9) / max(soft, 0.005), 2.0)) * fade;
  o = vec4(vcol.rgb * vcol.a * cov, 1.0);
}`

export async function renderer(canvas: HTMLCanvasElement): Promise<Renderer | null> {
  const adapter = await navigator.gpu?.requestAdapter().catch(() => null)
  if (adapter) {
    const device = await adapter.requestDevice()
    const ctx = canvas.getContext('webgpu') as GPUCanvasContext
    const format = 'rgba16float'
    ctx.configure({ device, format, alphaMode: 'opaque', toneMapping: { mode: 'extended' } })
    const module = device.createShaderModule({ code: WGSL })
    const add: GPUBlendComponent = { srcFactor: 'one', dstFactor: 'one', operation: 'add' }
    const pipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module,
        entryPoint: 'vs',
        buffers: [{ arrayStride: STRIDE * 4, stepMode: 'instance', attributes: [0, 1, 2].map(i => ({ shaderLocation: i, offset: i * 16, format: 'float32x4' as const })) }],
      },
      fragment: { module, entryPoint: 'fs', targets: [{ format, blend: { color: add, alpha: add } }] },
      primitive: { topology: 'triangle-strip' },
    })
    // Usage flags as literals (the DOM lib only declares the types): buffer UNIFORM 0x40, VERTEX 0x20,
    // COPY_DST 0x08; texture TEXTURE_BINDING 0x04, COPY_DST 0x02, RENDER_ATTACHMENT 0x10.
    const ubuf = device.createBuffer({ size: 16, usage: 0x40 | 0x08 })
    const ibuf = device.createBuffer({ size: MAX * STRIDE * 4, usage: 0x20 | 0x08 })
    const tex = device.createTexture({ size: [ATLAS_W, ATLAS_H], format: 'rgba8unorm', usage: 0x04 | 0x02 | 0x10 })
    const bind = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: ubuf } },
        { binding: 1, resource: device.createSampler({ magFilter: 'linear', minFilter: 'linear' }) },
        { binding: 2, resource: tex.createView() },
      ],
    })
    const uni = new Float32Array(4)
    const draw: Draw = (data, n, w, h) => {
      uni[0] = w
      uni[1] = h
      device.queue.writeBuffer(ubuf, 0, uni)
      if (n) device.queue.writeBuffer(ibuf, 0, data, 0, n * STRIDE)
      const enc = device.createCommandEncoder()
      const pass = enc.beginRenderPass({ colorAttachments: [{ view: ctx.getCurrentTexture().createView(), clearValue: [0, 0, 0, 1], loadOp: 'clear', storeOp: 'store' }] })
      pass.setPipeline(pipeline)
      pass.setBindGroup(0, bind)
      pass.setVertexBuffer(0, ibuf)
      if (n) pass.draw(4, n)
      pass.end()
      device.queue.submit([enc.finish()])
    }
    const atlas = (letters: HTMLCanvasElement, cell: number) => {
      uni[2] = cell
      device.queue.copyExternalImageToTexture({ source: letters }, { texture: tex }, [ATLAS_W, ATLAS_H])
    }
    return { draw, kind: 'webgpu', atlas }
  }

  const gl = canvas.getContext('webgl2', { alpha: false, antialias: false })
  if (!gl) return null
  const prog = gl.createProgram()
  for (const [type, src] of [[gl.VERTEX_SHADER, VERT], [gl.FRAGMENT_SHADER, FRAG]] as const) {
    const sh = gl.createShader(type)!
    gl.shaderSource(sh, src)
    gl.compileShader(sh)
    gl.attachShader(prog, sh)
  }
  gl.linkProgram(prog)
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null
  gl.useProgram(prog)
  const view = gl.getUniformLocation(prog, 'view'), cellLoc = gl.getUniformLocation(prog, 'cell')
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer())
  gl.bufferData(gl.ARRAY_BUFFER, MAX * STRIDE * 4, gl.DYNAMIC_DRAW)
  for (let i = 0; i < 3; i++) {
    gl.enableVertexAttribArray(i)
    gl.vertexAttribPointer(i, 4, gl.FLOAT, false, STRIDE * 4, i * 16)
    gl.vertexAttribDivisor(i, 1)
  }
  gl.bindTexture(gl.TEXTURE_2D, gl.createTexture())
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4))
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.enable(gl.BLEND)
  gl.blendFunc(gl.ONE, gl.ONE)
  const draw: Draw = (data, n, w, h) => {
    gl.viewport(0, 0, canvas.width, canvas.height)
    gl.clearColor(0, 0, 0, 1)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.uniform2f(view, w, h)
    if (!n) return
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, data, 0, n * STRIDE)
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, n)
  }
  const atlas = (letters: HTMLCanvasElement, cell: number) => {
    gl.uniform1f(cellLoc, cell)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, letters)
  }
  return { draw, kind: 'webgl2', atlas }
}
