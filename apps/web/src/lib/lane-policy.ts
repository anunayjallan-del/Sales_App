export const auctionLanePolicyRows = [
  { key: "PENDING", label: "- / none (PENDING)", actions: ["DISPATCH_TO_AUCTION"] as const },
  { key: "PENDING_AUCTION_DISPATCH", label: "PENDING_AUCTION_DISPATCH", actions: ["AUCTION_DISPATCHED", "WITHDRAW"] as const },
  { key: "IN_TRANSIT", label: "IN_TRANSIT", actions: ["HOLD_AWR", "AWR_RECEIVED", "WITHDRAW"] as const },
  { key: "AWR_PENDING", label: "AWR_PENDING", actions: ["AWR_RECEIVED", "WITHDRAW"] as const },
  {
    key: "CATALOGUED",
    label: "CATALOGUED",
    actions: ["SET_RESERVE_PRICE", "SOLD_AUCTION", "OUT", "HOLD", "WITHDRAW"] as const
  },
  { key: "RESERVE_SET", label: "RESERVE_SET", actions: ["SOLD_AUCTION", "OUT", "WITHDRAW"] as const },
  { key: "SOLD_AUCTION_PENDING_DETAILS", label: "SOLD_AUCTION_PENDING_DETAILS", actions: ["FINALIZE_SOLD_AUCTION"] as const },
  { key: "OUT", label: "OUT", actions: ["REPRINT", "HOLD", "WITHDRAW"] as const },
  { key: "HOLD", label: "HOLD", actions: ["REPRINT", "WITHDRAW"] as const },
  { key: "REPRINT", label: "REPRINT", actions: ["SET_RESERVE_PRICE", "OUT", "HOLD", "WITHDRAW"] as const },
  { key: "WITHDRAW", label: "WITHDRAW", actions: [] as const },
  { key: "SOLD_AUCTION", label: "SOLD_AUCTION", actions: ["PAYMENT_RECEIVED"] as const }
] as const;

export const privateLanePolicyRows = [
  { key: "NONE", label: "- / none", actions: ["NEGOTIATING", "SOLD_PENDING_DISPATCH"] as const },
  {
    key: "NEGOTIATING",
    label: "NEGOTIATING",
    actions: ["NEGOTIATING", "SOLD_PENDING_DISPATCH", "SOLD_PRIVATE"] as const
  },
  { key: "SOLD_PENDING_DISPATCH", label: "SOLD_PENDING_DISPATCH", actions: ["SOLD_PRIVATE"] as const },
  { key: "SOLD", label: "SOLD", actions: ["PAYMENT_RECEIVED"] as const }
] as const;

const auctionByStatus = Object.fromEntries(auctionLanePolicyRows.map((row) => [row.key, row.actions])) as Record<string, readonly string[]>;
const privateByStatus = Object.fromEntries(privateLanePolicyRows.map((row) => [row.key, row.actions])) as Record<string, readonly string[]>;

function normalizeAuctionLaneStatus(status: string | null | undefined): string | null {
  if (!status) return null;
  return status === "AWR_RECEIVED" ? "CATALOGUED" : status;
}

export function getAuctionLanePolicyActions(status: string | null | undefined): string[] {
  const normalized = normalizeAuctionLaneStatus(status);
  if (!normalized) return [...auctionByStatus.PENDING];
  return [...(auctionByStatus[normalized] ?? auctionByStatus.PENDING)];
}

export function getPrivateLanePolicyActions(status: string | null | undefined): string[] {
  if (!status) return [...privateByStatus.NONE];
  return [...(privateByStatus[status] ?? privateByStatus.NONE)];
}

export function getAuctionLanePolicyLabel(status: string | null | undefined): string {
  const normalized = normalizeAuctionLaneStatus(status);
  if (!normalized || !auctionByStatus[normalized]) return "- / none (PENDING)";
  return normalized;
}

export function getPrivateLanePolicyLabel(status: string | null | undefined): string {
  if (!status || !privateByStatus[status]) return "- / none";
  return status;
}
