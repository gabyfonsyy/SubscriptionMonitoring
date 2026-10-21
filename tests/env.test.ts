import { describe, expect, it } from "vitest";
import { isEmailDomainAllowed } from "@/lib/env";

describe("isEmailDomainAllowed", () => {
  it("accepts addresses on the allowed domain, case-insensitively", () => {
    expect(isEmailDomainAllowed("Jane@Sprout.PH", "sprout.ph")).toBe(true);
  });

  it("rejects other domains and look-alikes", () => {
    expect(isEmailDomainAllowed("jane@gmail.com", "sprout.ph")).toBe(false);
    expect(isEmailDomainAllowed("jane@evilsprout.ph", "sprout.ph")).toBe(false);
    expect(isEmailDomainAllowed("jane@sprout.ph.evil.com", "sprout.ph")).toBe(false);
  });

  it("rejects missing emails", () => {
    expect(isEmailDomainAllowed(undefined, "sprout.ph")).toBe(false);
    expect(isEmailDomainAllowed(null, "sprout.ph")).toBe(false);
  });
});
