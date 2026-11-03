export function buildIdentityRows(identity: { platform: string; version: string | null; build: string | null; commit: unknown }) {
  const native = identity.platform === "ios" || identity.platform === "android";
  return [
    { label: "Version", detail: native ? identity.version ?? "Unavailable" : "Web" },
    { label: "Build number", detail: native ? identity.build ?? "Unavailable" : "Not a native build" },
    { label: "Source commit", detail: typeof identity.commit === "string" && /^[a-f0-9]{40}$/i.test(identity.commit) ? identity.commit : "Unavailable" },
  ];
}
