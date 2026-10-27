/** Returns the URL when it is https on one of the given hosts (or their subdomains), else null. */
export function httpsUrlOnHosts(value: string | null | undefined, hosts: readonly string[]): string | null {
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password) return null;
  const host = url.hostname.toLowerCase();
  return hosts.some((h) => host === h || host.endsWith(`.${h}`)) ? url.toString() : null;
}

export const GITHUB_HOSTS = ["github.com"] as const;
export const CHECKOUT_HOSTS = ["checkout.stripe.com"] as const;
export const PORTAL_HOSTS = ["billing.stripe.com"] as const;

export const githubUrl = (value: string | null | undefined) => httpsUrlOnHosts(value, GITHUB_HOSTS);
