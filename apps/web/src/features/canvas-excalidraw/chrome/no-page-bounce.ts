import { useEffect } from "react";

// The board owns every pan and zoom gesture. Without this, a trackpad swipe
// that reaches the page rubber-bands the whole web view, exposing a light strip
// beside the board and leaving the canvas out of place.
export function useNoPageBounce(): void {
  useEffect(() => {
    const targets = [document.documentElement, document.body];
    const previous = targets.map((element) => element.style.overscrollBehavior);
    for (const element of targets) element.style.overscrollBehavior = "none";
    return () => targets.forEach((element, index) => { element.style.overscrollBehavior = previous[index]!; });
  }, []);
}
