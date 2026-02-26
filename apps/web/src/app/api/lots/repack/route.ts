import { NextRequest } from "next/server";
import { badRequest, ok, serverError } from "@/lib/http";
import { requireRole } from "@/lib/authz";
import { repackSchema } from "@/server/schemas/lot-schemas";
import { repackLot } from "@/server/repositories/lots-repo";

export async function POST(req: NextRequest) {
  try {
    await requireRole(req, ["admin", "operator"]);
    const parsed = repackSchema.safeParse(await req.json());
    if (!parsed.success) return badRequest("Invalid payload", parsed.error.issues);

    const newLot = await repackLot({
      oldLotId: parsed.data.old_lot_id,
      newLot: {
        ...parsed.data.new_lot,
        factory: parsed.data.new_lot.factory ?? null
      }
    });

    return ok({ newLot }, 201);
  } catch (error) {
    return serverError(error);
  }
}
