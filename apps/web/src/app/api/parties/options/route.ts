import { NextRequest } from "next/server";
import { ok, serverError } from "@/lib/http";
import { requireRole } from "@/lib/authz";
import { listPartyOptions } from "@/server/repositories/lots-repo";

export async function GET(req: NextRequest) {
  try {
    await requireRole(req, ["admin", "operator"]);
    const options = await listPartyOptions();
    return ok(options);
  } catch (error) {
    return serverError(error);
  }
}

