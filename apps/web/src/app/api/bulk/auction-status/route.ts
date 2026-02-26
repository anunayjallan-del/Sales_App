import { NextRequest } from "next/server";
import { badRequest, ok, serverError } from "@/lib/http";
import { requireRole } from "@/lib/authz";
import { bulkAuctionStatusSchema } from "@/server/schemas/lot-schemas";
import { bulkUpsertAuctionStatus } from "@/server/repositories/lots-repo";
import { recalculateMasterStatus } from "@/server/services/recalculate-master-status";

export async function POST(req: NextRequest) {
  try {
    await requireRole(req, ["admin", "operator"]);
    const parsed = bulkAuctionStatusSchema.safeParse(await req.json());
    if (!parsed.success) return badRequest("Invalid payload", parsed.error.issues);

    await bulkUpsertAuctionStatus(parsed.data.lot_ids, parsed.data.auction_status);
    await Promise.all(parsed.data.lot_ids.map((lotId) => recalculateMasterStatus(lotId)));

    return ok({ updatedLotCount: parsed.data.lot_ids.length });
  } catch (error) {
    return serverError(error);
  }
}
