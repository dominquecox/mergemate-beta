import { AiPreferences } from '@mergemate/contracts';
import { post } from './sign-in';

type Call = (path: string, init?: RequestInit) => Response | Promise<Response>;

/** Reads the account's canonical AI choices. */
export const readPrefs = async (call: Call, headers: Record<string, string>) =>
  AiPreferences.parse(await (await call('/v1/consent/preferences', { headers })).json());

/** Sends one AI choice change with the revision it was read at, unless the test names another. */
export const putPrefs = async (
  call: Call,
  headers: Record<string, string>,
  update: Record<string, unknown>,
  revision?: string,
) => {
  const needsRevision = update.action !== 'revoke';
  const body = needsRevision ? { ...update, expectedRevision: revision ?? (await readPrefs(call, headers)).revision } : update;
  return call('/v1/consent/preferences', { ...post(body, headers), method: 'PUT' });
};

export const setSummaries = (call: Call, headers: Record<string, string>, enabled: boolean) =>
  putPrefs(call, headers, { action: 'summaries', enabled });
