import { describe, expect, it, vi } from "vitest";
import { bridgeRpc } from "./http";

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
});
