import { NextRequest } from "next/server";
import { ok, serverError } from "@/lib/http";
import { DEFAULT_THRESHOLDS } from "@/lib/constants";
import { calculateDaysDelayed } from "@/lib/date";
import { getActiveStatusesForLots, getDashboardMetrics } from "@/server/repositories/lots-repo";
import { requireRole } from "@/lib/authz";
import { deriveActiveStatuses, deriveWarnings } from "@/server/services/flat-status-engine";
import { AuctionStatus, PrivateDealStatus } from "@/lib/types";

export async function GET(req: NextRequest) {
  try {
    await requireRole(req, ["admin", "operator"]);
    const { lots, deals, auctions } = await getDashboardMetrics();

    const overduePayments = deals.filter((d) => {
      const delayed = calculateDaysDelayed(d.due_date, d.payment_received_date);
      return delayed !== null && delayed > DEFAULT_THRESHOLDS.overdueDays;
    }).length;

    const dealsByLot = new Map<string, string[]>();
    for (const deal of deals) {
      const arr = dealsByLot.get(deal.lot_id) ?? [];
      arr.push(deal.status);
      dealsByLot.set(deal.lot_id, arr);
    }
    const auctionByLot = new Map<string, string | null>();
    for (const a of auctions) auctionByLot.set(a.lot_id, a.auction_status);
    const soldPendingNotWithdrawn = lots.filter((l) => {
      const statuses = dealsByLot.get(l.id) ?? [];
      const auctionStatus = auctionByLot.get(l.id);
      return statuses.includes("SOLD_PENDING_DISPATCH") && auctionStatus && auctionStatus !== "WITHDRAW";
    }).length;

    const activeByLot = await getActiveStatusesForLots(lots.map((l) => l.id));
    for (const lot of lots) {
      if (activeByLot.has(lot.id)) continue;
      const fallback = deriveActiveStatuses({
        isCancelled: Boolean(lot.is_cancelled),
        privateStatuses: (dealsByLot.get(lot.id) ?? []) as PrivateDealStatus[],
        auctionStatus: (auctionByLot.get(lot.id) ?? null) as AuctionStatus | null,
        hasAuctionPayment: false,
        hasPrivatePayment: deals.some((d) => d.lot_id === lot.id && !!d.payment_received_date)
      });
      activeByLot.set(lot.id, fallback);
    }

    const warningByLot = new Map<string, string[]>();
    for (const lot of lots) {
      warningByLot.set(lot.id, deriveWarnings(activeByLot.get(lot.id) ?? []));
    }

    const actionRequired = {
      soldPendingDispatch: lots.filter((l) => (activeByLot.get(l.id) ?? []).includes("SOLD_PENDING_DISPATCH")).length,
      privateCommittedAuctionActive: lots.filter((l) =>
        (warningByLot.get(l.id) ?? []).includes("PRIVATE_COMMITTED_AUCTION_ACTIVE")
      ).length,
      soldPendingNotWithdrawn,
      outLots: lots.filter((l) => (activeByLot.get(l.id) ?? []).includes("OUT")).length,
      holdLots: lots.filter((l) => (activeByLot.get(l.id) ?? []).includes("HOLD")).length,
      overduePayments
    };

    const snapshot = {
      totalActiveLots: lots.filter((l) => {
        const statuses = activeByLot.get(l.id) ?? [];
        return statuses.some((s) => ["PENDING", "PENDING_AUCTION_DISPATCH", "IN_TRANSIT", "AWR_PENDING", "AWR_RECEIVED", "CATALOGUED", "RESERVE_SET", "OUT", "HOLD", "REPRINT", "NEGOTIATING", "SAMPLING_SENT", "SOLD_PENDING_DISPATCH", "SOLD"].includes(s));
      }).length,
      auctionActive: lots.filter((l) => {
        const statuses = activeByLot.get(l.id) ?? [];
        return statuses.some((s) => ["PENDING_AUCTION_DISPATCH", "IN_TRANSIT", "AWR_PENDING", "AWR_RECEIVED", "CATALOGUED", "RESERVE_SET", "OUT", "HOLD", "REPRINT"].includes(s));
      }).length,
      privateActive: deals.filter((d) => ["SAMPLING_SENT", "NEGOTIATING"].includes(d.status)).length,
      lotsUnsold30d: lots.filter((l) => {
        const age = Math.floor((Date.now() - new Date(l.date_created).getTime()) / (1000 * 60 * 60 * 24));
        const statuses = activeByLot.get(l.id) ?? [];
        return age > 30 && statuses.some((s) => ["PENDING", "PENDING_AUCTION_DISPATCH", "IN_TRANSIT", "OUT", "HOLD", "REPRINT"].includes(s));
      }).length,
      closedLots: lots.filter((l) => (activeByLot.get(l.id) ?? []).includes("CLOSED")).length,
      totalOutstandingInr: deals
        .filter((d) => d.status === "SOLD" && !d.payment_received_date)
        .reduce((sum, d) => sum + Number(d.final_sale_price_inr ?? 0), 0)
    };

    return ok({ actionRequired, snapshot });
  } catch (error) {
    return serverError(error);
  }
}
