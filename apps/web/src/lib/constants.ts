import { DashboardThresholds } from "@/lib/types";

export const DEFAULT_THRESHOLDS: DashboardThresholds = {
  outHoldDays: 7,
  overdueDays: 0
};

export const ACTIVE_AUCTION_STATUSES = [
  "IN_TRANSIT",
  "AWR_PENDING",
  "AWR_CATALOGUED",
  "RESERVE_SET",
  "REPRINT"
] as const;

export const INR = "INR";
