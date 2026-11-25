import { createAmbient } from "../scene/ambientScene";
import { SceneCanvas } from "./SceneCanvas";

interface AmbientSceneProps {
  className?: string;
}

export function AmbientScene({ className }: AmbientSceneProps) {
  // 30 frames a second is plenty for something this slow, and easier on batteries
  return (
    <SceneCanvas className={className} create={createAmbient} maxFps={30} />
  );
}
