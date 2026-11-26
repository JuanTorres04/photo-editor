import { useEffect, useRef, useState } from "react";

/** Measures the free space inside an element and finds the biggest box of the given shape (width / height) that fits. */
export function useFit(aspect: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [space, setSpace] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => {
      const style = getComputedStyle(element);
      setSpace({
        width: Math.max(
          0,
          element.clientWidth -
            parseFloat(style.paddingLeft) -
            parseFloat(style.paddingRight),
        ),
        height: Math.max(
          0,
          element.clientHeight -
            parseFloat(style.paddingTop) -
            parseFloat(style.paddingBottom),
        ),
      });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    measure();
    return () => observer.disconnect();
  }, []);

  let width = 0;
  let height = 0;
  if (
    space.width > 0 &&
    space.height > 0 &&
    Number.isFinite(aspect) &&
    aspect > 0
  ) {
    if (space.width / space.height > aspect) {
      height = Math.floor(space.height);
      width = Math.floor(height * aspect);
    } else {
      width = Math.floor(space.width);
      height = Math.floor(width / aspect);
    }
  }
  return { ref, width, height };
}
