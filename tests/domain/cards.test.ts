import { describe, expect, it } from "vitest";
import { expiryDate, expiryState, formatExpiry, looksLikeCardNumber, parseCard } from "@/domain/cards";

const ok = { label: "Engineering Visa", last_four: "4242", expiry_month: "11", expiry_year: "2027" };

describe("parseCard", () => {
  it("accepts nickname, last four and expiry", () => {
    const r = parseCard(ok);
    expect(r.ok && r.value).toMatchObject({ label: "Engineering Visa", last_four: "4242", expiry_month: 11, expiry_year: 2027 });
  });
  it("expands a 2-digit year", () => {
    const r = parseCard({ ...ok, expiry_year: "28" });
    expect(r.ok && r.value.expiry_year).toBe(2028);
  });
  it("rejects bad last-four and expiry values", () => {
    const r = parseCard({ ...ok, last_four: "42", expiry_month: "13", expiry_year: "1999" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(["expiry_month", "expiry_year", "last_four"]);
  });
  it("refuses a full card number in any text field", () => {
    for (const field of ["label", "cardholder_note", "notes"]) {
      const r = parseCard({ ...ok, [field]: "4242 4242 4242 4242" });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.errors[field]).toMatch(/full card number/);
    }
  });
  it("refuses a security code", () => {
    expect(parseCard({ ...ok, notes: "CVV: 123" }).ok).toBe(false);
  });
  it("allows ordinary notes with a few digits", () => {
    expect(parseCard({ ...ok, notes: "Renewed 2026, ref 1234, ends 4242" }).ok).toBe(true);
  });
});

describe("looksLikeCardNumber", () => {
  it("detects dashed and spaced numbers but not short ids", () => {
    expect(looksLikeCardNumber("4242-4242-4242-4242")).toBe(true);
    expect(looksLikeCardNumber("4242424242424242")).toBe(true);
    expect(looksLikeCardNumber("PO 20261021")).toBe(false);
  });
});

describe("expiry", () => {
  it("is valid through the last day of the expiry month", () => {
    expect(expiryDate(2, 2028)).toBe("2028-02-29");
    expect(expiryDate(12, 2026)).toBe("2026-12-31");
  });
  it("classifies expired, expiring soon and ok", () => {
    const today = "2026-10-21";
    expect(expiryState(9, 2026, today)).toBe("expired");
    expect(expiryState(10, 2026, today)).toBe("expiring_soon"); // valid through 31 Oct
    expect(expiryState(12, 2026, today)).toBe("ok"); // 71 days out, beyond the 60-day window
  });
  it("respects the window boundary", () => {
    expect(expiryState(12, 2026, "2026-10-21")).toBe("ok");
    expect(expiryState(12, 2026, "2026-11-01")).toBe("expiring_soon");
    expect(expiryState(1, 2027, "2026-10-21")).toBe("ok");
  });
  it("formats MM/YY", () => {
    expect(formatExpiry(3, 2027)).toBe("03/27");
  });
});
