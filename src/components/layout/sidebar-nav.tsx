"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Repeat,
  Boxes,
  CreditCard,
  BellRing,
  FileBarChart,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const NAV_ITEMS = [
  { href: "/overview", label: "Overview", icon: LayoutDashboard },
  { href: "/subscriptions", label: "Subscriptions", icon: Repeat },
  { href: "/products", label: "Products & Services", icon: Boxes },
  { href: "/payment-methods", label: "Payment Methods", icon: CreditCard },
  { href: "/alerts", label: "Renewals & Alerts", icon: BellRing },
  { href: "/reports", label: "Reports", icon: FileBarChart },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

export function SidebarNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Primary" className="flex flex-col gap-1 p-3">
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-accent/10 text-accent"
                : "text-muted hover:bg-background hover:text-foreground",
            )}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
