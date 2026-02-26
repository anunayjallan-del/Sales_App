import { NextRequest } from "next/server";
import { z } from "zod";
import { badRequest, ok, serverError } from "@/lib/http";
import { requireRole } from "@/lib/authz";
import { recordWithdrawalPromptAction, updateAuctionTrack } from "@/server/repositories/lots-repo";
import { recalculateMasterStatus } from "@/server/services/recalculate-master-status";

const schema = z.object({
  action: z.enum(["WITHDRAW_NOW", "REMIND_LATER", "NO"]),
  lot_id: z.string().uuid()
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole(req, ["admin", "operator"]);
    const body = schema.safeParse(await req.json());
    if (!body.success) return badRequest("Invalid payload", body.error.issues);

    const { id } = await params;
    const result = await recordWithdrawalPromptAction(id, body.data.action);

    if (body.data.action === "WITHDRAW_NOW") {
      await updateAuctionTrack(body.data.lot_id, { auction_status: "WITHDRAW" });
      await recalculateMasterStatus(body.data.lot_id);
    }

    return ok({ result }, 201);
  } catch (error) {
    return serverError(error);
  }
}
