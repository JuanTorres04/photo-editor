import { DEFAULT_CURVES, buildLut, curvesAreIdentity } from "./curves";
import type { CurveSet } from "./curves";
import { orientedSize } from "./geometry";
import type { Size } from "./geometry";
import { computeScopes } from "./scopes";
import type { ScopeData } from "./scopes";
import type { EditSettings } from "./settings";

const SCOPE_EDGE = 256;

export interface RenderOptions {
  /** While cropping: show the whole straightened photo, with empty corners dark, instead of the cropped result. */
  showFrame?: boolean;
}

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
uniform sampler2D u_curve;
uniform float u_curveOn;
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
uniform vec4 u_crop;       // x, y, width, height of the crop inside the straightened picture (0 to 1)
uniform float u_angle;     // straighten angle in radians
uniform float u_quarter;   // quarter turns clockwise, 0 to 3
uniform vec2 u_flip;       // 1.0 where the picture is mirrored horizontally / vertically
uniform vec2 u_oriented;   // size in pixels after the quarter turns, before straightening
uniform vec2 u_outSize;    // size in pixels of the picture being drawn
uniform float u_showFrame; // 1.0 while cropping: show the whole frame

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

// Finds where a point of the finished picture comes from in the original photo.
// Returns false for points that fall outside the (straightened) photo.
bool mapToSource(vec2 uv, out vec2 src) {
  vec2 f = u_crop.xy + uv * u_crop.zw;                   // position in the straightened picture
  vec2 p = (f - 0.5) * u_oriented;                       // pixels from its centre
  float c = cos(u_angle);
  float s = sin(u_angle);
  vec2 q = vec2(c * p.x + s * p.y, -s * p.x + c * p.y);  // undo the straighten rotation
  vec2 o = q / u_oriented + 0.5;                         // position in the turned and mirrored photo
  bool inside = o.x >= 0.0 && o.x <= 1.0 && o.y >= 0.0 && o.y <= 1.0;
  o = mix(o, vec2(1.0) - o, u_flip);                     // undo the mirroring
  if (u_quarter > 0.5 && u_quarter < 1.5) {
    src = vec2(o.y, 1.0 - o.x);                          // undo the quarter turns
  } else if (u_quarter > 1.5 && u_quarter < 2.5) {
    src = vec2(1.0 - o.x, 1.0 - o.y);
  } else if (u_quarter > 2.5) {
    src = vec2(1.0 - o.y, o.x);
  } else {
    src = o;
  }
  return inside;
}

void main() {
  vec2 srcUv;
  bool inside = mapToSource(v_uv, srcUv);
  vec3 src = texture(u_image, srcUv).rgb;
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

  // Tone curves: a lookup table that folds the RGB curve and each colour channel's curve together
  if (u_curveOn > 0.5) {
    vec3 t = (clamp(p, 0.0, 1.0) * 255.0 + 0.5) / 256.0;
    p = vec3(
      texture(u_curve, vec2(t.r, 0.5)).r,
      texture(u_curve, vec2(t.g, 0.5)).g,
      texture(u_curve, vec2(t.b, 0.5)).b
    );
  }

  // Sharpening: add back the difference between each pixel and the average of its neighbours
  if (u_sharpen > 0.0) {
    vec2 texel = 1.0 / vec2(textureSize(u_image, 0));
    vec3 blur = 0.25 * (
      texture(u_image, srcUv + vec2(texel.x, 0.0)).rgb +
      texture(u_image, srcUv - vec2(texel.x, 0.0)).rgb +
      texture(u_image, srcUv + vec2(0.0, texel.y)).rgb +
      texture(u_image, srcUv - vec2(0.0, texel.y)).rgb
    );
    p += (src - blur) * u_sharpen * 2.2;
  }

  // Vignette: darken (negative) or lighten (positive) towards the corners of the finished picture
  if (u_vignette != 0.0) {
    vec2 aspect = vec2(u_outSize.x / u_outSize.y, 1.0);
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
    float scale = min(1.0, 1400.0 / max(u_outSize.x, u_outSize.y));
    float noise = hash(floor(v_uv * u_outSize * scale)) - 0.5;
    float midtones = 1.0 - abs(dot(p, LUMA) * 2.0 - 1.0) * 0.6;
    p += noise * u_grain * 0.22 * midtones;
  }

  p = clamp(p, 0.0, 1.0);
  // While cropping, the empty corners of a tilted photo show as dark
  if (!inside && u_showFrame > 0.5) p = vec3(0.035, 0.05, 0.05);
  outColor = vec4(p, 1.0);
}`;

const UNIFORM_NAMES = [
  "u_image",
  "u_curve",
  "u_curveOn",
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
  "u_crop",
  "u_angle",
  "u_quarter",
  "u_flip",
  "u_oriented",
  "u_outSize",
  "u_showFrame",
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
  private readonly canvas: HTMLCanvasElement;
  private readonly gl: WebGL2RenderingContext;
  private readonly program: WebGLProgram;
  private readonly texture: WebGLTexture;
  private readonly uniforms: Record<UniformName, WebGLUniformLocation | null>;
  private readonly scopeTexture: WebGLTexture;
  private readonly scopeFbo: WebGLFramebuffer;
  private readonly scopeWidth: number;
  private readonly scopeHeight: number;
  private readonly scopePixels: Uint8Array;
  private readonly curveTexture: WebGLTexture;
  private curveRef: CurveSet = DEFAULT_CURVES;

  constructor(canvas: HTMLCanvasElement, image: ImageBitmap) {
    const gl = canvas.getContext("webgl2", { antialias: false, alpha: false });
    if (!gl)
      throw new Error(
        "Your browser doesn't support WebGL 2, which the editor needs.",
      );
    this.canvas = canvas;
    this.gl = gl;

    // The canvas follows the size of the finished picture; CSS scales it to fit the screen
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

    // The tone curve lookup table
    const curveTexture = gl.createTexture();
    if (!curveTexture) throw new Error("Could not create a graphics texture.");
    gl.bindTexture(gl.TEXTURE_2D, curveTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA8,
      256,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      buildLut(DEFAULT_CURVES),
    );
    this.curveTexture = curveTexture;
  }

  /** The size of the finished picture: the crop, or the whole straightened frame while cropping. */
  private outputSize(settings: EditSettings, frame: boolean): Size {
    const oriented = orientedSize(
      this.width,
      this.height,
      settings.crop.quarter,
    );
    if (frame) return oriented;
    return {
      width: Math.max(1, Math.round(settings.crop.w * oriented.width)),
      height: Math.max(1, Math.round(settings.crop.h * oriented.height)),
    };
  }

  private draw(
    settings: EditSettings,
    target: Size,
    out: Size,
    frame: boolean,
  ): void {
    const { gl, uniforms } = this;
    gl.viewport(0, 0, target.width, target.height);
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

    const { crop } = settings;
    const oriented = orientedSize(this.width, this.height, crop.quarter);
    if (frame) gl.uniform4f(uniforms.u_crop, 0, 0, 1, 1);
    else gl.uniform4f(uniforms.u_crop, crop.x, crop.y, crop.w, crop.h);
    gl.uniform1f(uniforms.u_angle, (crop.angle * Math.PI) / 180);
    gl.uniform1f(uniforms.u_quarter, crop.quarter);
    gl.uniform2f(uniforms.u_flip, crop.flipH ? 1 : 0, crop.flipV ? 1 : 0);
    gl.uniform2f(uniforms.u_oriented, oriented.width, oriented.height);
    gl.uniform2f(uniforms.u_outSize, out.width, out.height);
    gl.uniform1f(uniforms.u_showFrame, frame ? 1 : 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.curveTexture);
    if (settings.curves !== this.curveRef) {
      gl.texSubImage2D(
        gl.TEXTURE_2D,
        0,
        0,
        0,
        256,
        1,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        buildLut(settings.curves),
      );
      this.curveRef = settings.curves;
    }
    gl.uniform1i(uniforms.u_curve, 1);
    gl.uniform1f(
      uniforms.u_curveOn,
      curvesAreIdentity(settings.curves) ? 0 : 1,
    );
    gl.activeTexture(gl.TEXTURE0);

    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  render(settings: EditSettings, options: RenderOptions = {}): void {
    const frame = options.showFrame === true;
    const out = this.outputSize(settings, frame);
    if (this.canvas.width !== out.width || this.canvas.height !== out.height) {
      this.canvas.width = out.width;
      this.canvas.height = out.height;
    }
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
    this.draw(settings, out, out, frame);
  }

  /** Renders a small copy of the edited photo and counts its pixels for the histogram and waveform. */
  readScopes(settings: EditSettings): ScopeData {
    const { gl } = this;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.scopeFbo);
    this.draw(
      settings,
      { width: this.scopeWidth, height: this.scopeHeight },
      this.outputSize(settings, false),
      false,
    );
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
    this.gl.deleteTexture(this.curveTexture);
    this.gl.deleteTexture(this.texture);
    this.gl.deleteProgram(this.program);
  }

  /** Frees the whole GPU context. Only for one-off canvases, like the one used for export. */
  release(): void {
    this.dispose();
    this.gl.getExtension("WEBGL_lose_context")?.loseContext();
  }
}
