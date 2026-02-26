import { NextRequest } from "next/server";
import { badRequest, ok, serverError } from "@/lib/http";
import { requireRole } from "@/lib/authz";
import { patchAuctionSchema } from "@/server/schemas/lot-schemas";
import { getAuctionTrackForLot, updateAuctionTrack } from "@/server/repositories/lots-repo";
import { recalculateMasterStatus } from "@/server/services/recalculate-master-status";
import { validateAuctionTransition } from "@/server/services/flat-status-engine";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole(req, ["admin", "operator"]);
    const body = patchAuctionSchema.safeParse(await req.json());
    if (!body.success) return badRequest("Invalid payload", body.error.issues);

    const { id } = await params;
    if (body.data.auction_status) {
      const current = await getAuctionTrackForLot(id);
      const validation = validateAuctionTransition({
        previous: current?.auction_status ?? null,
        next: body.data.auction_status,
        saleNumber: body.data.sale_number ?? current?.sale_number ?? null,
        saleDate: body.data.auction_sold_date ?? body.data.sale_date ?? current?.auction_sold_date ?? current?.sale_date ?? null
      });
      if (!validation.ok) return badRequest(validation.reason);
    }
    const track = await updateAuctionTrack(id, body.data);
    const status = await recalculateMasterStatus(id);

    return ok({
      track,
      masterStatus: status.masterStatus,
      lifecycleStatus: status.lifecycleStatus,
      activeStatuses: status.activeStatuses
    });
  } catch (error) {
    return serverError(error);
  }
}
