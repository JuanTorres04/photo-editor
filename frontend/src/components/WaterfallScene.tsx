import { useCallback } from "react";
import { createScene } from "../scene/waterfallScene";
import type { SceneVariant } from "../scene/waterfallScene";
import { SceneCanvas } from "./SceneCanvas";

interface WaterfallSceneProps {
  className?: string;
  variant?: SceneVariant;
}

export function WaterfallScene({
  className,
  variant = "full",
}: WaterfallSceneProps) {
  const create = useCallback(
    (canvas: HTMLCanvasElement) => createScene(canvas, variant),
    [variant],
  );
  return <SceneCanvas className={className} create={create} />;
}
