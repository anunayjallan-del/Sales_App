import { getAuctionStatusForLot, getPrivateStatusesForLot, isLotCancelled, updateMasterStatus } from "@/server/repositories/lots-repo";
import { lifecycleToLegacyMasterStatus, resolveLifecycleStatus } from "@/server/services/status-engine";
import { syncLotActiveStatuses } from "@/server/services/lot-status-sync";

export async function recalculateMasterStatus(lotId: string) {
  const [auctionStatus, privateStatuses, isCancelled] = await Promise.all([
    getAuctionStatusForLot(lotId),
    getPrivateStatusesForLot(lotId),
    isLotCancelled(lotId)
  ]);

  const lifecycleStatus = resolveLifecycleStatus({
    isCancelled,
    auctionStatus,
    privateStatuses
  });

  const master = lifecycleToLegacyMasterStatus(lifecycleStatus);
  await updateMasterStatus(lotId, master);
  const activeStatuses = await syncLotActiveStatuses(lotId, "SYSTEM");
  return { lifecycleStatus, masterStatus: master, activeStatuses };
}
