import { NextRequest } from "next/server";
import { requireRole } from "@/lib/authz";
import { badRequest, ok, serverError } from "@/lib/http";
import { getAuctionSaleDesk } from "@/server/services/auction-sale-desk";

export async function GET(req: NextRequest) {
  try {
    await requireRole(req, ["admin", "operator"]);

    const auctionCentre = req.nextUrl.searchParams.get("auctionCentre")?.trim() ?? "";
    const saleNo = req.nextUrl.searchParams.get("saleNo")?.trim() ?? "";
    if (!auctionCentre || !saleNo) {
      return badRequest("auctionCentre and saleNo are required.");
    }

    const saleDesk = await getAuctionSaleDesk({ auctionCentre, saleNo });
    return ok(saleDesk);
  } catch (error) {
    return serverError(error);
  }
}
