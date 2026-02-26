import { NextRequest } from "next/server";
import { listSyncRuns } from "@/server/repositories/lots-repo";
import { ok, serverError } from "@/lib/http";
import { requireRole } from "@/lib/authz";

export async function GET(req: NextRequest) {
  try {
    await requireRole(req, ["admin", "operator"]);
    const runs = await listSyncRuns();
    return ok({ runs });
  } catch (error) {
    return serverError(error);
  }
}
