/** Plain statements of what MergeMate does with a pull request. Approved public facts only. */
export const PRIVACY_FACTS = [
  "AI runs only after you agree, and you can withdraw that any time.",
  "Credentials and secrets are removed before anything is analyzed.",
  "Your content is never used to train models.",
  "PR review uses your installed GitHub connection permissions. Coding workflows need a configured executor and your explicit authorization to create a branch and draft PR.",
  "Agent workflows cannot merge, approve, comment, or release a change.",
  "Account deletion removes your stored workspace data and revokes access. Branches or PRs already published to GitHub remain in GitHub.",
] as const;
