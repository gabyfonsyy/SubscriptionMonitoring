"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ForbiddenError, requireEditor } from "@/lib/auth";

type Kind = "products" | "teams";

function fail(code: "forbidden" | "invalid" | "duplicate" | "failed"): never {
  redirect(`/products?error=${code}`);
}

async function ensureEditor() {
  try {
    return await requireEditor();
  } catch (e) {
    if (e instanceof ForbiddenError) fail("forbidden");
    throw e;
  }
}

const text = (fd: FormData, key: string) => {
  const v = String(fd.get(key) ?? "").trim();
  return v || null;
};

async function finish(error: { code?: string } | null) {
  if (error) fail(error.code === "23505" ? "duplicate" : error.code === "42501" ? "forbidden" : "failed");
  revalidatePath("/products");
  redirect("/products?saved=saved");
}

export async function createTeamAction(formData: FormData) {
  await ensureEditor();
  const name = text(formData, "name");
  if (!name) fail("invalid");
  const supabase = await createClient();
  const { error } = await supabase.from("teams").insert({ name, description: text(formData, "description") });
  await finish(error);
}

export async function updateTeamAction(id: string, formData: FormData) {
  await ensureEditor();
  const name = text(formData, "name");
  if (!name) fail("invalid");
  const supabase = await createClient();
  const { error } = await supabase.from("teams").update({ name, description: text(formData, "description") }).eq("id", id);
  await finish(error);
}

export async function createProductAction(formData: FormData) {
  await ensureEditor();
  const name = text(formData, "name");
  if (!name) fail("invalid");
  const supabase = await createClient();
  const { error } = await supabase.from("products").insert({
    name,
    description: text(formData, "description"),
    owner_team_id: text(formData, "owner_team_id"),
  });
  await finish(error);
}

export async function updateProductAction(id: string, formData: FormData) {
  await ensureEditor();
  const name = text(formData, "name");
  if (!name) fail("invalid");
  const supabase = await createClient();
  const { error } = await supabase
    .from("products")
    .update({ name, description: text(formData, "description"), owner_team_id: text(formData, "owner_team_id") })
    .eq("id", id);
  await finish(error);
}

/** Archive or restore. Nothing is deleted, so existing subscriptions keep their references. */
export async function setArchivedAction(kind: Kind, id: string, archived: boolean) {
  await ensureEditor();
  const supabase = await createClient();
  const patch = { archived_at: archived ? new Date().toISOString() : null };
  const { error } = await supabase.from(kind).update(patch).eq("id", id);
  await finish(error);
}
