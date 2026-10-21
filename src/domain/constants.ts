import type {
  BillingFrequency,
  Category,
  Criticality,
  SubscriptionStatus,
} from "@/lib/supabase/database.types";

export const STATUSES: { value: SubscriptionStatus; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "pending", label: "Pending" },
  { value: "under_review", label: "Under Review" },
  { value: "cancellation_requested", label: "Cancellation Requested" },
  { value: "expired", label: "Expired" },
  { value: "archived", label: "Archived" },
];

export const CATEGORIES: { value: Category; label: string }[] = [
  { value: "infrastructure", label: "Infrastructure" },
  { value: "monitoring", label: "Monitoring" },
  { value: "security", label: "Security" },
  { value: "developer_tools", label: "Developer Tools" },
  { value: "saas", label: "SaaS" },
  { value: "database", label: "Database" },
  { value: "other", label: "Other" },
];

export const FREQUENCIES: { value: BillingFrequency; label: string }[] = [
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "semi_annual", label: "Semi-annually" },
  { value: "annual", label: "Annually" },
  { value: "multi_year", label: "Multi-year" },
  { value: "one_time", label: "One-time" },
  { value: "custom", label: "Custom" },
];

export const CRITICALITIES: { value: Criticality; label: string }[] = [
  { value: "critical", label: "Critical" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

export const COMMON_CURRENCIES = ["USD", "PHP", "SGD", "EUR", "GBP", "AUD", "JPY"];

const labelOf = (list: { value: string; label: string }[], value: string | null | undefined) =>
  list.find((i) => i.value === value)?.label ?? "—";

export const statusLabel = (v: string | null | undefined) => labelOf(STATUSES, v);
export const categoryLabel = (v: string | null | undefined) => labelOf(CATEGORIES, v);
export const frequencyLabel = (v: string | null | undefined) => labelOf(FREQUENCIES, v);
export const criticalityLabel = (v: string | null | undefined) => labelOf(CRITICALITIES, v);
