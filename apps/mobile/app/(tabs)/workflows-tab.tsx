/**
 * Placeholder for the Workflows tab. The tab's press listener opens /workflows (app/(tabs)/_layout.tsx), so this
 * screen renders nothing. It must not redirect on render: the navigator can render it as a fallback while the tab
 * list settles, and a redirect here sent every link into the tabs (Board, Inbox, Alerts) to /workflows.
 */
export default function WorkflowsTab() {
  return null;
}
