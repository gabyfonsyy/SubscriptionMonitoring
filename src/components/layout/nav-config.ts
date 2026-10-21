import { BellRing, Boxes, CreditCard, FileBarChart, LayoutDashboard, Repeat, Settings, TrendingUp, type LucideIcon } from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon };
export type NavGroup = { heading: string; items: NavItem[] };

/** Every destination here is a real route. Grouped by what people are trying to do. */
export const NAV_GROUPS: NavGroup[] = [
  { heading: "Overview", items: [{ href: "/overview", label: "Dashboard", icon: LayoutDashboard }] },
  {
    heading: "Subscriptions",
    items: [
      { href: "/subscriptions", label: "All Subscriptions", icon: Repeat },
      { href: "/products", label: "Products & Services", icon: Boxes },
      { href: "/payment-methods", label: "Payment Methods", icon: CreditCard },
    ],
  },
  {
    heading: "Monitoring",
    items: [
      { href: "/alerts", label: "Renewals & Alerts", icon: BellRing },
      { href: "/analytics", label: "Cost Analytics", icon: TrendingUp },
    ],
  },
  {
    heading: "Management",
    items: [
      { href: "/reports", label: "Reports", icon: FileBarChart },
      { href: "/settings", label: "Settings", icon: Settings },
    ],
  },
];

const ALL = NAV_GROUPS.flatMap((g) => g.items);

/** Section title for the header, from the current path. */
export function sectionFor(pathname: string): { group: string; label: string } | null {
  const hit = ALL.filter((i) => pathname === i.href || pathname.startsWith(`${i.href}/`)).sort((a, b) => b.href.length - a.href.length)[0];
  if (!hit) return null;
  const group = NAV_GROUPS.find((g) => g.items.includes(hit))!;
  return { group: group.heading, label: hit.label };
}
