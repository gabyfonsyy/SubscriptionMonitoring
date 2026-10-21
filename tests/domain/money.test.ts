import { describe, expect, it } from "vitest";
import { normalizeMonthly, resolveCycleMonths } from "@/domain/money";

describe("normalizeMonthly", () => {
  it.each([
    ["200", 1, "200"],
    ["600", 3, "200"],
    ["1200", 6, "200"],
    ["2400", 12, "200"],
  ])("USD %s over %i months = %s/month", (amount, months, expected) => {
    expect(normalizeMonthly(amount, months)?.toFixed()).toBe(expected);
  });

  it("uses exact decimals (no float drift)", () => {
    expect(normalizeMonthly("0.3", 3)?.toFixed()).toBe("0.1");
    expect(normalizeMonthly("100", 3)?.toFixed(4)).toBe("33.3333");
    expect(normalizeMonthly("0.1", 1)?.plus("0.2").toFixed()).toBe("0.3");
  });

  it("returns null for one-time charges", () => {
    expect(normalizeMonthly("999", null)).toBeNull();
  });
});

describe("resolveCycleMonths", () => {
  it("derives fixed cycles", () => {
    expect(resolveCycleMonths("quarterly")).toEqual({ ok: true, months: 3 });
    expect(resolveCycleMonths("one_time")).toEqual({ ok: true, months: null });
  });
  it("requires a length for multi-year and custom", () => {
    expect(resolveCycleMonths("multi_year").ok).toBe(false);
    expect(resolveCycleMonths("custom", 0).ok).toBe(false);
    expect(resolveCycleMonths("custom", 2.5).ok).toBe(false);
    expect(resolveCycleMonths("multi_year", 36)).toEqual({ ok: true, months: 36 });
  });
});
