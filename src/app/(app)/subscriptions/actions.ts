"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ForbiddenError, requireEditor } from "@/lib/auth";
import { parseSubscriptionForm, type FieldErrors } from "@/domain/subscription-schema";
import type { DuplicateMatch } from "@/domain/duplicates";
import { findDuplicatesFor, getCostHistory } from "@/data/subscriptions";
import { parseCorrection, parsePriceChange } from "@/domain/cost-history";

export type FormState = {
  errors?: FieldErrors;
  message?: string;
  duplicates?: DuplicateMatch[];
  values?: Record<string, string>;
};

function rawValues(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of formData.entries()) if (typeof v === "string") out[k] = v;
  return out;
}

/** Turns a database error into something a person can act on, without leaking internals. */
function friendlyDbError(error: { code?: string; message: string }): string {
  if (error.code === "23505") {
    return "A subscription with the same vendor, name and product already exists. Archive or edit that one instead.";
  }
  if (error.code === "42501" || /row-level security/i.test(error.message)) {
    return "You do not have permission to do that.";
  }
  if (error.code === "23P01") {
    return /already starts|Correct that record/i.test(error.message)
      ? "A price already starts on or after that date. Choose a later date, or correct that record instead."
      : "That price period overlaps an existing cost record.";
  }
  if (error.code === "23514") return "One of the values is not allowed by the database rules. Please review the form.";
  return "The change could not be saved. Please try again.";
}

async function guard(): Promise<{ user: Awaited<ReturnType<typeof requireEditor>> } | { message: string }> {
  try {
    return { user: await requireEditor() };
  } catch (e) {
    if (e instanceof ForbiddenError) return { message: e.message };
    throw e;
  }
}

export async function createSubscriptionAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const g = await guard();
  if ("message" in g) return { message: g.message };

  const values = rawValues(formData);
  const parsed = parseSubscriptionForm(values, { withCost: true });
  if (!parsed.ok) return { errors: parsed.errors, values };

  if (values.confirm_duplicate !== "yes") {
    const duplicates = await findDuplicatesFor(parsed.subscription);
    if (duplicates.length > 0) return { duplicates, values };
  }

  const supabase = await createClient();
  const { subscription, cost } = parsed;
  const { data, error } = await supabase.rpc("create_subscription", {
    p_subscription: subscription,
    p_amount: cost?.amount ?? null,
    p_currency: cost?.currency ?? null,
    p_cost_effective_from: cost?.effective_from ?? null,
    p_reason: cost?.reason ?? null,
  });
  if (error || !data) return { message: friendlyDbError(error ?? { message: "" }), values };

  revalidatePath("/subscriptions");
  redirect(`/subscriptions/${data.id}?saved=created`);
}

export async function updateSubscriptionAction(
  id: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const g = await guard();
  if ("message" in g) return { message: g.message };

  const values = rawValues(formData);
  const parsed = parseSubscriptionForm(values, { withCost: false });
  if (!parsed.ok) return { errors: parsed.errors, values };

  if (values.confirm_duplicate !== "yes") {
    const duplicates = await findDuplicatesFor({ id, ...parsed.subscription });
    if (duplicates.length > 0) return { duplicates, values };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("subscriptions")
    .update({ ...parsed.subscription, updated_by: g.user.id })
    .eq("id", id)
    .neq("status", "archived")
    .select("id");
  if (error) return { message: friendlyDbError(error), values };
  if (!data || data.length === 0) {
    return { message: "This subscription could not be updated. It may be archived. Restore it first.", values };
  }

  revalidatePath("/subscriptions");
  revalidatePath(`/subscriptions/${id}`);
  redirect(`/subscriptions/${id}?saved=updated`);
}

export async function archiveSubscriptionAction(id: string) {
  const g = await guard();
  if ("message" in g) throw new ForbiddenError();

  const supabase = await createClient();
  const { error } = await supabase
    .from("subscriptions")
    .update({ status: "archived", archived_at: new Date().toISOString(), updated_by: g.user.id })
    .eq("id", id);
  if (error) throw new Error(friendlyDbError(error));

  revalidatePath("/subscriptions");
  redirect(`/subscriptions/${id}?saved=archived`);
}

export async function restoreSubscriptionAction(id: string) {
  const g = await guard();
  if ("message" in g) throw new ForbiddenError();

  const supabase = await createClient();
  const { error } = await supabase
    .from("subscriptions")
    .update({ status: "active", archived_at: null, updated_by: g.user.id })
    .eq("id", id);
  if (error) throw new Error(friendlyDbError(error));

  revalidatePath("/subscriptions");
  redirect(`/subscriptions/${id}?saved=restored`);
}

export async function addDocumentAction(subscriptionId: string, formData: FormData) {
  const g = await guard();
  if ("message" in g) throw new ForbiddenError();

  const title = String(formData.get("title") ?? "").trim();
  const url = String(formData.get("url") ?? "").trim();
  if (!title || !/^https?:\/\/\S+$/i.test(url)) {
    throw new Error("Enter a title and a link starting with http:// or https://");
  }

  const supabase = await createClient();
  const { error } = await supabase.from("subscription_documents").insert({ subscription_id: subscriptionId, title, url });
  if (error) throw new Error(friendlyDbError(error));

  revalidatePath(`/subscriptions/${subscriptionId}`);
  redirect(`/subscriptions/${subscriptionId}?saved=doc_added`);
}

export async function removeDocumentAction(subscriptionId: string, documentId: string) {
  const g = await guard();
  if ("message" in g) throw new ForbiddenError();

  const supabase = await createClient();
  const { error } = await supabase.from("subscription_documents").delete().eq("id", documentId);
  if (error) throw new Error(friendlyDbError(error));

  revalidatePath(`/subscriptions/${subscriptionId}`);
  redirect(`/subscriptions/${subscriptionId}?saved=doc_removed`);
}

/** Records a (possibly future-dated) price change through the atomic database function. */
export async function recordPriceChangeAction(
  subscriptionId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const g = await guard();
  if ("message" in g) return { message: g.message };

  const values = rawValues(formData);
  const history = await getCostHistory(subscriptionId);
  const parsed = parsePriceChange(values, history);
  if (!parsed.ok) return { errors: parsed.errors, values };

  const v = parsed.value;
  const supabase = await createClient();
  const { error } = await supabase.rpc("record_cost_change", {
    p_subscription_id: subscriptionId,
    p_effective_from: v.effective_from,
    p_amount: v.amount,
    p_currency: v.currency,
    p_billing_frequency: v.billing_frequency,
    p_cycle_months: v.cycle_months,
    p_reason: v.reason,
    p_change_type: v.change_type,
  });
  if (error) return { message: friendlyDbError(error), values };

  revalidatePath("/subscriptions");
  revalidatePath(`/subscriptions/${subscriptionId}`);
  redirect(`/subscriptions/${subscriptionId}?saved=price_recorded`);
}

/**
 * Corrects a historical price record in place (amount/currency/frequency). The database audit trigger
 * keeps the before/after values; the correction reason is appended to the record's reason.
 */
export async function correctCostRecordAction(
  subscriptionId: string,
  costId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const g = await guard();
  if ("message" in g) return { message: g.message };

  const values = rawValues(formData);
  const parsed = parseCorrection(values);
  if (!parsed.ok) return { errors: parsed.errors, values };

  const supabase = await createClient();
  const { data: existing, error: readError } = await supabase
    .from("subscription_cost_history")
    .select("id, reason")
    .eq("id", costId)
    .eq("subscription_id", subscriptionId)
    .maybeSingle();
  if (readError) return { message: friendlyDbError(readError), values };
  if (!existing) return { message: "That price record no longer exists.", values };

  const v = parsed.value;
  const note = `Corrected: ${v.reason}`;
  const { error } = await supabase
    .from("subscription_cost_history")
    .update({
      amount: v.amount,
      currency: v.currency,
      billing_frequency: v.billing_frequency,
      cycle_months: v.cycle_months,
      normalized_monthly: v.normalized_monthly,
      reason: existing.reason ? `${existing.reason} · ${note}` : note,
    })
    .eq("id", costId);
  if (error) return { message: friendlyDbError(error), values };

  revalidatePath("/subscriptions");
  revalidatePath(`/subscriptions/${subscriptionId}`);
  redirect(`/subscriptions/${subscriptionId}?saved=price_corrected`);
}
