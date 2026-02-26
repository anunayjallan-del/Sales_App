import { NextRequest } from "next/server";
import { badRequest, ok, serverError } from "@/lib/http";
import { requireRole } from "@/lib/authz";
import { bulkAuctionReserveSchema } from "@/server/schemas/lot-schemas";
import { bulkUpsertAuctionReserve } from "@/server/repositories/lots-repo";
import { recalculateMasterStatus } from "@/server/services/recalculate-master-status";

export async function POST(req: NextRequest) {
  try {
    await requireRole(req, ["admin", "operator"]);
    const parsed = bulkAuctionReserveSchema.safeParse(await req.json());
    if (!parsed.success) return badRequest("Invalid payload", parsed.error.issues);

    await bulkUpsertAuctionReserve(parsed.data.lot_ids, parsed.data.reserve_price_inr);
    await Promise.all(parsed.data.lot_ids.map((lotId) => recalculateMasterStatus(lotId)));

    return ok({ updatedLotCount: parsed.data.lot_ids.length });
  } catch (error) {
    return serverError(error);
  }
}
