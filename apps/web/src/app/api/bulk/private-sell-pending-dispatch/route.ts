import { NextRequest } from "next/server";
import { badRequest, ok, serverError } from "@/lib/http";
import { requireRole } from "@/lib/authz";
import { bulkSellPendingDispatchSchema } from "@/server/schemas/lot-schemas";
import { createPrivateDeal } from "@/server/repositories/lots-repo";
import { derivePrivatePaymentFields } from "@/server/services/payment";
import { recalculateMasterStatus } from "@/server/services/recalculate-master-status";

export async function POST(req: NextRequest) {
  try {
    await requireRole(req, ["admin", "operator"]);
    const parsed = bulkSellPendingDispatchSchema.safeParse(await req.json());
    if (!parsed.success) return badRequest("Invalid payload", parsed.error.issues);

    const soldDate = new Date().toISOString().slice(0, 10);
    const payment = derivePrivatePaymentFields({
      soldDate,
      paymentTerm: parsed.data.payment_term,
      paymentTermDays: parsed.data.payment_term_days
    });

    for (const lotId of parsed.data.lot_ids) {
      await createPrivateDeal({
        lot_id: lotId,
        buyer_id: parsed.data.buyer_id,
        status: "SOLD_PENDING_DISPATCH",
        final_sale_price_inr: parsed.data.final_sale_price_inr,
        payment_term: parsed.data.payment_term,
        payment_term_days: parsed.data.payment_term_days ?? null,
        due_date: payment.dueDate,
        notes: parsed.data.notes ?? null
      });

      await recalculateMasterStatus(lotId);
    }

    return ok({ updatedLotCount: parsed.data.lot_ids.length });
  } catch (error) {
    return serverError(error);
  }
}
