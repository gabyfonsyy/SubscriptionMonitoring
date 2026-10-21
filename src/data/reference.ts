import "server-only";
import { createClient } from "@/lib/supabase/server";
import type {
  PaymentMethodRow,
  ProductRow,
  TeamRow,
  UserProfileRow,
} from "@/lib/supabase/database.types";

export type Option = { value: string; label: string };

function must<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`Could not load ${what}: ${res.error.message}`);
  return res.data as T;
}

export async function listTeams(opts: { includeArchived?: boolean } = {}): Promise<TeamRow[]> {
  const supabase = await createClient();
  let q = supabase.from("teams").select("*").order("name");
  if (!opts.includeArchived) q = q.is("archived_at", null);
  return must(await q, "teams");
}

export async function listProducts(opts: { includeArchived?: boolean } = {}): Promise<ProductRow[]> {
  const supabase = await createClient();
  let q = supabase.from("products").select("*").order("name");
  if (!opts.includeArchived) q = q.is("archived_at", null);
  return must(await q, "products");
}

export async function listOwners(): Promise<Pick<UserProfileRow, "id" | "email" | "display_name">[]> {
  const supabase = await createClient();
  return must(
    await supabase.from("user_profiles").select("id, email, display_name").eq("is_active", true).order("email"),
    "owners",
  );
}

export async function listPaymentMethods(): Promise<
  Pick<PaymentMethodRow, "id" | "label" | "last_four" | "retired_at">[]
> {
  const supabase = await createClient();
  return must(
    await supabase.from("payment_methods").select("id, label, last_four, retired_at").order("label"),
    "payment methods",
  );
}

/** Dropdown options for the subscription form and filters. */
export async function loadFormOptions() {
  const [teams, products, owners, cards] = await Promise.all([
    listTeams(),
    listProducts(),
    listOwners(),
    listPaymentMethods(),
  ]);
  return {
    teams: teams.map((t): Option => ({ value: t.id, label: t.name })),
    products: products.map((p): Option => ({ value: p.id, label: p.name })),
    owners: owners.map((o): Option => ({ value: o.id, label: o.display_name ?? o.email })),
    cards: cards.map(
      (c): Option => ({
        value: c.id,
        label: `${c.label} •••• ${c.last_four}${c.retired_at ? " (retired)" : ""}`,
      }),
    ),
  };
}
