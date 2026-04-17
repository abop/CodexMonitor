import { beforeEach, describe, expect, it } from "vitest";
import {
  WEB_BRIDGE_STORAGE_KEY,
  addWebBridgeTarget,
  deleteWebBridgeTarget,
  deriveBridgeName,
  editWebBridgeTarget,
  loadWebBridgeSettings,
  normalizeWebBridgeUrl,
  saveWebBridgeSettings,
} from "./webBridgeStorage";

describe("webBridgeStorage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("normalizes http and https bridge URLs", () => {
    expect(normalizeWebBridgeUrl(" https://bridge.example.com/// ")).toEqual({
      ok: true,
      value: "https://bridge.example.com",
      warning: null,
    });
    expect(normalizeWebBridgeUrl("http://127.0.0.1:8787/")).toEqual({
      ok: true,
      value: "http://127.0.0.1:8787",
      warning: null,
    });
  });

  it("rejects empty and non-http bridge URLs", () => {
    expect(normalizeWebBridgeUrl(" ")).toEqual({
      ok: false,
      error: "Bridge URL is required.",
    });
    expect(normalizeWebBridgeUrl("ws://bridge.example.com")).toEqual({
      ok: false,
      error: "Bridge URL must start with http:// or https://.",
    });
  });

  it("warns for plain http on non-local hosts", () => {
    expect(normalizeWebBridgeUrl("http://bridge.example.com")).toEqual({
      ok: true,
      value: "http://bridge.example.com",
      warning: "Plain HTTP should only be used for trusted development hosts.",
    });
  });

  it("does not warn for ipv6 localhost on plain http", () => {
    expect(normalizeWebBridgeUrl("http://[::1]:8787/")).toEqual({
      ok: true,
      value: "http://[::1]:8787",
      warning: null,
    });
  });

  it("derives a display name from the URL hostname", () => {
    expect(deriveBridgeName("", "https://bridge.example.com")).toBe(
      "bridge.example.com",
    );
    expect(deriveBridgeName(" dev server ", "https://bridge.example.com")).toBe(
      "dev server",
    );
  });

  it("seeds first-run settings from build-time URL without saving it", () => {
    const settings = loadWebBridgeSettings({
      seedUrl: "https://seed.example.com/",
      nowMs: 100,
    });

    expect(settings.bridges).toEqual([]);
    expect(settings.activeBridgeId).toBeNull();
    expect(settings.seedBridgeUrl).toBe("https://seed.example.com");
    expect(localStorage.getItem(WEB_BRIDGE_STORAGE_KEY)).toBeNull();
  });

  it("saves and reloads settings", () => {
    const saved = addWebBridgeTarget(
      { version: 1, activeBridgeId: null, bridges: [] },
      {
        name: "dev",
        baseUrl: "https://dev.example.com",
        nowMs: 100,
        activate: true,
      },
    );

    expect(saved.bridges[0].lastUsedAtMs).toBe(100);

    saveWebBridgeSettings(saved);
    expect(loadWebBridgeSettings({ nowMs: 200 })).toMatchObject({
      activeBridgeId: saved.bridges[0].id,
      bridges: [{ name: "dev", baseUrl: "https://dev.example.com" }],
    });
  });

  it("ignores malformed storage and keeps valid seed data available", () => {
    localStorage.setItem(WEB_BRIDGE_STORAGE_KEY, "{bad json");

    expect(loadWebBridgeSettings({ seedUrl: "https://seed.example.com" })).toEqual({
      version: 1,
      activeBridgeId: null,
      bridges: [],
      seedBridgeUrl: "https://seed.example.com",
    });
  });

  it("edits a bridge and keeps it active", () => {
    const settings = addWebBridgeTarget(
      { version: 1, activeBridgeId: null, bridges: [] },
      {
        name: "dev",
        baseUrl: "https://dev.example.com",
        nowMs: 100,
        activate: true,
      },
    );
    const id = settings.bridges[0].id;

    const edited = editWebBridgeTarget(settings, id, {
      name: "build",
      baseUrl: "https://build.example.com",
      nowMs: 200,
    });

    expect(edited.activeBridgeId).toBe(id);
    expect(edited.bridges[0]).toMatchObject({
      id,
      name: "build",
      baseUrl: "https://build.example.com",
      updatedAtMs: 200,
    });
  });

  it("prevents deleting the last bridge", () => {
    const settings = addWebBridgeTarget(
      { version: 1, activeBridgeId: null, bridges: [] },
      {
        name: "dev",
        baseUrl: "https://dev.example.com",
        nowMs: 100,
        activate: true,
      },
    );

    expect(() => deleteWebBridgeTarget(settings, settings.bridges[0].id)).toThrow(
      "At least one Bridge must remain configured.",
    );
  });

  it("deletes a non-active bridge without changing the active bridge", () => {
    const first = addWebBridgeTarget(
      { version: 1, activeBridgeId: null, bridges: [] },
      {
        name: "dev",
        baseUrl: "https://dev.example.com",
        nowMs: 100,
        activate: true,
      },
    );
    const second = addWebBridgeTarget(first, {
      name: "build",
      baseUrl: "https://build.example.com",
      nowMs: 200,
      activate: false,
    });

    const deleted = deleteWebBridgeTarget(second, second.bridges[1].id);
    expect(deleted.activeBridgeId).toBe(first.bridges[0].id);
    expect(deleted.bridges).toHaveLength(1);
  });
});
