import { computeScopes } from "./scopes";
import type { ScopeData } from "./scopes";
import type { EditSettings } from "./settings";

const SCOPE_EDGE = 256;

const VERTEX = `#version 300 es
out vec2 v_uv;
void main() {
  // One oversized triangle that covers the screen, so no vertex buffer is needed
  vec2 pos = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  v_uv = vec2(pos.x, 1.0 - pos.y);
  gl_Position = vec4(pos * 2.0 - 1.0, 0.0, 1.0);
}`;

const FRAGMENT = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 outColor;

uniform sampler2D u_image;
uniform float u_exposure;
uniform float u_contrast;
uniform float u_highlights;
uniform float u_shadows;
uniform float u_whites;
uniform float u_blacks;
uniform float u_temperature;
uniform float u_tint;
uniform float u_vibrance;
uniform float u_saturation;
uniform float u_sharpen;
uniform float u_vignette;
uniform float u_grain;

const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

vec3 srgbToLinear(vec3 c) {
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c));
}

vec3 linearToSrgb(vec3 c) {
  c = max(c, vec3(0.0));
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
}

// Tone controls work on display-encoded values, which may exceed 1.0 after an exposure boost
vec3 tone(vec3 p) {
  vec3 hiMask = smoothstep(0.45, 1.0, p);
  vec3 loMask = 1.0 - smoothstep(0.0, 0.55, p);

  p += u_highlights * 0.32 * hiMask * p;
  p += u_shadows * 0.30 * loMask * (1.0 - clamp(p, 0.0, 1.0));
  p += u_whites * 0.20 * smoothstep(0.7, 1.0, p);
  p += u_blacks * 0.18 * (1.0 - smoothstep(0.0, 0.3, p));
  p = max(p, vec3(0.0));

  vec3 pc = clamp(p, 0.0, 1.0);
  vec3 sCurve = pc * pc * (3.0 - 2.0 * pc);
  if (u_contrast >= 0.0) {
    p = mix(p, sCurve, u_contrast);
  } else {
    p = mix(p, vec3(0.5), -u_contrast * 0.6);
  }
  return p;
}

float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void main() {
  vec3 src = texture(u_image, v_uv).rgb;
  vec3 lin = srgbToLinear(src);

  // White balance as per-channel gains, normalised so brightness stays about the same
  vec3 gain = vec3(1.0 + 0.30 * u_temperature, 1.0 - 0.16 * u_tint, 1.0 - 0.30 * u_temperature);
  gain /= dot(gain, LUMA);
  lin *= gain * exp2(u_exposure);

  vec3 p = tone(linearToSrgb(lin));
  p = clamp(p, 0.0, 1.0);

  // Vibrance lifts muted colours more than colours that are already strong
  float luma = dot(p, LUMA);
  float hi = max(p.r, max(p.g, p.b));
  float lo = min(p.r, min(p.g, p.b));
  float chroma = (hi - lo) / max(hi, 0.0001);
  float amount = max(1.0 + u_saturation + u_vibrance * (1.0 - chroma), 0.0);
  p = mix(vec3(luma), p, amount);

  vec2 size = vec2(textureSize(u_image, 0));

  // Sharpening: add back the difference between each pixel and the average of its neighbours
  if (u_sharpen > 0.0) {
    vec2 texel = 1.0 / size;
    vec3 blur = 0.25 * (
      texture(u_image, v_uv + vec2(texel.x, 0.0)).rgb +
      texture(u_image, v_uv - vec2(texel.x, 0.0)).rgb +
      texture(u_image, v_uv + vec2(0.0, texel.y)).rgb +
      texture(u_image, v_uv - vec2(0.0, texel.y)).rgb
    );
    p += (src - blur) * u_sharpen * 2.2;
  }

  // Vignette: darken (negative) or lighten (positive) towards the corners, shaped by the photo's aspect ratio
  if (u_vignette != 0.0) {
    vec2 aspect = vec2(size.x / size.y, 1.0);
    float r = length((v_uv - 0.5) * aspect) / length(aspect * 0.5);
    float edge = smoothstep(0.3, 1.05, r);
    if (u_vignette < 0.0) {
      p *= 1.0 + u_vignette * 0.85 * edge;
    } else {
      p = mix(p, vec3(1.0), u_vignette * 0.6 * edge);
    }
  }

  // Grain: the same texture whatever the export size, strongest in the midtones
  if (u_grain > 0.0) {
    float scale = min(1.0, 1400.0 / max(size.x, size.y));
    float noise = hash(floor(v_uv * size * scale)) - 0.5;
    float midtones = 1.0 - abs(dot(p, LUMA) * 2.0 - 1.0) * 0.6;
    p += noise * u_grain * 0.22 * midtones;
  }

  outColor = vec4(clamp(p, 0.0, 1.0), 1.0);
}`;

const UNIFORM_NAMES = [
  "u_image",
  "u_exposure",
  "u_contrast",
  "u_highlights",
  "u_shadows",
  "u_whites",
  "u_blacks",
  "u_temperature",
  "u_tint",
  "u_vibrance",
  "u_saturation",
  "u_sharpen",
  "u_vignette",
  "u_grain",
] as const;

type UniformName = (typeof UNIFORM_NAMES)[number];

function compile(
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("Could not create a graphics shader.");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? "unknown error";
    gl.deleteShader(shader);
    throw new Error(`The editor's graphics code failed to compile: ${log}`);
  }
  return shader;
}

export class DevelopRenderer {
  readonly width: number;
  readonly height: number;
  private readonly gl: WebGL2RenderingContext;
  private readonly program: WebGLProgram;
  private readonly texture: WebGLTexture;
  private readonly uniforms: Record<UniformName, WebGLUniformLocation | null>;
  private readonly scopeTexture: WebGLTexture;
  private readonly scopeFbo: WebGLFramebuffer;
  private readonly scopeWidth: number;
  private readonly scopeHeight: number;
  private readonly scopePixels: Uint8Array;

  constructor(canvas: HTMLCanvasElement, image: ImageBitmap) {
    const gl = canvas.getContext("webgl2", { antialias: false, alpha: false });
    if (!gl)
      throw new Error(
        "Your browser doesn't support WebGL 2, which the editor needs.",
      );
    this.gl = gl;

    // The canvas keeps the photo's own size; CSS scales it to fit the screen
    this.width = image.width;
    this.height = image.height;
    canvas.width = this.width;
    canvas.height = this.height;

    const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX);
    const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT);
    const program = gl.createProgram();
    if (!program) throw new Error("Could not create the graphics program.");
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(program) ?? "unknown error";
      gl.deleteProgram(program);
      throw new Error(`The editor's graphics program failed to link: ${log}`);
    }
    this.program = program;

    this.uniforms = Object.fromEntries(
      UNIFORM_NAMES.map((name) => [name, gl.getUniformLocation(program, name)]),
    ) as Record<UniformName, WebGLUniformLocation | null>;

    // The photo itself, with mipmaps so the small scope copy is sampled smoothly
    const texture = gl.createTexture();
    if (!texture) throw new Error("Could not create a graphics texture.");
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(
      gl.TEXTURE_2D,
      gl.TEXTURE_MIN_FILTER,
      gl.LINEAR_MIPMAP_LINEAR,
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, image);
    gl.generateMipmap(gl.TEXTURE_2D);
    this.texture = texture;

    // A small off-screen target used to measure the edited photo for the scopes
    const scale = Math.min(1, SCOPE_EDGE / Math.max(image.width, image.height));
    this.scopeWidth = Math.max(1, Math.round(image.width * scale));
    this.scopeHeight = Math.max(1, Math.round(image.height * scale));
    this.scopePixels = new Uint8Array(this.scopeWidth * this.scopeHeight * 4);

    const scopeTexture = gl.createTexture();
    if (!scopeTexture) throw new Error("Could not create a graphics texture.");
    gl.bindTexture(gl.TEXTURE_2D, scopeTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA8,
      this.scopeWidth,
      this.scopeHeight,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      null,
    );
    this.scopeTexture = scopeTexture;

    const scopeFbo = gl.createFramebuffer();
    if (!scopeFbo) throw new Error("Could not create a graphics buffer.");
    gl.bindFramebuffer(gl.FRAMEBUFFER, scopeFbo);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      scopeTexture,
      0,
    );
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error("Your graphics card can't render the histogram.");
    }
    this.scopeFbo = scopeFbo;
  }

  private draw(settings: EditSettings, width: number, height: number): void {
    const { gl, uniforms } = this;
    gl.viewport(0, 0, width, height);
    gl.useProgram(this.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);

    gl.uniform1i(uniforms.u_image, 0);
    gl.uniform1f(uniforms.u_exposure, settings.exposure);
    gl.uniform1f(uniforms.u_contrast, settings.contrast / 100);
    gl.uniform1f(uniforms.u_highlights, settings.highlights / 100);
    gl.uniform1f(uniforms.u_shadows, settings.shadows / 100);
    gl.uniform1f(uniforms.u_whites, settings.whites / 100);
    gl.uniform1f(uniforms.u_blacks, settings.blacks / 100);
    gl.uniform1f(uniforms.u_temperature, settings.temperature / 100);
    gl.uniform1f(uniforms.u_tint, settings.tint / 100);
    gl.uniform1f(uniforms.u_vibrance, settings.vibrance / 100);
    gl.uniform1f(uniforms.u_saturation, settings.saturation / 100);
    gl.uniform1f(uniforms.u_sharpen, settings.sharpen / 100);
    gl.uniform1f(uniforms.u_vignette, settings.vignette / 100);
    gl.uniform1f(uniforms.u_grain, settings.grain / 100);

    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  render(settings: EditSettings): void {
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
    this.draw(settings, this.width, this.height);
  }

  /** Renders a small copy of the edited photo and counts its pixels for the histogram and waveform. */
  readScopes(settings: EditSettings): ScopeData {
    const { gl } = this;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.scopeFbo);
    this.draw(settings, this.scopeWidth, this.scopeHeight);
    gl.readPixels(
      0,
      0,
      this.scopeWidth,
      this.scopeHeight,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      this.scopePixels,
    );
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return computeScopes(this.scopePixels, this.scopeWidth, this.scopeHeight);
  }

  dispose(): void {
    this.gl.deleteFramebuffer(this.scopeFbo);
    this.gl.deleteTexture(this.scopeTexture);
    this.gl.deleteTexture(this.texture);
    this.gl.deleteProgram(this.program);
  }

  /** Frees the whole GPU context. Only for one-off canvases, like the one used for export. */
  release(): void {
    this.dispose();
    this.gl.getExtension("WEBGL_lose_context")?.loseContext();
  }
}
