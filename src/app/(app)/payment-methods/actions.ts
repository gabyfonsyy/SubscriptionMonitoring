"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ForbiddenError, requireEditor } from "@/lib/auth";
import { parseCard } from "@/domain/cards";

export type CardFormState = {
  errors?: Record<string, string>;
  message?: string;
  values?: Record<string, string>;
};

function rawValues(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of formData.entries()) if (typeof v === "string") out[k] = v;
  return out;
}

function friendly(error: { code?: string; message: string }): string {
  if (error.code === "42501" || /row-level security/i.test(error.message)) return "You do not have permission to do that.";
  if (error.code === "23514") return "One of the values is not allowed by the database rules. Please review the form.";
  return "The card could not be saved. Please try again.";
}

async function guard() {
  try {
    return { user: await requireEditor() };
  } catch (e) {
    if (e instanceof ForbiddenError) return { message: e.message };
    throw e;
  }
}

export async function createCardAction(_prev: CardFormState, formData: FormData): Promise<CardFormState> {
  const g = await guard();
  if ("message" in g) return { message: g.message };

  const values = rawValues(formData);
  const parsed = parseCard(values);
  if (!parsed.ok) return { errors: parsed.errors, values };

  const supabase = await createClient();
  const { error } = await supabase.from("payment_methods").insert(parsed.value);
  if (error) return { message: friendly(error), values };

  revalidatePath("/payment-methods");
  redirect("/payment-methods?saved=card_saved");
}

export async function updateCardAction(id: string, _prev: CardFormState, formData: FormData): Promise<CardFormState> {
  const g = await guard();
  if ("message" in g) return { message: g.message };

  const values = rawValues(formData);
  const parsed = parseCard(values);
  if (!parsed.ok) return { errors: parsed.errors, values };

  const supabase = await createClient();
  const { data, error } = await supabase.from("payment_methods").update(parsed.value).eq("id", id).select("id");
  if (error) return { message: friendly(error), values };
  if (!data || data.length === 0) return { message: "That card no longer exists or you cannot change it.", values };

  revalidatePath("/payment-methods");
  revalidatePath("/subscriptions");
  redirect("/payment-methods?saved=card_saved");
}

/** Retire or restore. Cards are never deleted, so subscriptions keep their history of which card paid. */
export async function setCardRetiredAction(id: string, retired: boolean) {
  const g = await guard();
  if ("message" in g) throw new ForbiddenError();

  const supabase = await createClient();
  const { error } = await supabase
    .from("payment_methods")
    .update({ retired_at: retired ? new Date().toISOString() : null })
    .eq("id", id);
  if (error) throw new Error(friendly(error));

  revalidatePath("/payment-methods");
  revalidatePath("/subscriptions");
  redirect(`/payment-methods?saved=${retired ? "card_retired" : "card_restored"}`);
}
