import { NextRequest } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/authz";
import { badRequest, ok, serverError } from "@/lib/http";
import { commitAuctionSaleLive } from "@/server/services/auction-sale-desk";

const commitSchema = z.object({
  auction_centre: z.string().trim().min(1),
  sale_no: z.string().trim().min(1),
  sale_date: z.string().trim().min(1),
  rows: z
    .array(
      z.object({
        lot_id: z.string().trim().min(1),
        result: z.enum(["SOLD", "OUT"]),
        buyer_name: z.string().optional(),
        hammer_price: z.union([z.number(), z.string()]).optional(),
        out_price: z.union([z.number(), z.string()]).optional()
      })
    )
    .min(1)
});

export async function POST(req: NextRequest) {
  try {
    await requireRole(req, ["admin", "operator"]);

    const parsed = commitSchema.safeParse(await req.json());
    if (!parsed.success) {
      return badRequest("Invalid payload", parsed.error.issues);
    }

    const result = await commitAuctionSaleLive({
      auctionCentre: parsed.data.auction_centre,
      saleNo: parsed.data.sale_no,
      saleDate: parsed.data.sale_date,
      rows: parsed.data.rows
    });

    if (!result.ok && result.status === 400) {
      return badRequest(result.message, result.issues);
    }

    if (!result.ok) {
      return ok(
        {
          error: result.message,
          appliedLotIds: result.appliedLotIds,
          failedLotId: result.failedLotId
        },
        500
      );
    }

    return ok({ appliedLotIds: result.appliedLotIds }, 201);
  } catch (error) {
    return serverError(error);
  }
}
