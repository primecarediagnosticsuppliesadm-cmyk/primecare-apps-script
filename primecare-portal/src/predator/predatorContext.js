import { supabase } from "@/api/supabaseClient.js";

/**
 * @param {object|null|undefined} currentUser
 * @returns {import('@/predator/predatorSchema.js').PredatorTenantContext}
 */
export function tenantContextFromUser(currentUser) {
  if (!currentUser) {
    return { tenantId: null, role: null, userId: null };
  }
  return {
    tenantId: currentUser.tenantId ?? currentUser.tenant_id ?? null,
    role: currentUser.role ?? null,
    userId: currentUser.id ?? currentUser.user_id ?? null,
  };
}

/**
 * Browser profile fetch (anon JWT only — no service role).
 * @param {import('@/predator/predatorSchema.js').PredatorTenantContext} base
 */
export async function enrichTenantContextFromProfile(base) {
  if (!supabase || !base.userId) return base;
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("tenant_id, role, user_id")
      .eq("user_id", base.userId)
      .maybeSingle();
    if (error || !data) return base;
    return {
      tenantId: data.tenant_id ?? base.tenantId,
      role: data.role ?? base.role,
      userId: data.user_id ?? base.userId,
    };
  } catch {
    return base;
  }
}

/**
 * @param {object|null|undefined} currentUser
 */
export async function resolvePredatorTenantContext(currentUser) {
  const base = tenantContextFromUser(currentUser);
  return enrichTenantContextFromProfile(base);
}
