/** Words shown around the bring-your-own Meta key form. Plain copy only: nothing here touches the key. */
export const META_KEY_COPY = {
  verifyNotice:
    "Saving sends one tiny test request to Meta with your key (about 16 tokens, no repository data) to check that it works. Your key is stored encrypted and never shown again.",
  checking: "Checking your key with Meta…",
  saved: "Your Meta key is saved. It is never shown again.",
  removed: "Your Meta key was removed. AI now uses MergeMate's shared key and limits.",
  usingKey: "Using your key",
  noKey: "Key not configured",
  nativeNote: "Manage your key in the web app.",
  saveLabel: "Verify and save key",
} as const;
