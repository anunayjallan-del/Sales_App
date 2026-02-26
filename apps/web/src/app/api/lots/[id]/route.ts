import { NextRequest } from "next/server";
import { ok, serverError } from "@/lib/http";
import { deleteLotById, getLotWithRelations } from "@/server/repositories/lots-repo";
import { requireRole } from "@/lib/authz";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole(req, ["admin", "operator"]);
    const { id } = await params;
    const lot = await getLotWithRelations(id);
    return ok({ lot });
  } catch (error) {
    return serverError(error);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole(req, ["admin", "operator"]);
    const { id } = await params;
    await deleteLotById(id);
    return ok({ deleted: true });
  } catch (error) {
    return serverError(error);
  }
}
