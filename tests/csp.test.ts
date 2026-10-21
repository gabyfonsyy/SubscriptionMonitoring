import { describe, expect, it } from "vitest";
import { buildCsp, newNonce } from "@/lib/csp";

const prod = buildCsp({ nonce: "abc", supabaseUrl: "https://xyz.supabase.co" });

describe("buildCsp", () => {
  it("locks scripts to self + the nonce, with no unsafe-eval in production", () => {
    expect(prod).toContain("script-src 'self' 'nonce-abc' 'strict-dynamic'");
    expect(prod).not.toContain("unsafe-eval");
    expect(prod).not.toMatch(/script-src[^;]*unsafe-inline/);
  });
  it("blocks framing, plugins and base-tag hijacking", () => {
    expect(prod).toContain("frame-ancestors 'none'");
    expect(prod).toContain("object-src 'none'");
    expect(prod).toContain("base-uri 'self'");
    expect(prod).toContain("default-src 'self'");
  });
  it("allows only Supabase for API and websocket connections", () => {
    expect(prod).toContain("connect-src 'self' https://xyz.supabase.co wss://xyz.supabase.co");
  });
  it("upgrades insecure requests in production but not in dev", () => {
    expect(prod).toContain("upgrade-insecure-requests");
    const dev = buildCsp({ nonce: "abc", dev: true });
    expect(dev).not.toContain("upgrade-insecure-requests");
    expect(dev).toContain("'unsafe-eval'");
  });
  it("works before Supabase is configured", () => {
    expect(buildCsp({ nonce: "n" })).toContain("connect-src 'self'");
  });
});

describe("newNonce", () => {
  it("is unique per call", () => {
    expect(newNonce()).not.toBe(newNonce());
  });
});
