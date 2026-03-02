import { NextRequest } from "next/server";
import { ok, serverError } from "@/lib/http";
import { requireRole } from "@/lib/authz";
import { listSamplingActions } from "@/server/repositories/lots-repo";

export async function GET(req: NextRequest) {
  try {
    await requireRole(req, ["admin", "operator"]);
    const rows = await listSamplingActions();
    return ok({ rows });
  } catch (error) {
    return serverError(error);
  }
}

