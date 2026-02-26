import { NextRequest } from "next/server";
import { ok, serverError } from "@/lib/http";
import { requireRole } from "@/lib/authz";
import { listLotFilterOptions } from "@/server/repositories/lots-repo";

export async function GET(req: NextRequest) {
  try {
    await requireRole(req, ["admin", "operator"]);
    const options = await listLotFilterOptions();
    return ok(options);
  } catch (error) {
    return serverError(error);
  }
}

