import { useEffect, type ReactNode } from "react";

/**
 * Forces the delivery partner section to always render in light mode,
 * regardless of the user's theme preference. The previous theme is restored
 * when the wrapper unmounts (i.e. when the user navigates away).
 */
const DeliveryLightThemeWrapper = ({ children }: { children: ReactNode }) => {
  useEffect(() => {
    const root = document.documentElement;
    const hadDark = root.classList.contains("dark");
    if (hadDark) root.classList.remove("dark");
    return () => {
      if (hadDark) root.classList.add("dark");
    };
  }, []);

  return <>{children}</>;
};

export default DeliveryLightThemeWrapper;
