import { useEffect, useState } from "react";

export interface ResponsiveUiState {
  isNarrowViewport: boolean;
  isTouchPrimary: boolean;
  isMobileUi: boolean;
}

export function useResponsiveUi(): ResponsiveUiState {
  const [state, setState] = useState<ResponsiveUiState>({
    isNarrowViewport: false,
    isTouchPrimary: false,
    isMobileUi: false
  });

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }

    const narrowQuery = window.matchMedia("(max-width: 768px)");
    const touchQuery = window.matchMedia("(pointer: coarse)");

    const update = (): void => {
      const isNarrowViewport = narrowQuery.matches;
      const isTouchPrimary = touchQuery.matches;
      setState({
        isNarrowViewport,
        isTouchPrimary,
        isMobileUi: isNarrowViewport || isTouchPrimary
      });
    };

    update();
    narrowQuery.addEventListener("change", update);
    touchQuery.addEventListener("change", update);

    return () => {
      narrowQuery.removeEventListener("change", update);
      touchQuery.removeEventListener("change", update);
    };
  }, []);

  return state;
}
