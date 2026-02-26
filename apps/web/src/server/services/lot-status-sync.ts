import {
  addLotStatusEvent,
  getActiveStatusesForLots,
  getAuctionStatusForLot,
  getLotWithRelations,
  getPrivateStatusesForLot,
  isLotCancelled,
  replaceLotActiveStatuses
} from "@/server/repositories/lots-repo";
import { deriveActiveStatuses, rankAuctionStatusForBadge, rankPrivateStatusForBadge } from "@/server/services/flat-status-engine";
import { GlobalLotStatus, LotStatusEventSource } from "@/lib/types";

export async function syncLotActiveStatuses(lotId: string, source: LotStatusEventSource = "SYSTEM") {
  const [auctionStatus, privateStatuses, isCancelled, lot, currentMap] = await Promise.all([
    getAuctionStatusForLot(lotId),
    getPrivateStatusesForLot(lotId),
    isLotCancelled(lotId),
    getLotWithRelations(lotId),
    getActiveStatusesForLots([lotId])
  ]);

  const hasAuctionPayment = Boolean(lot.auction_tracks?.[0]?.payment_received_date);
  const hasPrivatePayment = Boolean((lot.private_deals ?? []).some((d: { payment_received_date?: string | null }) => d.payment_received_date));
  const statuses = deriveActiveStatuses({
    isCancelled,
    auctionStatus,
    privateStatuses,
    hasAuctionPayment,
    hasPrivatePayment
  });

  const current = currentMap.get(lotId) ?? [];
  const currentSet = new Set(current);
  const nextSet = new Set(statuses);
  await replaceLotActiveStatuses(lotId, statuses);

  for (const status of statuses) {
    if (currentSet.has(status)) continue;
    await addLotStatusEvent({
      lotId,
      status: status as GlobalLotStatus,
      source,
      meta: {
        auction_status_badge: rankAuctionStatusForBadge(auctionStatus),
        private_status_badge: rankPrivateStatusForBadge(privateStatuses)
      }
    });
  }

  // For visibility, write deactivation markers in event metadata only.
  for (const status of current) {
    if (nextSet.has(status)) continue;
    await addLotStatusEvent({
      lotId,
      status,
      source,
      meta: { removed: true }
    });
  }
  return statuses;
}
