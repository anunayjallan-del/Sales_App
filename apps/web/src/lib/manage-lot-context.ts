export type ManageLotActionName =
  | "SAMPLING"
  | "DISPATCH_TO_AUCTION"
  | "AUCTION_DISPATCHED"
  | "HOLD_AWR"
  | "AWR_RECEIVED"
  | "PRINT"
  | "SET_RESERVE_PRICE"
  | "SOLD_AUCTION_LIVE"
  | "FINALIZE_SOLD_AUCTION"
  | "SOLD_AUCTION"
  | "OUT"
  | "REPRINT"
  | "HOLD"
  | "WITHDRAW"
  | "NEGOTIATING"
  | "SOLD_PENDING_DISPATCH"
  | "SOLD_PRIVATE"
  | "CANCELLED"
  | "REINVOICED"
  | "PAYMENT_RECEIVED";

export type ContextMode = "auction" | "private" | "sampling" | "both" | "none";
export type TimelineLane = "auction" | "private";

export type ManageLotActionRow = {
  id: string;
  action: string;
  payload?: Record<string, unknown> | null;
  performed_at: string;
};

export type ManageLotLaneSnapshot = {
  auction_lane_status?: string | null;
  private_lane_status?: string | null;
};

export type DisplayField = {
  key: string;
  label: string;
  value: string;
};

export type TimelineEntry = {
  id: string;
  action: string;
  actionLabel: string;
  performedAt: string;
  fields: DisplayField[];
};

const auctionActionSet = new Set<string>([
  "DISPATCH_TO_AUCTION",
  "AUCTION_DISPATCHED",
  "HOLD_AWR",
  "AWR_RECEIVED",
  "PRINT",
  "SET_RESERVE_PRICE",
  "SOLD_AUCTION_LIVE",
  "FINALIZE_SOLD_AUCTION",
  "SOLD_AUCTION",
  "OUT",
  "REPRINT",
  "HOLD",
  "WITHDRAW"
]);

const privateActionSet = new Set<string>(["NEGOTIATING", "SOLD_PENDING_DISPATCH", "SOLD_PRIVATE"]);

const excludedPayloadKeys = new Set(["conflict_acknowledged", "conflict_prompt_type", "conflict_acknowledged_at"]);

const actionFieldOrder: Record<string, string[]> = {
  SAMPLING: ["parties", "sampling_date", "remarks"],
  DISPATCH_TO_AUCTION: ["advice_date", "broker", "warehouse", "auction_centre", "remarks"],
  AUCTION_DISPATCHED: ["dispatch_date", "transporter", "remarks"],
  HOLD_AWR: ["arrival_date", "remarks"],
  AWR_RECEIVED: ["arrival_date", "sale_no", "remarks"],
  PRINT: ["sale_no", "remarks"],
  SET_RESERVE_PRICE: ["reserve_price", "reserve_set_date", "point_of_contact", "remarks"],
  SOLD_AUCTION_LIVE: ["sale_no", "sale_date", "hammer_price", "buyer_name"],
  FINALIZE_SOLD_AUCTION: ["sale_no", "sale_date", "hammer_price", "buyer_name", "settlement_due_date", "remarks"],
  SOLD_AUCTION: ["sale_no", "sale_date", "hammer_price", "buyer_name", "settlement_due_date", "remarks"],
  OUT: ["sale_no", "out_date", "out_price", "remarks"],
  REPRINT: ["reprint_date", "target_sale_no", "remarks"],
  HOLD: ["hold_date", "remarks"],
  WITHDRAW: ["withdraw_date", "remarks"],
  NEGOTIATING: ["broker", "buyers", "buyer", "negotiation_date", "remarks"],
  SOLD_PENDING_DISPATCH: ["broker", "buyer", "sale_price", "sale_date", "payment_term", "remarks"],
  SOLD_PRIVATE: ["broker", "buyer", "sale_price", "sold_date", "payment_term", "remarks"],
  CANCELLED: ["cancelled_date", "cancel_reason", "remarks"],
  REINVOICED: ["reinvoice_date", "reinvoiced_to_lot_id", "remarks"],
  PAYMENT_RECEIVED: ["payment_received_date", "amount_received", "remarks"]
};

const fieldLabelMap: Record<string, string> = {
  advice_date: "Date of Dispatch Advice",
  amount_received: "Amount received",
  arrival_date: "Date of Arrival",
  auction_centre: "Auction Centre",
  broker: "Broker",
  buyer: "Buyer",
  buyer_name: "Buyer name",
  buyers: "Buyers",
  cancel_reason: "Cancel reason",
  cancelled_date: "Cancelled date",
  dispatch_date: "Date of Dispatch",
  hammer_price: "Hammer price",
  hold_date: "Hold date",
  negotiation_date: "Negotiation date",
  out_date: "Out date",
  out_price: "Out price",
  parties: "Parties",
  payment_received_date: "Payment received date",
  payment_term: "Payment term",
  point_of_contact: "Point of contact",
  print_date: "Print date",
  reinvoice_date: "Reinvoice date",
  reinvoiced_to_lot_id: "Reinvoiced to lot",
  remarks: "Remarks",
  reprint_date: "Reprint date",
  reserve_price: "Reserve price",
  reserve_set_date: "Reserve set date",
  sale_date: "Sale date",
  sale_no: "Sale no",
  sale_price: "Sale price",
  sampling_date: "Date of sampling",
  settlement_due_date: "Settlement due date",
  sold_date: "Sold date",
  target_sale_no: "Target sale no",
  transporter: "Transporter",
  warehouse: "Warehouse",
  withdraw_date: "Withdraw date"
};

function isEmptyValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

function formatActionName(action: string): string {
  return action
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item ?? "").trim())
      .filter(Boolean)
      .join(", ");
  }
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (value === null || value === undefined) return "";
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return "";
    }
  }
  return String(value);
}

function sortFields(action: string, keys: string[]): string[] {
  const priority = actionFieldOrder[action] ?? [];
  const rank = new Map<string, number>(priority.map((key, idx) => [key, idx]));
  return [...keys].sort((a, b) => {
    const aRank = rank.has(a) ? (rank.get(a) as number) : Number.POSITIVE_INFINITY;
    const bRank = rank.has(b) ? (rank.get(b) as number) : Number.POSITIVE_INFINITY;
    if (aRank !== bRank) return aRank - bRank;
    return a.localeCompare(b);
  });
}

export function toDisplayFields(action: string, payload: Record<string, unknown> | null | undefined): DisplayField[] {
  if (!payload) return [];

  const keys = Object.keys(payload).filter((key) => !excludedPayloadKeys.has(key) && !isEmptyValue(payload[key]));
  const orderedKeys = sortFields(action, keys);

  return orderedKeys
    .map((key) => {
      const value = formatValue(payload[key]);
      if (!value) return null;
      return {
        key,
        label: fieldLabelMap[key] ?? formatActionName(key),
        value
      };
    })
    .filter((item): item is DisplayField => Boolean(item));
}

function sortRows(rows: ManageLotActionRow[]): ManageLotActionRow[] {
  return [...rows].sort((a, b) => {
    const aTime = new Date(a.performed_at).getTime();
    const bTime = new Date(b.performed_at).getTime();
    if (aTime !== bTime) return bTime - aTime;
    return String(b.id).localeCompare(String(a.id));
  });
}

export function formatTimelineDateTime(value: string): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export function buildLaneTimeline(rows: ManageLotActionRow[], lane: TimelineLane): TimelineEntry[] {
  const allowedSet = lane === "auction" ? auctionActionSet : privateActionSet;
  return sortRows(rows)
    .filter((row) => allowedSet.has(row.action))
    .map((row) => ({
      id: String(row.id),
      action: row.action,
      actionLabel: formatActionName(row.action),
      performedAt: row.performed_at,
      fields: toDisplayFields(row.action, row.payload ?? null)
    }));
}

export function buildSamplingHistory(rows: ManageLotActionRow[]): TimelineEntry[] {
  return sortRows(rows)
    .filter((row) => row.action === "SAMPLING")
    .map((row) => ({
      id: String(row.id),
      action: row.action,
      actionLabel: "Sampling",
      performedAt: row.performed_at,
      fields: toDisplayFields(row.action, row.payload ?? null)
    }));
}

function resolvePaymentLaneContext(lot: ManageLotLaneSnapshot | null | undefined, rows: ManageLotActionRow[]): ContextMode {
  const latestSoldOrigin = sortRows(rows).find(
    (row) => row.action === "FINALIZE_SOLD_AUCTION" || row.action === "SOLD_AUCTION" || row.action === "SOLD_PRIVATE"
  );
  if (latestSoldOrigin?.action === "FINALIZE_SOLD_AUCTION") return "auction";
  if (latestSoldOrigin?.action === "SOLD_AUCTION") return "auction";
  if (latestSoldOrigin?.action === "SOLD_PRIVATE") return "private";

  if (lot?.auction_lane_status === "SOLD_AUCTION") return "auction";
  if (lot?.private_lane_status === "SOLD") return "private";
  return "both";
}

export function getActionContextMode(
  selectedAction: ManageLotActionName,
  lot: ManageLotLaneSnapshot | null | undefined,
  rows: ManageLotActionRow[]
): ContextMode {
  if (selectedAction === "REINVOICED") return "none";
  if (selectedAction === "SAMPLING") return "sampling";
  if (selectedAction === "CANCELLED") return "both";
  if (selectedAction === "PAYMENT_RECEIVED") return resolvePaymentLaneContext(lot, rows);
  if (auctionActionSet.has(selectedAction)) return "auction";
  if (privateActionSet.has(selectedAction)) return "private";
  return "none";
}
