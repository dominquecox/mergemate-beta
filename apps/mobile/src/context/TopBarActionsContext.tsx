import React, { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from "react";

interface TopBarActionsValue {
  actions: ReactNode;
  setActions: (actions: ReactNode) => void;
  clearActions: () => void;
  /** The open Board project, so the top-bar camera can pre-select it as the board for new cards. */
  highlightProject: string | null;
  setHighlightProject: (projectId: string | null) => void;
}

const TopBarActionsContext = createContext<TopBarActionsValue | null>(null);
/** Setters only, so a screen that sets actions does not re-render when they change. */
const TopBarActionSettersContext = createContext<Pick<TopBarActionsValue, "setActions" | "clearActions" | "setHighlightProject"> | null>(null);

export function TopBarActionsProvider({ children }: { children: ReactNode }) {
  const [actions, setActions] = useState<ReactNode>(null);
  const [highlightProject, setHighlightProject] = useState<string | null>(null);
  const clearActions = useCallback(() => setActions(null), []);
  const value = useMemo(() => ({ actions, setActions, clearActions, highlightProject, setHighlightProject }), [actions, clearActions, highlightProject]);
  const setters = useMemo(() => ({ setActions, clearActions, setHighlightProject }), [clearActions]);
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
