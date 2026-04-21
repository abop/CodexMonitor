import { describe, expect, it, vi } from "vitest";
import { bridgeRpc, fetchBridgeCapabilities, testBridgeConnection } from "./http";

describe("bridgeRpc", () => {
  it("posts method and params to /api/rpc", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ result: [{ id: "ws-1" }] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await bridgeRpc<{ id: string }[]>(
      { baseUrl: "https://bridge.example.com" },
      "list_workspaces",
      { workspaceId: "ignored" },
    );

    expect(result).toEqual([{ id: "ws-1" }]);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://bridge.example.com/api/rpc",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({
          method: "list_workspaces",
          params: { workspaceId: "ignored" },
        }),
      }),
    );
  });

  it("throws the bridge error message when the server returns an error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({ error: { message: "bridge denied method" } }),
      }),
    );

    await expect(
      bridgeRpc({ baseUrl: "https://bridge.example.com" }, "bad_method", {}),
    ).rejects.toThrow("bridge denied method");
  });

  it("rejects non JSON-RPC bridge responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({}),
      }),
    );

    await expect(
      testBridgeConnection({ baseUrl: "https://bridge.example.com" }),
    ).rejects.toThrow("Bridge returned an invalid response.");
  });

  it("rejects null JSON-RPC bridge responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => null,
      }),
    );

    await expect(
      testBridgeConnection({ baseUrl: "https://bridge.example.com" }),
    ).rejects.toThrow("Bridge returned an invalid response.");
  });

  it("tests bridge connectivity with list_workspaces", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ result: [] }),
      }),
    );

    await expect(
      testBridgeConnection({ baseUrl: "https://bridge.example.com" }),
    ).resolves.toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledWith(
      "https://bridge.example.com/api/rpc",
      expect.objectContaining({
        body: JSON.stringify({ method: "list_workspaces", params: {} }),
        credentials: "include",
      }),
    );
  });

  it("fetches bridge capabilities from /api/capabilities", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        version: 1,
        methods: ["list_workspaces", "turn_steer"],
        threadControls: {
          steer: true,
          fork: true,
          compact: true,
          review: false,
          mcp: false,
        },
        files: {
          workspaceTree: false,
          workspaceAgents: false,
          globalAgents: false,
          globalConfig: false,
        },
        operations: {
          usageSnapshot: false,
          doctorReport: false,
          featureFlags: false,
          accountLogin: true,
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchBridgeCapabilities({ baseUrl: "https://bridge.example.com" }),
    ).resolves.toEqual(
      expect.objectContaining({
        version: 1,
        threadControls: expect.objectContaining({
          steer: true,
          fork: true,
          compact: true,
        }),
        operations: expect.objectContaining({
          accountLogin: true,
        }),
      }),
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "https://bridge.example.com/api/capabilities",
      expect.objectContaining({
        method: "GET",
        credentials: "include",
      }),
    );
  });

  it("rejects non-OK bridge capability responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        json: async () => ({
          version: 1,
          methods: [],
          threadControls: {
            steer: false,
            fork: false,
            compact: false,
            review: false,
            mcp: false,
          },
          files: {
            workspaceTree: false,
            workspaceAgents: false,
            globalAgents: false,
            globalConfig: false,
          },
          operations: {
            usageSnapshot: false,
            doctorReport: false,
            featureFlags: false,
            accountLogin: false,
          },
        }),
      }),
    );

    await expect(
      fetchBridgeCapabilities({ baseUrl: "https://bridge.example.com" }),
    ).rejects.toThrow("Bridge request failed (503)");
  });

  it("rejects malformed bridge capability responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          version: 1,
          methods: "list_workspaces",
          threadControls: {
            steer: true,
            fork: true,
            compact: true,
            review: false,
            mcp: false,
          },
          files: {
            workspaceTree: false,
            workspaceAgents: false,
            globalAgents: false,
            globalConfig: false,
          },
          operations: {
            usageSnapshot: false,
            doctorReport: false,
            featureFlags: false,
            accountLogin: false,
          },
        }),
      }),
    );

    await expect(
      fetchBridgeCapabilities({ baseUrl: "https://bridge.example.com" }),
    ).rejects.toThrow("Bridge returned an invalid response.");
  });
});
