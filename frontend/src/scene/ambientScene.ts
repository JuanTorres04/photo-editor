import {
  FOG_W,
  firLine,
  get2d,
  makeCanvas,
  makeFogTexture,
  makeNoise,
  makeSprite,
  mulberry32,
} from "./shared";
import type { Ctx, Scene } from "./shared";

interface Speck {
  u: number;
  v: number;
  size: number;
  phase: number;
  speed: number;
  base: number;
}

interface Fly {
  u: number;
  v: number;
  ax: number;
  ay: number;
  sx: number;
  sy: number;
  phase: number;
  tw: number;
  size: number;
}

/** The part that never moves: a deep night sky and two rows of dark firs along the bottom. */
function paintStill(g: Ctx, w: number, h: number): void {
  const sky = g.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, "#050c12");
  sky.addColorStop(0.5, "#0a1a1e");
  sky.addColorStop(1, "#0d2a2c");
  g.fillStyle = sky;
  g.fillRect(0, 0, w, h);

  const reach = Math.max(w, h);
  const moon = g.createRadialGradient(
    w * 0.16,
    h * 0.13,
    0,
    w * 0.16,
    h * 0.13,
    reach * 0.35,
  );
  moon.addColorStop(0, "rgba(214,236,240,0.10)");
  moon.addColorStop(1, "rgba(214,236,240,0)");
  g.fillStyle = moon;
  g.fillRect(0, 0, w, h);

  const glow = g.createRadialGradient(w * 0.7, h, 0, w * 0.7, h, reach * 0.5);
  glow.addColorStop(0, "rgba(222,166,112,0.07)");
  glow.addColorStop(1, "rgba(222,166,112,0)");
  g.fillStyle = glow;
  g.fillRect(0, 0, w, h);

  const hills = makeNoise(7);
  firLine(g, {
    seed: 11,
    from: -20,
    to: w + 20,
    bottom: h + 20,
    ground: (x) => h - 70 - hills(x / 140) * 50,
    minHeight: 36,
    maxHeight: 84,
    spacing: 12,
    fill: "#08201f",
  });
  firLine(g, {
    seed: 12,
    from: -20,
    to: w + 20,
    bottom: h + 20,
    ground: (x) => h - 14 - hills(x / 100 + 5) * 18,
    minHeight: 56,
    maxHeight: 120,
    spacing: 16,
    fill: "#04100f",
  });
}

/** A quiet background for the library: twinkling stars, drifting fog, faint light, and a few fireflies. */
export function createAmbient(canvas: HTMLCanvasElement): Scene {
  const ctx = get2d(canvas);
  const rand = mulberry32(404);
  const fogTexture = makeFogTexture();
  const fireSprite = makeSprite(64, [228, 242, 118], 0.9);
  const still = makeCanvas(1, 1);

  const stars: Speck[] = Array.from({ length: 90 }, () => ({
    u: rand(),
    v: rand() * 0.45,
    size: 0.6 + rand(),
    phase: rand() * 6.28,
    speed: 0.4 + rand() * 1.2,
    base: 0.18 + rand() * 0.3,
  }));
  const flies: Fly[] = Array.from({ length: 16 }, () => ({
    u: rand(),
    v: 0.45 + rand() * 0.5,
    ax: 10 + rand() * 22,
    ay: 8 + rand() * 14,
    sx: 0.12 + rand() * 0.25,
    sy: 0.15 + rand() * 0.3,
    phase: rand() * 6.28,
    tw: 0.5 + rand(),
    size: 8 + rand() * 10,
  }));

  let width = 0;
  let height = 0;
  let ratio = 1;
  let ready = false;

  function resize(w: number, h: number, dpr: number): void {
    width = w;
    height = h;
    ratio = dpr;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    still.width = canvas.width;
    still.height = canvas.height;
    const g = get2d(still);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    paintStill(g, w, h);
    ready = true;
  }

  function drawFog(
    y: number,
    tileHeight: number,
    speed: number,
    alpha: number,
    t: number,
  ): void {
    const shift = (t * speed) % FOG_W;
    ctx.globalAlpha = alpha;
    for (let x = -shift; x < width; x += FOG_W)
      ctx.drawImage(fogTexture, x, y, FOG_W, tileHeight);
    ctx.globalAlpha = 1;
  }

  function draw(t: number): void {
    if (!ready) return;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(still, 0, 0);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

    for (const star of stars) {
      const twinkle = 0.55 + 0.45 * Math.sin(t * star.speed + star.phase);
      ctx.fillStyle = `rgba(226,240,246,${(star.base * twinkle).toFixed(3)})`;
      ctx.fillRect(star.u * width, star.v * height, star.size, star.size);
    }

    const tile = Math.max(160, height * 0.3);
    drawFog(height * 0.6, tile, 6, 0.3, t);
    drawFog(height * 0.8, tile, 10, 0.26, t);

    // two very faint beams of light, breathing slowly
    for (const [index, left] of [0.1, 0.32].entries()) {
      const pulse = 0.7 + 0.3 * Math.sin(t * 0.3 + index * 2);
      const beam = ctx.createLinearGradient(0, 0, 0, height * 0.9);
      beam.addColorStop(0, `rgba(220,245,235,${(0.04 * pulse).toFixed(3)})`);
      beam.addColorStop(1, "rgba(220,245,235,0)");
      ctx.fillStyle = beam;
      ctx.beginPath();
      ctx.moveTo(width * left, 0);
      ctx.lineTo(width * (left + 0.08), 0);
      ctx.lineTo(width * (left + 0.42), height * 0.9);
      ctx.lineTo(width * (left + 0.3), height * 0.9);
      ctx.closePath();
      ctx.fill();
    }

    for (const fly of flies) {
      const x = fly.u * width + Math.sin(t * fly.sx + fly.phase) * fly.ax;
      const y =
        fly.v * height + Math.cos(t * fly.sy + fly.phase * 1.7) * fly.ay;
      const glow = Math.max(0, Math.sin(t * fly.tw + fly.phase * 3));
      const size = fly.size * (0.8 + glow * 0.5);
      ctx.globalAlpha = (0.12 + 0.6 * glow * glow) * 0.7;
      ctx.drawImage(fireSprite, x - size / 2, y - size / 2, size, size);
    }
    ctx.globalAlpha = 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  return { resize, draw };
}
