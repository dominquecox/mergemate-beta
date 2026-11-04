import { Redirect } from "expo-router";

/** The Workflows tab opens the shared Workflows screen; a direct visit here goes there too. */
export default function WorkflowsTab() {
  return <Redirect href="/workflows" />;
}
