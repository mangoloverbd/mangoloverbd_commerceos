import { useCallback } from "react";
import { useLocation, useSearchParams } from "react-router-dom";

export type OrderEditorTab = "details" | "logs";

const TAB_PARAM = "tab";

export function useOrderEditorTab(): [OrderEditorTab, (tab: OrderEditorTab) => void] {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const tab: OrderEditorTab = searchParams.get(TAB_PARAM) === "logs" ? "logs" : "details";

  const setTab = useCallback((next: OrderEditorTab) => {
    setSearchParams((current) => {
      const params = new URLSearchParams(current);
      if (next === "logs") params.set(TAB_PARAM, "logs");
      else params.delete(TAB_PARAM);
      return params;
    }, { replace: true, state: location.state });
  }, [setSearchParams, location.state]);

  return [tab, setTab];
}
