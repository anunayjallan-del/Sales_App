import { NextRequest } from "next/server";
import { listLots } from "@/server/repositories/lots-repo";
import { lotQuerySchema } from "@/server/schemas/lot-schemas";
import { badRequest, ok, serverError } from "@/lib/http";
import { requireRole } from "@/lib/authz";

export async function GET(req: NextRequest) {
  try {
    await requireRole(req, ["admin", "operator"]);
    const query = lotQuerySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams.entries()));
    if (!query.success) return badRequest("Invalid query", query.error.issues);

    const result = await listLots(query.data);
    return ok({
      lots: result.lots,
      total: result.total,
      page: query.data.page,
      pageSize: query.data.pageSize
    });
  } catch (error) {
    return serverError(error);
  }
}
