import { useCallback } from "react";
import { useLocation, useSearchParams } from "react-router-dom";

export type OrderEditorTab = "details" | "logs" | "risk";

const TAB_PARAM = "tab";

export function useOrderEditorTab(): [OrderEditorTab, (tab: OrderEditorTab) => void] {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const value = searchParams.get(TAB_PARAM);
  const tab: OrderEditorTab = value === "logs" || value === "risk" ? value : "details";

  const setTab = useCallback((next: OrderEditorTab) => {
    setSearchParams((current) => {
      const params = new URLSearchParams(current);
      if (next === "logs" || next === "risk") params.set(TAB_PARAM, next);
      else params.delete(TAB_PARAM);
      return params;
    }, { replace: true, state: location.state });
  }, [setSearchParams, location.state]);

  return [tab, setTab];
}
