/** Plain words and one next step for the errors an agent run can hit. The server text stays in Copy details. */
export type AgentNextStep = 'plan_again' | 'sign_in' | 'install_app' | 'register_passkey' | 'none';
export interface AgentErrorCopy { message: string; next: AgentNextStep }

const RULES: [RegExp, AgentErrorCopy][] = [
  [/not enabled for this repository/i, { message: "Agent runs aren't turned on for this repository yet.", next: 'none' }],
  [/agent runs are turned off/i, { message: 'Agent runs are paused right now. Try again later.', next: 'none' }],
  [/not available for this account/i, { message: "Agent runs aren't available for this account.", next: 'none' }],
  [/mint_token|installation token|app token|another github app installation|github app token minting/i,
    { message: "MergeMate's GitHub App isn't installed on this repository, or can't write to it. Install it on the repository in Settings → Configure repositories, then plan again.", next: 'install_app' }],
  [/already used or has expired|no approved patch|approval was superseded|challenge expired|no generated patch is awaiting|not awaiting patch approval/i,
    { message: 'This patch can no longer be approved. Plan again to get a fresh one.', next: 'plan_again' }],
  [/register a passkey/i, { message: 'Register a passkey on this device first, then approve the patch.', next: 'register_passkey' }],
  [/sign in|session has ended|signed-in account/i, { message: 'Your session ended. Sign in again to continue.', next: 'sign_in' }],
  [/draft publication failed|github draft publication/i, { message: 'The draft PR could not be opened. Plan again, or copy the details for support.', next: 'plan_again' }],
  [/did not choose|did not find a file|could not be read as text|allowed paths|no files in this repository/i,
    { message: "The agent couldn't prepare a usable patch for this card. Edit the card's details or plan again.", next: 'plan_again' }],
  [/target commit changed|pinned base commit changed/i, { message: 'The repository changed since this patch was made. Plan again.', next: 'plan_again' }],
];

export function agentErrorCopy(message: string | null | undefined, code?: string): AgentErrorCopy {
  const text = message ?? '';
  if (code === 'unauthorized') return { message: 'Your session ended. Sign in again to continue.', next: 'sign_in' };
  for (const [pattern, copy] of RULES) if (pattern.test(text)) return copy;
  return { message: text || 'Something went wrong. Plan again, or copy the details for support.', next: text ? 'none' : 'plan_again' };
}
