import { NextRequest } from "next/server";
import { badRequest, ok, serverError } from "@/lib/http";
import { requireRole } from "@/lib/authz";
import { bulkSamplingSchema } from "@/server/schemas/lot-schemas";
import { createPrivateDeal } from "@/server/repositories/lots-repo";
import { recalculateMasterStatus } from "@/server/services/recalculate-master-status";

export async function POST(req: NextRequest) {
  try {
    await requireRole(req, ["admin", "operator"]);
    const parsed = bulkSamplingSchema.safeParse(await req.json());
    if (!parsed.success) return badRequest("Invalid payload", parsed.error.issues);

    const created = await Promise.all(
      parsed.data.lot_ids.map((lotId) =>
        createPrivateDeal({
          lot_id: lotId,
          buyer_id: parsed.data.buyer_id,
          status: "SAMPLING_SENT",
          notes: parsed.data.notes ?? null
        })
      )
    );

    await Promise.all(parsed.data.lot_ids.map((lotId) => recalculateMasterStatus(lotId)));

    return ok({ createdCount: created.length }, 201);
  } catch (error) {
    return serverError(error);
  }
}
