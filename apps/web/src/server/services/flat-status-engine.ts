import { AuctionStatus, GlobalLotStatus, PrivateDealStatus } from "@/lib/types";

const auctionProgression: GlobalLotStatus[] = [
  "PENDING_AUCTION_DISPATCH",
  "IN_TRANSIT",
  "AWR_PENDING",
  "AWR_RECEIVED",
  "CATALOGUED",
  "RESERVE_SET",
  "SOLD_AUCTION",
  "OUT",
  "HOLD",
  "REPRINT",
  "WITHDRAW"
];

const privateProgression: GlobalLotStatus[] = ["SAMPLING_SENT", "NEGOTIATING", "SOLD_PENDING_DISPATCH", "SOLD"];
const auctionActiveForConflict = new Set<GlobalLotStatus>([
  "PENDING_AUCTION_DISPATCH",
  "IN_TRANSIT",
  "AWR_PENDING",
  "AWR_RECEIVED",
  "CATALOGUED",
  "RESERVE_SET",
  "OUT",
  "HOLD",
  "REPRINT"
]);

function normalizeAuctionStatus(status: AuctionStatus | null): GlobalLotStatus | null {
  if (!status) return null;
  if (status === "AWR_CATALOGUED") return "CATALOGUED";
  if (status === "IN_TRANSIT") return "IN_TRANSIT";
  if (status === "AWR_PENDING") return "AWR_PENDING";
  if (status === "AWR_RECEIVED") return "AWR_RECEIVED";
  if (status === "CATALOGUED") return "CATALOGUED";
  if (status === "RESERVE_SET") return "RESERVE_SET";
  if (status === "SOLD_AUCTION") return "SOLD_AUCTION";
  if (status === "OUT") return "OUT";
  if (status === "HOLD") return "HOLD";
  if (status === "REPRINT") return "REPRINT";
  if (status === "WITHDRAW") return "WITHDRAW";
  return null;
}

function privateStatusToGlobal(status: PrivateDealStatus): GlobalLotStatus | null {
  if (status === "SAMPLING_SENT") return "SAMPLING_SENT";
  if (status === "NEGOTIATING") return "NEGOTIATING";
  if (status === "SOLD_PENDING_DISPATCH") return "SOLD_PENDING_DISPATCH";
  if (status === "SOLD") return "SOLD";
  return null;
}

export function validateAuctionTransition(input: {
  previous: AuctionStatus | null;
  next: AuctionStatus;
  saleNumber?: string | null;
  saleDate?: string | null;
}): { ok: true } | { ok: false; reason: string } {
  const prev = normalizeAuctionStatus(input.previous);
  const next = normalizeAuctionStatus(input.next);
  if (!next) return { ok: false, reason: "Invalid auction status." };

  if (!prev && next !== "IN_TRANSIT") {
    return { ok: false, reason: "Auction lifecycle must start with IN_TRANSIT." };
  }

  if (prev) {
    const prevIdx = auctionProgression.indexOf(prev);
    const nextIdx = auctionProgression.indexOf(next);
    const allowed =
      nextIdx === prevIdx ||
      nextIdx === prevIdx + 1 ||
      (prev === "OUT" && (next === "HOLD" || next === "REPRINT" || next === "WITHDRAW"));
    if (!allowed) {
      return { ok: false, reason: `Invalid transition from ${prev} to ${next}.` };
    }
  }

  const requiresSaleNoStatuses = new Set<GlobalLotStatus>([
    "CATALOGUED",
    "RESERVE_SET",
    "SOLD_AUCTION",
    "OUT",
    "HOLD",
    "REPRINT"
  ]);
  if (requiresSaleNoStatuses.has(next) && !input.saleNumber?.trim()) {
    return { ok: false, reason: "Sale number is required from CATALOGUED stage onward." };
  }

  if (next === "SOLD_AUCTION" && !input.saleDate?.trim()) {
    return { ok: false, reason: "Sale date is required for SOLD_AUCTION." };
  }

  return { ok: true };
}

export function deriveActiveStatuses(input: {
  isCancelled: boolean;
  auctionStatus: AuctionStatus | null;
  privateStatuses: PrivateDealStatus[];
  hasAuctionPayment: boolean;
  hasPrivatePayment: boolean;
}): GlobalLotStatus[] {
  if (input.isCancelled) return ["CANCELLED"];

  const set = new Set<GlobalLotStatus>();
  const auction = normalizeAuctionStatus(input.auctionStatus);
  if (auction) set.add(auction);

  for (const s of input.privateStatuses) {
    const mapped = privateStatusToGlobal(s);
    if (mapped) set.add(mapped);
  }

  if (input.hasAuctionPayment || input.hasPrivatePayment) {
    set.add("CLOSED");
  }

  if (set.size === 0) set.add("PENDING");
  return Array.from(set);
}

export function deriveWarnings(activeStatuses: GlobalLotStatus[]): string[] {
  const hasPrivateCommitted = activeStatuses.includes("SOLD_PENDING_DISPATCH") || activeStatuses.includes("SOLD");
  const hasAuctionActive = activeStatuses.some((s) => auctionActiveForConflict.has(s));
  const warnings: string[] = [];
  if (hasPrivateCommitted && hasAuctionActive) warnings.push("PRIVATE_COMMITTED_AUCTION_ACTIVE");
  return warnings;
}

export function rankPrivateStatusForBadge(privateStatuses: PrivateDealStatus[]): GlobalLotStatus | null {
  for (const s of ["SOLD", "SOLD_PENDING_DISPATCH", "NEGOTIATING", "SAMPLING_SENT"] as const) {
    if (privateStatuses.includes(s)) return s;
  }
  return null;
}

export function rankAuctionStatusForBadge(auctionStatus: AuctionStatus | null): GlobalLotStatus | null {
  return normalizeAuctionStatus(auctionStatus);
}

export function isPrivateStatusAllowedForDispatch(status: PrivateDealStatus): boolean {
  return status === "SOLD_PENDING_DISPATCH" || status === "SOLD";
}

export { auctionProgression, privateProgression };
