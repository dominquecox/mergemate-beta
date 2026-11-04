import { useEffect, useState } from "react";
import type { RepoPullOption } from "@mergemate/contracts";
import { api, type ApiClient } from "../api";
import { toUserMessage } from "../api/errors";

type RepoPullClient = Pick<ApiClient, "getRepoPulls">;
export type PullRequestOption = RepoPullOption;

export function useRepoPrList(owner: string | null, repo: string | null, client: RepoPullClient = api) {
  const [prs, setPrs] = useState<PullRequestOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!owner || !repo) {
      setPrs([]);
      setLoading(false);
      setError(null);
      return;
    }

    let current = true;
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    client.getRepoPulls(owner, repo, controller.signal)
      .then(({ items }) => {
        if (current) setPrs(items);
      })
      .catch((cause) => {
        if (current && !controller.signal.aborted) setError(toUserMessage(cause, "Failed to load pull requests."));
      })
      .finally(() => {
        if (current) setLoading(false);
      });

    return () => {
      current = false;
      controller.abort();
    };
  }, [client, owner, repo]);

  return { prs, loading, error };
}

