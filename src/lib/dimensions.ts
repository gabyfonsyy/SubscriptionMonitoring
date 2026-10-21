import { categoryLabel, frequencyLabel } from "@/domain/constants";
import type { BreakdownKey } from "@/domain/summary";
import type { InventoryRow } from "@/lib/supabase/database.types";

export type DimensionKey = "category" | "product" | "team" | "vendor" | "frequency";

export const DIMENSIONS: { key: DimensionKey; label: string; of: (r: InventoryRow) => BreakdownKey }[] = [
  { key: "category", label: "Category", of: (r) => ({ label: categoryLabel(r.category), href: `/subscriptions?category=${r.category}` }) },
  {
    key: "product",
    label: "Product",
    of: (r) => (r.product_id ? { label: r.product_name ?? "Unnamed product", href: `/subscriptions?product=${r.product_id}` } : { label: "No product" }),
  },
  {
    key: "team",
    label: "Team",
    of: (r) => (r.responsible_team_id ? { label: r.team_name ?? "Unnamed team", href: `/subscriptions?team=${r.responsible_team_id}` } : { label: "No team" }),
  },
  { key: "vendor", label: "Vendor", of: (r) => ({ label: r.vendor, href: `/subscriptions?q=${encodeURIComponent(r.vendor)}` }) },
  { key: "frequency", label: "Billing frequency", of: (r) => ({ label: frequencyLabel(r.billing_frequency), href: `/subscriptions?frequency=${r.billing_frequency}` }) },
];

export const dimension = (key: string | undefined, fallback: DimensionKey = "category") =>
  DIMENSIONS.find((d) => d.key === key) ?? DIMENSIONS.find((d) => d.key === fallback)!;
