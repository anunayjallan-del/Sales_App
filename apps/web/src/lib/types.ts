export const auctionStatuses = [
  "IN_TRANSIT",
  "AWR_PENDING",
  "AWR_RECEIVED",
  "AWR_CATALOGUED",
  "CATALOGUED",
  "RESERVE_SET",
  "AUCTION_SCHEDULED",
  "SOLD_AUCTION",
  "OUT",
  "REPRINT",
  "HOLD",
  "WITHDRAW"
] as const;

export type AuctionStatus = (typeof auctionStatuses)[number];

export const privateDealStatuses = [
  "SAMPLING_SENT",
  "NEGOTIATING",
  "SOLD_PENDING_DISPATCH",
  "SOLD",
  "CANCELLED"
] as const;

export type PrivateDealStatus = (typeof privateDealStatuses)[number];

export const masterStatuses = [
  // Legacy persisted compatibility enum; lifecycle UI/API now uses `lifecycleStatuses`.
  "ACTIVE",
  "SOLD_PENDING_DISPATCH",
  "SOLD_PRIVATE",
  "SOLD_AUCTION",
  "IN_TRANSIT",
  "HOLD",
  "OUT"
] as const;

export type MasterStatus = (typeof masterStatuses)[number];

export const lifecycleStatuses = [
  "PENDING",
  "CANCELLED",
  "SOLD_PENDING_DISPATCH",
  "SOLD_PRIVATE",
  "SOLD_AUCTION",
  "IN_TRANSIT",
  "HOLD",
  "OUT"
] as const;

export type LifecycleStatus = (typeof lifecycleStatuses)[number];

export const globalLotStatuses = [
  "PENDING",
  "IN_TRANSIT",
  "AWR_PENDING",
  "AWR_RECEIVED",
  "CATALOGUED",
  "RESERVE_SET",
  "AUCTION_SCHEDULED",
  "SOLD_AUCTION",
  "OUT",
  "HOLD",
  "REPRINT",
  "WITHDRAW",
  "SAMPLING_SENT",
  "NEGOTIATING",
  "SOLD_PENDING_DISPATCH",
  "SOLD",
  "CANCELLED",
  "CLOSED"
] as const;

export type GlobalLotStatus = (typeof globalLotStatuses)[number];

export const lotStatusEventSources = ["IMPORT", "AUCTION_ACTION", "PRIVATE_ACTION", "SYSTEM", "MANUAL"] as const;
export type LotStatusEventSource = (typeof lotStatusEventSources)[number];

export type PaymentTerm = "CD" | "DUE";
export type DispatchAdviceStatus = "GENERATED" | "SHARED" | "BILLED";
export type UserRole = "admin" | "operator";

export type Lot = {
  id: string;
  mark: string;
  invoice_number: string;
  grade: string;
  bags: number;
  net_weight_kg: number;
  factory: string | null;
  date_created: string;
  is_cancelled: boolean;
  repacked_from_lot_id: string | null;
  repacked_to_lot_id: string | null;
  lifecycle_status: LifecycleStatus;
  master_status: MasterStatus;
  created_at: string;
  updated_at: string;
};

export type AuctionTrack = {
  lot_id: string;
  auction_status: AuctionStatus | null;
  sale_number: string | null;
  reserve_price_inr: number | null;
  hammer_price_inr: number | null;
  auction_sold_date: string | null;
  out_date: string | null;
  settlement_due_date: string | null;
  payment_received_date: string | null;
};

export type PrivateDeal = {
  id: string;
  lot_id: string;
  buyer_id: string;
  status: PrivateDealStatus;
  offered_price_inr: number | null;
  final_sale_price_inr: number | null;
  payment_term: PaymentTerm | null;
  payment_term_days: number | null;
  due_date: string | null;
  payment_received_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type DashboardThresholds = {
  outHoldDays: number;
  overdueDays: number;
};
