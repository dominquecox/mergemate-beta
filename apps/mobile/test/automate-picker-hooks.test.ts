import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "../src/api/errors";

vi.mock("../src/api", () => ({ api: {} }));

import { useRepoBranches } from "../src/hooks/useRepoBranches";
import { useRepoPrList } from "../src/hooks/useRepoPrList";

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => { resolve = yes; });
  return { promise, resolve };
};

describe("repository picker hooks", () => {
  it("renders useRepoPrList through the shared client and publishes its loading and result states", async () => {
    const request = deferred<{ items: Array<{ number: number; title: string; author: string; status: "open" | "draft" }> }>();
    const client = { getRepoPulls: vi.fn(() => request.promise) };
    let latest: ReturnType<typeof useRepoPrList> | undefined;
    const Harness = () => { latest = useRepoPrList("acme", "api", client); return null; };
    let renderer!: ReactTestRenderer;

    await act(async () => { renderer = create(React.createElement(Harness)); });
    expect(latest).toMatchObject({ prs: [], loading: true, error: null });
    expect(client.getRepoPulls).toHaveBeenCalledWith("acme", "api", expect.any(AbortSignal));

    await act(async () => {
      request.resolve({ items: [
        { number: 12, title: "Fix session refresh", author: "octo", status: "open" },
        { number: 13, title: "Draft navigation", author: "river", status: "draft" },
      ] });
      await request.promise;
    });
    expect(latest).toMatchObject({ loading: false, error: null });
    expect(latest?.prs.map((pr) => [pr.number, pr.author, pr.status])).toEqual([[12, "octo", "open"], [13, "river", "draft"]]);
    renderer.unmount();
  });

  it("renders the safe API error and aborts the old request when the repository changes", async () => {
    const signals: AbortSignal[] = [];
    const client = {
      getRepoPulls: vi.fn((owner: string, _repo: string, signal?: AbortSignal) => {
        if (signal) signals.push(signal);
        return owner === "missing"
          ? Promise.reject(new ApiClientError("not_found", "Repository not found."))
          : Promise.resolve({ items: [{ number: 4, title: "New target", author: "dev", status: "open" as const }] });
      }),
    };
    let latest: ReturnType<typeof useRepoPrList> | undefined;
    const Harness = ({ owner }: { owner: string }) => { latest = useRepoPrList(owner, "api", client); return null; };
    let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(React.createElement(Harness, { owner: "missing" })); });
    expect(latest?.error).toBe("Repository not found.");

    await act(async () => { renderer.update(React.createElement(Harness, { owner: "acme" })); });
    expect(signals[0]?.aborted).toBe(true);
    expect(latest).toMatchObject({ loading: false, error: null });
    expect(latest?.prs[0]?.number).toBe(4);
    renderer.unmount();
  });

  it("renders useRepoBranches and uses the server-confirmed default branch", async () => {
    const client = { getRepoBranches: vi.fn(async () => ({
      defaultBranch: "develop",
      items: [{ name: "develop", isDefault: true }, { name: "main", isDefault: false }],
    })) };
    let latest: ReturnType<typeof useRepoBranches> | undefined;
    const Harness = () => { latest = useRepoBranches("acme", "api", client); return null; };
    let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(React.createElement(Harness)); });

    expect(client.getRepoBranches).toHaveBeenCalledWith("acme", "api", expect.any(AbortSignal));
    expect(latest).toMatchObject({ defaultBranch: "develop", loading: false, error: null });
    expect(latest?.branches).toEqual([{ name: "develop", isDefault: true }, { name: "main", isDefault: false }]);
    renderer.unmount();
  });

  it("does not call the client until both repository coordinates exist", async () => {
    const client = { getRepoBranches: vi.fn() };
    let latest: ReturnType<typeof useRepoBranches> | undefined;
    const Harness = () => { latest = useRepoBranches("acme", null, client); return null; };
    let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(React.createElement(Harness)); });
    expect(client.getRepoBranches).not.toHaveBeenCalled();
    expect(latest).toEqual({ branches: [], defaultBranch: null, loading: false, error: null });
    renderer.unmount();
  });
});
