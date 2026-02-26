import { NextRequest } from "next/server";
import { badRequest, ok, serverError } from "@/lib/http";
import { requireRole } from "@/lib/authz";
import { createPrivateDealSchema } from "@/server/schemas/lot-schemas";
import { createPrivateDeal, getAuctionStatusForLot } from "@/server/repositories/lots-repo";
import { derivePrivatePaymentFields } from "@/server/services/payment";
import { recalculateMasterStatus } from "@/server/services/recalculate-master-status";
import { deriveWarnings } from "@/server/services/flat-status-engine";

export async function POST(req: NextRequest) {
  try {
    await requireRole(req, ["admin", "operator"]);
    const parsed = createPrivateDealSchema.safeParse(await req.json());
    if (!parsed.success) return badRequest("Invalid payload", parsed.error.issues);

    const payload = { ...parsed.data } as Record<string, unknown>;

    if (payload.status === "SOLD" || payload.status === "SOLD_PENDING_DISPATCH") {
      const soldDate = new Date().toISOString().slice(0, 10);
      const payment = derivePrivatePaymentFields({
        soldDate,
        paymentTerm: (payload.payment_term as "CD" | "DUE" | undefined) ?? "CD",
        paymentTermDays: (payload.payment_term_days as number | undefined) ?? null,
        paymentReceivedDate: (payload.payment_received_date as string | null | undefined) ?? null
      });
      payload.due_date = payment.dueDate;
    }

    const deal = await createPrivateDeal(payload);

    const auctionStatus = await getAuctionStatusForLot(deal.lot_id);

    const status = await recalculateMasterStatus(deal.lot_id);
    const warnings = deriveWarnings(status.activeStatuses);
    const privateCommittedAuctionActiveWarning =
      warnings.includes("PRIVATE_COMMITTED_AUCTION_ACTIVE") && Boolean(auctionStatus && auctionStatus !== "WITHDRAW");

    return ok(
      {
        deal,
        masterStatus: status.masterStatus,
        lifecycleStatus: status.lifecycleStatus,
        activeStatuses: status.activeStatuses,
        warnings,
        privateCommittedAuctionActiveWarning
      },
      201
    );
  } catch (error) {
    return serverError(error);
  }
}
