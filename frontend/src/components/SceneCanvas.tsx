import { useEffect, useRef } from "react";
import type { Scene } from "../scene/shared";

interface SceneCanvasProps {
  className?: string;
  /** Builds the scene for this canvas. Must keep the same identity between renders. */
  create: (canvas: HTMLCanvasElement) => Scene;
  /** Limits the animation speed to save battery. Leave out for full speed. */
  maxFps?: number;
}

// Keeps big screens from allocating huge canvases
const PIXEL_BUDGET = 4_000_000;

export function SceneCanvas({ className, create, maxFps }: SceneCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let scene: Scene;
    try {
      scene = create(canvas);
    } catch {
      return; // no canvas support: the page simply shows its plain background
    }

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const minGap = maxFps ? 1000 / maxFps - 2 : 0;
    let frame = 0;
    let last = 0;
    let onScreen = true;
    let width = 0;
    let height = 0;

    const paint = (now: number) => {
      if (width > 0 && height > 0) scene.draw(now / 1000);
    };
    const loop = (now: number) => {
      frame = requestAnimationFrame(loop);
      if (minGap > 0 && now - last < minGap) return;
      last = now;
      paint(now);
    };
    const stop = () => {
      if (frame !== 0) {
        cancelAnimationFrame(frame);
        frame = 0;
      }
    };
    const start = () => {
      if (!reduceMotion && onScreen && !document.hidden && frame === 0) {
        frame = requestAnimationFrame(loop);
      }
    };
    const measure = () => {
      const box = canvas.getBoundingClientRect();
      width = Math.round(box.width);
      height = Math.round(box.height);
      if (width > 0 && height > 0) {
        const ratio = Math.max(
          0.5,
          Math.min(
            window.devicePixelRatio || 1,
            2,
            Math.sqrt(PIXEL_BUDGET / (width * height)),
          ),
        );
        scene.resize(width, height, ratio);
        // with reduced motion there is no loop, so show one still frame
        paint(reduceMotion ? 4000 : performance.now());
      }
    };

    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(canvas);
    const intersection = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
      if (onScreen) start();
      else stop();
    });
    intersection.observe(canvas);
    const onVisibility = () => {
      if (document.hidden) stop();
      else start();
    };
    document.addEventListener("visibilitychange", onVisibility);

    measure();
    start();

    return () => {
      stop();
      resizeObserver.disconnect();
      intersection.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [create, maxFps]);

  return <canvas ref={canvasRef} className={className} aria-hidden="true" />;
}
