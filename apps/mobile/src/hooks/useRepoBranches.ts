import { useEffect, useState } from "react";
import type { RepoBranchOption } from "@mergemate/contracts";
import { api, type ApiClient } from "../api";
import { toUserMessage } from "../api/errors";

type RepoBranchClient = Pick<ApiClient, "getRepoBranches">;
export type BranchOption = RepoBranchOption;

export function useRepoBranches(owner: string | null, repo: string | null, client: RepoBranchClient = api) {
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [defaultBranch, setDefaultBranch] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!owner || !repo) {
      setBranches([]);
      setDefaultBranch(null);
      setLoading(false);
      setError(null);
      return;
    }

    let current = true;
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    client.getRepoBranches(owner, repo, controller.signal)
      .then(({ items, defaultBranch: defaultName }) => {
        if (!current) return;
        setBranches(items);
        setDefaultBranch(defaultName);
      })
      .catch((cause) => {
        if (current && !controller.signal.aborted) setError(toUserMessage(cause, "Failed to load branches."));
      })
      .finally(() => {
        if (current) setLoading(false);
      });

    return () => {
      current = false;
      controller.abort();
    };
  }, [client, owner, repo]);

  return { branches, defaultBranch, loading, error };
}

