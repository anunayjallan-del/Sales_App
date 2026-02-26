import { NextRequest } from "next/server";
import { badRequest, ok, serverError } from "@/lib/http";
import { requireRole } from "@/lib/authz";
import {
  createDispatchAdvice,
  getBuyerName,
  getLotWithRelations,
  getPrivateDealById,
  patchPrivateDeal
} from "@/server/repositories/lots-repo";
import { isPrivateStatusAllowedForDispatch } from "@/server/services/flat-status-engine";
import { buildDispatchAdviceSnapshot } from "@/server/services/dispatch";
import { recalculateMasterStatus } from "@/server/services/recalculate-master-status";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole(req, ["admin", "operator"]);
    const { id } = await params;
    const deal = await getPrivateDealById(id);
    if (!isPrivateStatusAllowedForDispatch(deal.status)) {
      return badRequest("Dispatch advice can be generated only for SOLD_PENDING_DISPATCH or SOLD deals.");
    }

    const lot = await getLotWithRelations(deal.lot_id);
    const buyerName = await getBuyerName(deal.buyer_id);
    const snapshot = buildDispatchAdviceSnapshot({ lot, deal, buyer: { name: buyerName } });
    const dispatchAdvice = await createDispatchAdvice(snapshot);

    let updatedDeal = deal;
    if (deal.status === "SOLD_PENDING_DISPATCH") {
      updatedDeal = await patchPrivateDeal(id, { status: "SOLD" });
    }

    const status = await recalculateMasterStatus(deal.lot_id);
    return ok({
      deal: updatedDeal,
      dispatchAdvice,
      activeStatuses: status.activeStatuses,
      lifecycleStatus: status.lifecycleStatus,
      masterStatus: status.masterStatus
    });
  } catch (error) {
    return serverError(error);
  }
}

