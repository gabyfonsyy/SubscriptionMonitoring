import { describe, expect, it } from "vitest";
import { findPotentialDuplicates } from "@/domain/duplicates";

const existing = [
  { id: "1", name: "Application Monitoring", vendor: "Datadog Inc" },
  { id: "2", name: "Cloud Hosting", vendor: "Microsoft Azure" },
];

describe("findPotentialDuplicates", () => {
  it("flags same vendor with a similar name", () => {
    const m = findPotentialDuplicates({ name: "Datadog Application Monitoring", vendor: "Datadog" }, existing);
    expect(m.map((x) => x.id)).toEqual(["1"]);
  });
  it("ignores unrelated subscriptions", () => {
    expect(findPotentialDuplicates({ name: "IDE Licenses", vendor: "JetBrains" }, existing)).toEqual([]);
  });
  it("flags an identical name under another vendor", () => {
    const m = findPotentialDuplicates({ name: "Cloud Hosting", vendor: "AWS" }, existing);
    expect(m[0].reason).toMatch(/Identical name/);
  });
  it("does not match the record against itself when editing", () => {
    expect(
      findPotentialDuplicates({ id: "1", name: "Application Monitoring", vendor: "Datadog Inc" }, existing),
    ).toEqual([]);
  });
});
