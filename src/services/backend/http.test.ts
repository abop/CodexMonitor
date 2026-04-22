import { afterEach, describe, expect, it, vi } from "vitest";
import {
  backendRpc,
  fetchBackendCapabilities,
  testBackendConnection,
} from "./http";

describe("backend http client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts rpc requests and returns result payloads", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ result: { ok: true } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      backendRpc<{ ok: boolean }>(
        { baseUrl: "https://daemon.example.com" },
        "list_workspaces",
        {},
      ),
    ).resolves.toEqual({ ok: true });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://daemon.example.com/api/rpc",
      expect.objectContaining({
        method: "POST",
      }),
    );
  });

  it("loads capability payloads", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        version: 1,
        methods: ["list_workspaces"],
        threadControls: {
          steer: true,
          fork: true,
          compact: true,
          review: true,
          mcp: true,
        },
        files: {
          workspaceTree: true,
        },
        operations: {
          usageSnapshot: true,
          featureFlags: true,
          accountLogin: true,
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchBackendCapabilities({ baseUrl: "https://daemon.example.com" }),
    ).resolves.toMatchObject({
      version: 1,
      methods: ["list_workspaces"],
    });
  });

  it("tests backend reachability through list_workspaces", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ result: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      testBackendConnection({ baseUrl: "https://daemon.example.com" }),
    ).resolves.toEqual({ ok: true });
  });
});
