import { useEffect, useRef } from "react";
import { createScene } from "../scene/waterfallScene";
import type { Scene, SceneVariant } from "../scene/waterfallScene";

interface WaterfallSceneProps {
  className?: string;
  variant?: SceneVariant;
}

export function WaterfallScene({
  className,
  variant = "hero",
}: WaterfallSceneProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let scene: Scene;
    try {
      scene = createScene(canvas, variant);
    } catch {
      return; // no canvas support: the page simply shows its plain background
    }

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    let frame = 0;
    let onScreen = true;
    let width = 0;
    let height = 0;

    const paint = (now: number) => {
      if (width > 0 && height > 0) scene.draw(now / 1000);
    };
    const loop = (now: number) => {
      paint(now);
      frame = requestAnimationFrame(loop);
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
        scene.resize(width, height, Math.min(window.devicePixelRatio || 1, 2));
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
  }, [variant]);

  return <canvas ref={canvasRef} className={className} aria-hidden="true" />;
}
