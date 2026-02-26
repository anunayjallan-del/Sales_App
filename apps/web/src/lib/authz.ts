import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { UserRole } from "@/lib/types";

export class AuthzError extends Error {
  status: number;

  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
  }
}

export async function requireRole(req: NextRequest, allowed: UserRole[]) {
  if (process.env.DEV_AUTH_BYPASS === "true") {
    const role: UserRole = "admin";
    if (!allowed.includes(role)) throw new AuthzError("Forbidden", 403);
    return { userId: "dev-user", role };
  }

  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new AuthzError("Missing bearer token", 401);
  }

  const token = authHeader.replace("Bearer ", "");
  const admin = getSupabaseAdmin();
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user) {
    throw new AuthzError("Unauthorized", 401);
  }

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("role")
    .eq("user_id", userData.user.id)
    .single();
  if (profileError || !profile) {
    throw new AuthzError("Profile not found", 403);
  }

  if (!allowed.includes(profile.role as UserRole)) {
    throw new AuthzError("Forbidden", 403);
  }

  return { userId: userData.user.id, role: profile.role as UserRole };
}
