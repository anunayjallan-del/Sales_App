import { ACTIVE_AUCTION_STATUSES } from "@/lib/constants";
import { AuctionStatus, LifecycleStatus, MasterStatus, PrivateDealStatus } from "@/lib/types";

export function resolveLifecycleStatus(input: {
  isCancelled: boolean;
  privateStatuses: PrivateDealStatus[];
  auctionStatus: AuctionStatus | null;
}): LifecycleStatus {
  if (input.isCancelled) return "CANCELLED";
  if (input.privateStatuses.includes("SOLD_PENDING_DISPATCH")) return "SOLD_PENDING_DISPATCH";
  if (input.privateStatuses.includes("SOLD")) return "SOLD_PRIVATE";
  if (input.auctionStatus === "SOLD_AUCTION") return "SOLD_AUCTION";
  if (input.auctionStatus === "IN_TRANSIT") return "IN_TRANSIT";
  if (input.auctionStatus === "HOLD") return "HOLD";
  if (input.auctionStatus === "OUT") return "OUT";
  return "PENDING";
}

export function lifecycleToLegacyMasterStatus(status: LifecycleStatus): MasterStatus {
  if (status === "SOLD_PENDING_DISPATCH") return "SOLD_PENDING_DISPATCH";
  if (status === "SOLD_PRIVATE") return "SOLD_PRIVATE";
  if (status === "SOLD_AUCTION") return "SOLD_AUCTION";
  if (status === "IN_TRANSIT") return "IN_TRANSIT";
  if (status === "HOLD") return "HOLD";
  if (status === "OUT") return "OUT";
  return "ACTIVE";
}

export function shouldPromptAutoWithdraw(input: {
  nextPrivateStatus: PrivateDealStatus;
  auctionStatus: AuctionStatus | null;
}): boolean {
  if (input.nextPrivateStatus !== "SOLD_PENDING_DISPATCH") return false;
  if (!input.auctionStatus) return false;
  return ACTIVE_AUCTION_STATUSES.includes(input.auctionStatus as (typeof ACTIVE_AUCTION_STATUSES)[number]);
}
