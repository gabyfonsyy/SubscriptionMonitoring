import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/lib/supabase/database.types";

export type CurrentUser = {
  id: string;
  email: string;
  displayName: string;
  role: AppRole;
  canEdit: boolean;
  isAdmin: boolean;
};

/**
 * The signed-in user with their app role. This is the single place identity is resolved, so a
 * future shared identity system only needs to change this function.
 * RLS remains the real enforcement; this only drives what the UI offers.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("id, email, display_name, role, is_active")
    .eq("id", data.user.id)
    .maybeSingle();

  if (!profile || !profile.is_active) return null;
  return {
    id: profile.id,
    email: profile.email,
    displayName: profile.display_name ?? profile.email,
    role: profile.role,
    canEdit: profile.role === "admin" || profile.role === "editor",
    isAdmin: profile.role === "admin",
  };
});

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login?error=domain");
  return user;
}

export class ForbiddenError extends Error {
  constructor() {
    super("You do not have permission to do that.");
  }
}

export async function requireEditor(): Promise<CurrentUser> {
  const user = await requireUser();
  if (!user.canEdit) throw new ForbiddenError();
  return user;
}
