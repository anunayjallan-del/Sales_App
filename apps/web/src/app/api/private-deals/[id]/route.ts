import { NextRequest } from "next/server";
import { badRequest, ok, serverError } from "@/lib/http";
import { requireRole } from "@/lib/authz";
import { patchPrivateDealSchema } from "@/server/schemas/lot-schemas";
import { getAuctionStatusForLot, patchPrivateDeal } from "@/server/repositories/lots-repo";
import { recalculateMasterStatus } from "@/server/services/recalculate-master-status";
import { derivePrivatePaymentFields } from "@/server/services/payment";
import { deriveWarnings } from "@/server/services/flat-status-engine";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole(req, ["admin", "operator"]);
    const body = patchPrivateDealSchema.safeParse(await req.json());
    if (!body.success) return badRequest("Invalid payload", body.error.issues);

    const { id } = await params;
    const patchPayload = { ...body.data } as Record<string, unknown>;
    if (patchPayload.status === "SOLD" || patchPayload.status === "SOLD_PENDING_DISPATCH") {
      const soldDate = new Date().toISOString().slice(0, 10);
      const payment = derivePrivatePaymentFields({
        soldDate,
        paymentTerm: (patchPayload.payment_term as "CD" | "DUE" | undefined) ?? "CD",
        paymentTermDays: (patchPayload.payment_term_days as number | undefined) ?? null,
        paymentReceivedDate: (patchPayload.payment_received_date as string | null | undefined) ?? null
      });
      patchPayload.due_date = payment.dueDate;
    }

    const deal = await patchPrivateDeal(id, patchPayload);

    const auctionStatus = await getAuctionStatusForLot(deal.lot_id);

    const status = await recalculateMasterStatus(deal.lot_id);
    const warnings = deriveWarnings(status.activeStatuses);
    const privateCommittedAuctionActiveWarning =
      warnings.includes("PRIVATE_COMMITTED_AUCTION_ACTIVE") && Boolean(auctionStatus && auctionStatus !== "WITHDRAW");

    return ok({
      deal,
      masterStatus: status.masterStatus,
      lifecycleStatus: status.lifecycleStatus,
      activeStatuses: status.activeStatuses,
      warnings,
      privateCommittedAuctionActiveWarning
    });
  } catch (error) {
    return serverError(error);
  }
}
