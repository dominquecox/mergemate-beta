import React, { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from "react";

interface TopBarActionsValue {
  actions: ReactNode;
  setActions: (actions: ReactNode) => void;
  clearActions: () => void;
}

const TopBarActionsContext = createContext<TopBarActionsValue | null>(null);
/** Setters only, so a screen that sets actions does not re-render when they change. */
const TopBarActionSettersContext = createContext<Pick<TopBarActionsValue, "setActions" | "clearActions"> | null>(null);

export function TopBarActionsProvider({ children }: { children: ReactNode }) {
  const [actions, setActions] = useState<ReactNode>(null);
  const clearActions = useCallback(() => setActions(null), []);
  const value = useMemo(() => ({ actions, setActions, clearActions }), [actions, clearActions]);
  const setters = useMemo(() => ({ setActions, clearActions }), [clearActions]);
  return (
    <TopBarActionSettersContext.Provider value={setters}>
      <TopBarActionsContext.Provider value={value}>{children}</TopBarActionsContext.Provider>
    </TopBarActionSettersContext.Provider>
  );
}

export function useTopBarActions() {
  const value = useContext(TopBarActionsContext);
  if (!value) throw new Error("useTopBarActions must be used within TopBarActionsProvider");
  return value;
}

export function useTopBarActionSetters() {
  const value = useContext(TopBarActionSettersContext);
  if (!value) throw new Error("useTopBarActionSetters must be used within TopBarActionsProvider");
  return value;
}
