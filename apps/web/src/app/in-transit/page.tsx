"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CloseOutlined } from "@ant-design/icons";
import { App, Button, Card, Col, Drawer, Empty, Input, InputNumber, Popconfirm, Row, Select, Space, Spin, Table, Tag, Tooltip, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { AppShell } from "@/components/app-shell";
import { ManageLotHistoryContext } from "@/components/manage-lot-history-context";
import { fetchJson } from "@/lib/fetcher";
import { handleEnterToSubmit } from "@/lib/keyboard-submit";

type InTransitLotRow = {
  id: string;
  mark: string;
  invoice_number: string;
  grade: string;
  bags: number;
  net_weight_kg: number;
  date_created: string;
  active_statuses?: string[];
  is_sampled?: boolean;
  auction_lane_status?: string | null;
  private_lane_status?: string | null;
  allowed_actions?: string[];
  negotiating_buyers?: string[];
  last_negotiated_on?: string | null;
  reinvoiced_from_lot_id?: string | null;
};

type LotActionRow = {
  id: string;
  action: string;
  payload?: Record<string, unknown> | null;
  performed_at: string;
};

type ReinvoiceTargetRow = {
  id: string;
  mark: string;
  invoice_number: string;
  grade: string;
};

type GroupingContext = {
  auctionCentre: string;
  dispatchDate: string;
};

type InTransitSection = {
  auctionCentre: string;
  dispatchDateGroups: Array<{
    dispatchDate: string;
    markGroups: Array<{
      mark: string;
      lots: InTransitLotRow[];
      totalBags: number;
      totalWeight: number;
    }>;
  }>;
};

type ActionName =
  | "SAMPLING"
  | "DISPATCH_TO_AUCTION"
  | "AUCTION_DISPATCHED"
  | "HOLD_AWR"
  | "AWR_RECEIVED"
  | "SET_RESERVE_PRICE"
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

type ActionField = { key: string; label: string; type: "text" | "date" | "number" | "tags"; required?: boolean };
type ConflictPromptType =
  | "EARLY_STAGE_GUIDANCE"
  | "MIDDLE_STAGE_1_GUIDANCE"
  | "MIDDLE_STAGE_2_GUIDANCE"
  | "LATER_STAGE_GUIDANCE";

const WAREHOUSE_OPTIONS = ["Dipti Tea Warehouse", "Nowal Tea Warehouse"] as const;
const AUCTION_CENTRE_OPTIONS = ["Kolkata", "Guwahati"] as const;
const DISPATCH_BROKER_OPTIONS = ["Parcon", "Associated Brokers"] as const;
const AUCTION_CENTRE_BY_WAREHOUSE: Record<string, string> = {
  "Dipti Tea Warehouse": "Kolkata",
  "Nowal Tea Warehouse": "Guwahati"
};
const ASSOCIATED_BROKER = "Associated Brokers";

const actionFieldConfig: Record<ActionName, ActionField[]> = {
  SAMPLING: [
    { key: "parties", label: "Parties", type: "tags", required: true },
    { key: "sampling_date", label: "Date of sampling", type: "date", required: true },
    { key: "remarks", label: "Remarks", type: "text" }
  ],
  DISPATCH_TO_AUCTION: [
    { key: "advice_date", label: "Date of Dispatch Advice", type: "date", required: true },
    { key: "broker", label: "Broker", type: "text", required: true },
    { key: "warehouse", label: "Warehouse", type: "text", required: true },
    { key: "auction_centre", label: "Auction Centre", type: "text", required: true },
    { key: "remarks", label: "Remarks", type: "text" }
  ],
  AUCTION_DISPATCHED: [
    { key: "dispatch_date", label: "Date of Dispatch", type: "date", required: true },
    { key: "transporter", label: "Transporter", type: "text", required: true },
    { key: "remarks", label: "Remarks", type: "text" }
  ],
  HOLD_AWR: [
    { key: "arrival_date", label: "Date of Arrival", type: "date", required: true },
    { key: "remarks", label: "Remarks", type: "text" }
  ],
  AWR_RECEIVED: [
    { key: "arrival_date", label: "Date of Arrival", type: "date", required: true },
    { key: "sale_no", label: "Sale no", type: "text", required: true },
    { key: "remarks", label: "Remarks", type: "text" }
  ],
  SET_RESERVE_PRICE: [
    { key: "reserve_price", label: "Reserve price", type: "number", required: true },
    { key: "reserve_set_date", label: "Date", type: "date", required: true },
    { key: "point_of_contact", label: "Point of contact", type: "text" },
    { key: "remarks", label: "Remarks", type: "text" }
  ],
  SOLD_AUCTION: [
    { key: "sale_no", label: "Sale no", type: "text", required: true },
    { key: "sale_date", label: "Sale date", type: "date", required: true },
    { key: "hammer_price", label: "Hammer price", type: "number", required: true },
    { key: "buyer_name", label: "Buyer name", type: "text", required: true },
    { key: "settlement_due_date", label: "Settlement due date", type: "date", required: true },
    { key: "remarks", label: "Remarks", type: "text" }
  ],
  OUT: [
    { key: "sale_no", label: "Sale no", type: "text", required: true },
    { key: "out_date", label: "Date", type: "date", required: true },
    { key: "out_price", label: "Out price", type: "number", required: true },
    { key: "remarks", label: "Remarks", type: "text" }
  ],
  REPRINT: [
    { key: "reprint_date", label: "Reprint date", type: "date", required: true },
    { key: "target_sale_no", label: "Target sale no", type: "text", required: true },
    { key: "remarks", label: "Remarks", type: "text" }
  ],
  HOLD: [
    { key: "hold_date", label: "Hold date", type: "date", required: true },
    { key: "remarks", label: "Remarks", type: "text" }
  ],
  WITHDRAW: [
    { key: "withdraw_date", label: "Withdraw date", type: "date", required: true },
    { key: "remarks", label: "Remarks", type: "text" }
  ],
  NEGOTIATING: [
    { key: "broker", label: "Broker", type: "text", required: true },
    { key: "buyers", label: "Buyers", type: "text" },
    { key: "negotiation_date", label: "Negotiation date", type: "date", required: true }
  ],
  SOLD_PENDING_DISPATCH: [
    { key: "broker", label: "Broker", type: "text", required: true },
    { key: "buyer", label: "Buyer", type: "text", required: true },
    { key: "sale_price", label: "Sale price", type: "number", required: true },
    { key: "sale_date", label: "Date of sale", type: "date", required: true },
    { key: "payment_term", label: "Payment term", type: "text", required: true },
    { key: "remarks", label: "Remarks", type: "text" }
  ],
  SOLD_PRIVATE: [
    { key: "broker", label: "Broker", type: "text", required: true },
    { key: "buyer", label: "Buyer", type: "text", required: true },
    { key: "sale_price", label: "Sale price", type: "number", required: true },
    { key: "sold_date", label: "Sold date", type: "date", required: true },
    { key: "payment_term", label: "Payment term", type: "text", required: true },
    { key: "remarks", label: "Remarks", type: "text" }
  ],
  CANCELLED: [
    { key: "cancelled_date", label: "Cancelled date", type: "date", required: true },
    { key: "cancel_reason", label: "Cancel reason", type: "text" },
    { key: "remarks", label: "Remarks", type: "text" }
  ],
  REINVOICED: [
    { key: "reinvoice_date", label: "Reinvoice date", type: "date", required: true },
    { key: "reinvoiced_to_lot_id", label: "Reinvoiced to lot", type: "text", required: true },
    { key: "remarks", label: "Remarks", type: "text" }
  ],
  PAYMENT_RECEIVED: [
    { key: "payment_received_date", label: "Payment received date", type: "date", required: true },
    { key: "amount_received", label: "Amount received", type: "number", required: true },
    { key: "remarks", label: "Remarks", type: "text" }
  ]
};

const actionNameSet = new Set<ActionName>(Object.keys(actionFieldConfig) as ActionName[]);
const privateCommitmentActions = new Set<ActionName>(["SOLD_PENDING_DISPATCH", "SOLD_PRIVATE"]);
const auctionStatusesEarlyStage = new Set<string>(["PENDING_AUCTION_DISPATCH", "IN_TRANSIT"]);
const auctionStatusesMiddleStage1 = new Set<string>(["AWR_PENDING"]);
const auctionStatusesMiddleStage2 = new Set<string>(["AWR_RECEIVED"]);
const auctionStatusesLaterStage = new Set<string>(["CATALOGUED", "RESERVE_SET", "OUT", "HOLD", "REPRINT"]);
const auctionActiveForPrivateConflict = new Set<string>([
  "PENDING_AUCTION_DISPATCH",
  "IN_TRANSIT",
  "AWR_PENDING",
  "CATALOGUED",
  "RESERVE_SET",
  "OUT",
  "HOLD",
  "REPRINT"
]);
const conflictPromptOrder: ConflictPromptType[] = [
  "EARLY_STAGE_GUIDANCE",
  "MIDDLE_STAGE_1_GUIDANCE",
  "MIDDLE_STAGE_2_GUIDANCE",
  "LATER_STAGE_GUIDANCE"
];

const modalSelectProps = {
  style: { width: "100%" as const },
  listHeight: 420,
  popupMatchSelectWidth: false as const,
  styles: { popup: { root: { minWidth: 420 } } }
};

function sanitizeAllowedActions(actions: string[] | undefined): ActionName[] {
  if (!actions?.length) return Object.keys(actionFieldConfig) as ActionName[];
  return actions
    .map((action) => String(action) as ActionName)
    .filter((action) => actionNameSet.has(action));
}

function normalizeAuctionStatusForConflict(auctionStatus: string | null | undefined): string | null {
  if (!auctionStatus) return null;
  return auctionStatus === "AWR_RECEIVED" ? "CATALOGUED" : auctionStatus;
}

function ensureSamplingForNonTerminalLot(actions: ActionName[], row: InTransitLotRow | null): ActionName[] {
  if (!row) return actions;
  const statuses = row.active_statuses ?? [];
  if (statuses.includes("CANCELLED") || statuses.includes("CLOSED")) return actions;
  if (actions.includes("SAMPLING")) return actions;
  return ["SAMPLING", ...actions];
}

function resolveConflictPromptType(auctionStatus: string | null | undefined): ConflictPromptType | null {
  const normalized = normalizeAuctionStatusForConflict(auctionStatus);
  if (!normalized) return null;
  if (auctionStatusesEarlyStage.has(normalized)) return "EARLY_STAGE_GUIDANCE";
  if (auctionStatusesMiddleStage1.has(normalized)) return "MIDDLE_STAGE_1_GUIDANCE";
  if (auctionStatusesMiddleStage2.has(normalized)) return "MIDDLE_STAGE_2_GUIDANCE";
  if (auctionStatusesLaterStage.has(normalized)) return "LATER_STAGE_GUIDANCE";
  return null;
}

function getConflictPromptMessage(promptType: ConflictPromptType): string {
  if (promptType === "EARLY_STAGE_GUIDANCE") {
    return "This lot is on way to the auction. Are you sure you want to continue? If yes, remember to stop AWR generation.";
  }
  if (promptType === "MIDDLE_STAGE_1_GUIDANCE") {
    return "The AWR for this lot is on hold. Are you sure you want to continue? If yes, remember to cancel it's AWR.";
  }
  if (promptType === "MIDDLE_STAGE_2_GUIDANCE") {
    return "The AWR for this lot has been generated. Are you sure you want to continue? If yes, remember to stop it's printing.";
  }
  return "This lot is already in auction. Are you sure you want to continue? If yes, remember to withdraw the lot.";
}

function getConflictPromptLabel(promptType: ConflictPromptType): string {
  if (promptType === "EARLY_STAGE_GUIDANCE") return "Early stage";
  if (promptType === "MIDDLE_STAGE_1_GUIDANCE") return "Middle stage 1";
  if (promptType === "MIDDLE_STAGE_2_GUIDANCE") return "Middle stage 2";
  return "Later stage";
}

function getConflictAckMeta(action: ActionName, auctionStatus: string | null | undefined): { promptType: ConflictPromptType; message: string } | null {
  if (!privateCommitmentActions.has(action)) return null;
  const normalized = normalizeAuctionStatusForConflict(auctionStatus);
  if (!normalized || !auctionActiveForPrivateConflict.has(normalized)) return null;
  const promptType = resolveConflictPromptType(normalized);
  if (!promptType) return null;
  return {
    promptType,
    message: getConflictPromptMessage(promptType)
  };
}

function formatActionName(action: string): string {
  return action
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatStatusLabel(status: string): string {
  if (status === "AWR_RECEIVED") return "CATALOGUED";
  if (status === "PENDING_AUCTION_DISPATCH") return "PENDING AUCTION DISPATCH";
  if (status === "WITHDRAW") return "WITHDRAWN";
  return status;
}

function getFallbackStatus(activeStatuses: string[] | null | undefined): string {
  const statuses = (activeStatuses ?? []).map((status) => String(status)).filter(Boolean);
  if (!statuses.length) return "PENDING";
  if (statuses.includes("CLOSED")) return "CLOSED";
  if (statuses.includes("CANCELLED")) return "CANCELLED";
  return statuses[0] ?? "PENDING";
}

function getStatusChipColor(status: string): string {
  if (status === "CANCELLED") return "red";
  if (status === "CLOSED") return "blue";
  return "default";
}

function getLaneStatusChips(
  auctionStatus: string | null | undefined,
  privateStatus: string | null | undefined,
  activeStatuses?: string[] | null
): Array<{ color: string; label: string }> {
  const chips: Array<{ color: string; label: string }> = [];
  if (auctionStatus) chips.push({ color: "geekblue", label: formatStatusLabel(auctionStatus) });
  if (privateStatus) chips.push({ color: "purple", label: formatStatusLabel(privateStatus) });
  if (!chips.length) {
    const fallbackStatus = getFallbackStatus(activeStatuses);
    chips.push({ color: getStatusChipColor(fallbackStatus), label: formatStatusLabel(fallbackStatus) });
  }
  return chips;
}

const laneStatusSet = new Set<string>([
  "PENDING_AUCTION_DISPATCH",
  "IN_TRANSIT",
  "AWR_PENDING",
  "CATALOGUED",
  "RESERVE_SET",
  "SOLD_AUCTION",
  "OUT",
  "HOLD",
  "REPRINT",
  "WITHDRAW",
  "NEGOTIATING",
  "SOLD_PENDING_DISPATCH",
  "SOLD"
]);

function getNonLaneStatuses(row: InTransitLotRow): string[] {
  if (row.auction_lane_status || row.private_lane_status) return [];
  const statuses = new Set<string>();
  for (const rawStatus of row.active_statuses ?? []) {
    const status = String(rawStatus || "").trim();
    if (!status || laneStatusSet.has(status)) continue;
    statuses.add(status === "SAMPLING_SENT" ? "SAMPLED" : status);
  }
  if (row.is_sampled) statuses.add("SAMPLED");
  if (row.reinvoiced_from_lot_id) statuses.add("REINVOICED");
  if (!statuses.size) statuses.add("PENDING");
  return Array.from(statuses);
}

function negotiatingTooltipText(buyers: string[] | undefined, negotiatedOn: string | null | undefined): string | null {
  if (!buyers?.length) return null;
  const buyersText = buyers.join(", ");
  if (!negotiatedOn) return `Negotiating with: ${buyersText}`;
  return `Negotiating with: ${buyersText} (as of ${negotiatedOn})`;
}

function buildInitialActionData(action: ActionName): Record<string, unknown> {
  const fields = actionFieldConfig[action] ?? [];
  const initial: Record<string, unknown> = {};
  for (const field of fields) {
    if (field.type === "date") initial[field.key] = new Date().toISOString().slice(0, 10);
  }
  return initial;
}

function applyDispatchMappings(current: Record<string, unknown>, key: string, value: string): Record<string, unknown> {
  const next: Record<string, unknown> = { ...current, [key]: value };
  if (key === "broker" && value === ASSOCIATED_BROKER) {
    next.warehouse = "Dipti Tea Warehouse";
    next.auction_centre = AUCTION_CENTRE_BY_WAREHOUSE["Dipti Tea Warehouse"];
  }
  if (key === "warehouse") {
    const mapped = AUCTION_CENTRE_BY_WAREHOUSE[value];
    if (mapped) next.auction_centre = mapped;
  }
  return next;
}

function formatPackingDate(value: string): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = String(date.getFullYear()).slice(-2);
  return `${day}-${month}-${year}`;
}

function formatGroupDate(value: string): string {
  if (!value || value === "Unspecified Date of Dispatch") return "Unspecified Date of Dispatch";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

function lotNoNumericValue(lotNo: string): number {
  const digits = String(lotNo ?? "").match(/\d+/g)?.join("") ?? "";
  return digits ? Number(digits) : 0;
}

function compareLotNumbers(a: string, b: string): number {
  const aNum = lotNoNumericValue(a);
  const bNum = lotNoNumericValue(b);
  if (aNum !== bNum) return aNum - bNum;
  return String(a ?? "").localeCompare(String(b ?? ""));
}

export default function InTransitPage() {
  const { message, modal } = App.useApp();
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [selectedLotIds, setSelectedLotIds] = useState<string[]>([]);
  const [manageLot, setManageLot] = useState<InTransitLotRow | null>(null);
  const [actionSelectOpen, setActionSelectOpen] = useState(false);
  const [actionDetailsOpen, setActionDetailsOpen] = useState(false);
  const [selectedAction, setSelectedAction] = useState<ActionName | undefined>(undefined);
  const [actionStep1Choice, setActionStep1Choice] = useState<ActionName | undefined>(undefined);
  const [actionData, setActionData] = useState<Record<string, unknown>>({});
  const [partySearch, setPartySearch] = useState("");
  const [bulkPartySearch, setBulkPartySearch] = useState("");
  const [bulkActionSelectOpen, setBulkActionSelectOpen] = useState(false);
  const [bulkActionDetailsOpen, setBulkActionDetailsOpen] = useState(false);
  const [bulkSelectedAction, setBulkSelectedAction] = useState<ActionName | undefined>(undefined);
  const [bulkActionStep1Choice, setBulkActionStep1Choice] = useState<ActionName | undefined>(undefined);
  const [bulkActionData, setBulkActionData] = useState<Record<string, unknown>>({});
  const [reinvoiceTargetSearch, setReinvoiceTargetSearch] = useState("");

  const pageSize = 60;

  const { data, isLoading } = useQuery({
    queryKey: ["in-transit-lots", page, pageSize],
    queryFn: () =>
      fetchJson<{ lots: InTransitLotRow[]; total: number; page: number; pageSize: number }>(
        `/api/lots?page=${page}&pageSize=${pageSize}&status=IN_TRANSIT`
      )
  });
  const { data: partyOptions } = useQuery({
    queryKey: ["party-options-in-transit"],
    queryFn: () => fetchJson<{ buyers: string[]; brokers: string[] }>("/api/parties/options")
  });
  const { data: reinvoiceTargetsData, isFetching: reinvoiceTargetsLoading } = useQuery({
    queryKey: ["reinvoice-target-options-in-transit", reinvoiceTargetSearch],
    queryFn: () =>
      fetchJson<{ rows: ReinvoiceTargetRow[] }>(
        `/api/lots/reinvoice-targets?search=${encodeURIComponent(reinvoiceTargetSearch)}&limit=120`
      ),
    enabled: actionDetailsOpen && selectedAction === "REINVOICED"
  });
  const { data: manageLotActionsData, isLoading: manageLotActionsLoading } = useQuery({
    queryKey: ["lot-actions-manage-in-transit", manageLot?.id],
    queryFn: () => fetchJson<{ rows: LotActionRow[] }>(`/api/lots/${manageLot?.id}/actions`),
    enabled: actionDetailsOpen && Boolean(manageLot?.id)
  });
  const rows = useMemo(() => data?.lots ?? [], [data?.lots]);
  const total = data?.total ?? 0;

  const { data: groupingContextByLotId, isLoading: isGroupingContextLoading } = useQuery({
    queryKey: ["in-transit-grouping-context", rows.map((row) => row.id).join(",")],
    enabled: rows.length > 0,
    queryFn: async () => {
      const entries = await Promise.all(
        rows.map(async (row) => {
          const actions = await fetchJson<{ rows: LotActionRow[] }>(`/api/lots/${row.id}/actions`);
          const prepared = (actions.rows ?? []).find((action) => action.action === "DISPATCH_TO_AUCTION");
          const dispatched = (actions.rows ?? []).find((action) => action.action === "AUCTION_DISPATCHED");
          const auctionCentre = String((prepared?.payload?.auction_centre as unknown) ?? "").trim() || "Unspecified Auction Centre";
          const dispatchDate =
            String((dispatched?.payload?.dispatch_date as unknown) ?? "").trim() ||
            String(dispatched?.performed_at ?? "").slice(0, 10) ||
            "Unspecified Date of Dispatch";
          return [row.id, { auctionCentre, dispatchDate }] as const;
        })
      );
      return Object.fromEntries(entries) as Record<string, GroupingContext>;
    }
  });

  const manageMutation = useMutation({
    mutationFn: (payload: {
      lotId: string;
      action: ActionName;
      data: Record<string, unknown>;
      conflictAcknowledged?: boolean;
      conflictPromptType?: ConflictPromptType;
      conflictAcknowledgedAt?: string;
    }) =>
      fetchJson(`/api/lots/${payload.lotId}/actions`, {
        method: "POST",
        body: JSON.stringify({
          action: payload.action,
          data: payload.data,
          conflict_acknowledged: payload.conflictAcknowledged,
          conflict_prompt_type: payload.conflictPromptType,
          conflict_acknowledged_at: payload.conflictAcknowledgedAt
        })
      }),
    onSuccess: async () => {
      message.success("Action executed");
      setActionDetailsOpen(false);
      setActionSelectOpen(false);
      setManageLot(null);
      setSelectedAction(undefined);
      setActionStep1Choice(undefined);
      setActionData({});
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["in-transit-lots"] }),
        queryClient.invalidateQueries({ queryKey: ["lots"] })
      ]);
    },
    onError: (err: Error) => {
      message.error(err.message || "Failed to execute action");
    }
  });

  const deleteActionMutation = useMutation({
    mutationFn: async (payload: { lotId: string }) => {
      const actions = await fetchJson<{ rows: LotActionRow[] }>(`/api/lots/${payload.lotId}/actions`);
      const target = (actions.rows ?? []).find((row) => row.action === "AUCTION_DISPATCHED");
      if (!target) {
        throw new Error("No matching in-transit action found for this lot.");
      }
      return fetchJson<{ deleted: boolean; rolledBackToStatus?: string }>(`/api/lots/${payload.lotId}/actions/${target.id}`, {
        method: "DELETE"
      });
    },
    onSuccess: async () => {
      message.success("Action deleted");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["in-transit-lots"] }),
        queryClient.invalidateQueries({ queryKey: ["lots"] })
      ]);
    },
    onError: (error: Error) => {
      message.error(error.message || "Failed to delete action");
    }
  });

  const bulkManageMutation = useMutation({
    mutationFn: async (payload: { lots: InTransitLotRow[]; action: ActionName; data: Record<string, unknown> }) =>
      Promise.all(
        payload.lots.map((lot) => {
          const conflictMeta = getConflictAckMeta(payload.action, lot.auction_lane_status);
          return fetchJson(`/api/lots/${lot.id}/actions`, {
            method: "POST",
            body: JSON.stringify({
              action: payload.action,
              data: payload.data,
              conflict_acknowledged: conflictMeta ? true : undefined,
              conflict_prompt_type: conflictMeta?.promptType,
              conflict_acknowledged_at: conflictMeta ? new Date().toISOString() : undefined
            })
          });
        })
      ),
    onSuccess: async () => {
      message.success("Action executed");
      setBulkActionSelectOpen(false);
      setBulkActionDetailsOpen(false);
      setBulkActionStep1Choice(undefined);
      setBulkSelectedAction(undefined);
      setBulkActionData({});
      setSelectedLotIds([]);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["in-transit-lots"] }),
        queryClient.invalidateQueries({ queryKey: ["lots"] })
      ]);
    },
    onError: (error: Error) => {
      message.error(error.message || "Failed to execute action");
    }
  });

  const selectedRows = rows.filter((row) => selectedLotIds.includes(row.id));
  const hasBulkSelection = selectedLotIds.length >= 2;
  const bulkLaneAlignment = useMemo(() => {
    if (selectedRows.length < 2) {
      return { isAligned: false, lane: null as "auction" | "private" | "non_lane" | null, status: null as string | null };
    }

    const auctionStatuses = selectedRows.map((row) => row.auction_lane_status).filter((status): status is string => Boolean(status));
    const privateStatuses = selectedRows.map((row) => row.private_lane_status).filter((status): status is string => Boolean(status));

    const sameAuction = auctionStatuses.length === selectedRows.length && new Set(auctionStatuses).size === 1;
    if (sameAuction) {
      return { isAligned: true, lane: "auction" as const, status: auctionStatuses[0] ?? null };
    }

    const samePrivate = privateStatuses.length === selectedRows.length && new Set(privateStatuses).size === 1;
    if (samePrivate) {
      return { isAligned: true, lane: "private" as const, status: privateStatuses[0] ?? null };
    }

    const allRowsNoLane = selectedRows.every((row) => !row.auction_lane_status && !row.private_lane_status);
    if (allRowsNoLane) {
      const nonLaneStatusSets = selectedRows.map((row) => new Set(getNonLaneStatuses(row)));
      const commonStatuses = nonLaneStatusSets.slice(1).reduce((acc, currentSet) => {
        return new Set(Array.from(acc).filter((status) => currentSet.has(status)));
      }, nonLaneStatusSets[0] ?? new Set<string>());
      if (commonStatuses.size > 0) {
        const preferredOrder = ["CANCELLED", "CLOSED", "REINVOICED", "SAMPLED", "PENDING"];
        const alignedStatus =
          preferredOrder.find((status) => commonStatuses.has(status)) ?? Array.from(commonStatuses).sort((a, b) => a.localeCompare(b))[0] ?? null;
        return { isAligned: true, lane: "non_lane" as const, status: alignedStatus };
      }
    }

    return { isAligned: false, lane: null as "auction" | "private" | "non_lane" | null, status: null as string | null };
  }, [selectedRows]);

  const manageLotAllowedActions = useMemo(
    () => ensureSamplingForNonTerminalLot(sanitizeAllowedActions(manageLot?.allowed_actions), manageLot),
    [manageLot]
  );
  const actionOptions = useMemo(
    () =>
      manageLotAllowedActions.map((action) => ({
        label: formatActionName(action),
        value: action
      })),
    [manageLotAllowedActions]
  );
  const bulkCommonAllowedActions = useMemo(() => {
    if (!selectedRows.length || !bulkLaneAlignment.isAligned) return [] as ActionName[];
    const [head, ...tail] = selectedRows.map((row) => sanitizeAllowedActions(row.allowed_actions));
    const base = new Set(head);
    for (const actions of tail) {
      const current = new Set(actions);
      for (const action of Array.from(base)) {
        if (!current.has(action)) base.delete(action);
      }
    }
    return Array.from(base);
  }, [bulkLaneAlignment.isAligned, selectedRows]);
  const bulkActionOptions = useMemo(
    () =>
      bulkCommonAllowedActions
        .filter((action) => action !== "REINVOICED")
        .map((action) => ({
          label: formatActionName(action),
          value: action
        })),
    [bulkCommonAllowedActions]
  );
  const bulkManageDisabledReason = useMemo(() => {
    if (!bulkLaneAlignment.isAligned) return "Select lots with the same status in Auction lane, Private lane, or non-lane status.";
    if (!bulkActionOptions.length) return "No common actions for selected lots.";
    return "";
  }, [bulkActionOptions.length, bulkLaneAlignment.isAligned]);

  const samplingPartyOptions = useMemo(
    () =>
      Array.from(
        new Set([...(partyOptions?.buyers ?? []), ...(partyOptions?.brokers ?? [])].map((name) => String(name || "").trim()).filter(Boolean))
      )
        .sort((a, b) => a.localeCompare(b))
        .map((name) => ({ label: name, value: name })),
    [partyOptions?.buyers, partyOptions?.brokers]
  );
  const filteredSamplingPartyOptions = useMemo(() => {
    const q = partySearch.trim().toLowerCase();
    if (!q) return samplingPartyOptions;
    return samplingPartyOptions.filter((option) => String(option.label).toLowerCase().includes(q));
  }, [partySearch, samplingPartyOptions]);
  const filteredBulkSamplingPartyOptions = useMemo(() => {
    const q = bulkPartySearch.trim().toLowerCase();
    if (!q) return samplingPartyOptions;
    return samplingPartyOptions.filter((option) => String(option.label).toLowerCase().includes(q));
  }, [bulkPartySearch, samplingPartyOptions]);
  const brokerSelectOptions = useMemo(
    () => (partyOptions?.brokers ?? []).map((name) => ({ label: name, value: name })),
    [partyOptions?.brokers]
  );
  const buyerSelectOptions = useMemo(
    () => (partyOptions?.buyers ?? []).map((name) => ({ label: name, value: name })),
    [partyOptions?.buyers]
  );
  const dispatchBrokerSelectOptions = useMemo(
    () =>
      brokerSelectOptions.filter((option) =>
        DISPATCH_BROKER_OPTIONS.includes(String(option.value) as (typeof DISPATCH_BROKER_OPTIONS)[number])
      ),
    [brokerSelectOptions]
  );
  const warehouseSelectOptions = useMemo(() => WAREHOUSE_OPTIONS.map((name) => ({ label: name, value: name })), []);
  const auctionCentreSelectOptions = useMemo(() => AUCTION_CENTRE_OPTIONS.map((name) => ({ label: name, value: name })), []);
  const reinvoiceTargetOptions = useMemo(
    () =>
      (reinvoiceTargetsData?.rows ?? [])
        .filter((row) => row.id !== manageLot?.id)
        .map((row) => ({
          label: `${row.mark} / ${row.invoice_number} (${row.grade})`,
          value: row.id
        })),
    [manageLot?.id, reinvoiceTargetsData?.rows]
  );

  const groups = useMemo<InTransitSection[]>(() => {
    const parentMap = new Map<string, Map<string, Map<string, InTransitLotRow[]>>>();

    for (const row of rows) {
      const context = groupingContextByLotId?.[row.id];
      const auctionCentre = context?.auctionCentre || "Unspecified Auction Centre";
      const dispatchDate = context?.dispatchDate || "Unspecified Date of Dispatch";
      const mark = row.mark || "-";

      if (!parentMap.has(auctionCentre)) parentMap.set(auctionCentre, new Map<string, Map<string, InTransitLotRow[]>>());
      const dispatchDateMap = parentMap.get(auctionCentre)!;
      if (!dispatchDateMap.has(dispatchDate)) dispatchDateMap.set(dispatchDate, new Map<string, InTransitLotRow[]>());
      const markMap = dispatchDateMap.get(dispatchDate)!;
      const current = markMap.get(mark) ?? [];
      current.push(row);
      markMap.set(mark, current);
    }

    return Array.from(parentMap.entries())
      .map(([auctionCentre, dispatchDateMap]) => ({
        auctionCentre,
        dispatchDateGroups: Array.from(dispatchDateMap.entries())
          .map(([dispatchDate, markMap]) => ({
            dispatchDate,
            markGroups: Array.from(markMap.entries())
              .map(([mark, lots]) => ({
                mark,
                lots: lots.sort((a, b) => compareLotNumbers(a.invoice_number, b.invoice_number)),
                totalBags: lots.reduce((sum, lot) => sum + Number(lot.bags ?? 0), 0),
                totalWeight: lots.reduce((sum, lot) => sum + Number(lot.net_weight_kg ?? 0), 0)
              }))
              .sort((a, b) => a.mark.localeCompare(b.mark))
          }))
          .sort((a, b) => {
            if (a.dispatchDate === "Unspecified Date of Dispatch") return 1;
            if (b.dispatchDate === "Unspecified Date of Dispatch") return -1;
            return String(b.dispatchDate).localeCompare(String(a.dispatchDate));
          })
      }))
      .sort((a, b) => a.auctionCentre.localeCompare(b.auctionCentre));
  }, [groupingContextByLotId, rows]);

  const renderActionField = (
    field: ActionField,
    dataState: Record<string, unknown>,
    setDataState: React.Dispatch<React.SetStateAction<Record<string, unknown>>>,
    action: ActionName,
    scope: "single" | "bulk"
  ) => {
    const label = `${field.label}${field.required ? " *" : ""}`;
    const value = dataState[field.key];

    if (field.key === "parties") {
      const options = scope === "single" ? filteredSamplingPartyOptions : filteredBulkSamplingPartyOptions;
      const searchValue = scope === "single" ? partySearch : bulkPartySearch;
      const setSearchValue = scope === "single" ? setPartySearch : setBulkPartySearch;
      return (
        <Select
          {...modalSelectProps}
          mode="multiple"
          showSearch
          filterOption={false}
          placeholder={label}
          value={Array.isArray(value) ? (value as string[]) : []}
          options={options}
          searchValue={searchValue}
          onSearch={setSearchValue}
          onChange={(next) => setDataState((current) => ({ ...current, [field.key]: next }))}
        />
      );
    }

    if (field.key === "broker") {
      const brokerOptions = action === "DISPATCH_TO_AUCTION" ? dispatchBrokerSelectOptions : brokerSelectOptions;
      return (
        <Select
          {...modalSelectProps}
          showSearch
          placeholder={label}
          value={typeof value === "string" ? value : undefined}
          options={brokerOptions}
          onChange={(next) => setDataState((current) => applyDispatchMappings(current, field.key, String(next)))}
        />
      );
    }

    if (field.key === "warehouse") {
      return (
        <Select
          {...modalSelectProps}
          showSearch
          placeholder={label}
          value={typeof value === "string" ? value : undefined}
          options={warehouseSelectOptions}
          onChange={(next) => setDataState((current) => applyDispatchMappings(current, field.key, String(next)))}
        />
      );
    }

    if (field.key === "auction_centre") {
      return (
        <Select
          {...modalSelectProps}
          showSearch
          placeholder={label}
          value={typeof value === "string" ? value : undefined}
          options={auctionCentreSelectOptions}
          onChange={(next) => setDataState((current) => ({ ...current, [field.key]: next }))}
        />
      );
    }

    if (field.key === "buyer" || field.key === "buyer_name") {
      return (
        <Select
          {...modalSelectProps}
          showSearch
          placeholder={label}
          value={typeof value === "string" ? value : undefined}
          options={buyerSelectOptions}
          onChange={(next) => setDataState((current) => ({ ...current, [field.key]: next }))}
        />
      );
    }

    if (field.key === "buyers") {
      return (
        <Select
          {...modalSelectProps}
          mode="multiple"
          showSearch
          placeholder={label}
          value={Array.isArray(value) ? (value as string[]) : []}
          options={buyerSelectOptions}
          onChange={(next) => setDataState((current) => ({ ...current, [field.key]: next }))}
        />
      );
    }

    if (field.key === "payment_term") {
      return (
        <Select
          {...modalSelectProps}
          placeholder={label}
          value={typeof value === "string" ? value : undefined}
          options={[
            { label: "CD", value: "CD" },
            { label: "DUE", value: "DUE" }
          ]}
          onChange={(next) => setDataState((current) => ({ ...current, [field.key]: next }))}
        />
      );
    }

    if (field.key === "reinvoiced_to_lot_id") {
      return (
        <Select
          {...modalSelectProps}
          showSearch
          filterOption={false}
          placeholder={label}
          value={typeof value === "string" ? value : undefined}
          options={reinvoiceTargetOptions}
          loading={reinvoiceTargetsLoading}
          searchValue={reinvoiceTargetSearch}
          onSearch={setReinvoiceTargetSearch}
          onChange={(next) => setDataState((current) => ({ ...current, [field.key]: next }))}
        />
      );
    }

    if (field.type === "date") {
      return (
        <Input
          type="date"
          value={typeof value === "string" ? value : ""}
          onChange={(event) => setDataState((current) => ({ ...current, [field.key]: event.target.value }))}
        />
      );
    }

    if (field.type === "number") {
      return (
        <InputNumber
          style={{ width: "100%" }}
          value={typeof value === "number" ? value : value ? Number(value) : undefined}
          onChange={(next) => setDataState((current) => ({ ...current, [field.key]: next ?? undefined }))}
        />
      );
    }

    return (
      <Input
        value={typeof value === "string" ? value : ""}
        placeholder={label}
        onChange={(event) => setDataState((current) => ({ ...current, [field.key]: event.target.value }))}
      />
    );
  };

  const submitInTransitManageLotAction = async () => {
    if (!manageLot?.id || !selectedAction || manageMutation.isPending) return;
    if (!manageLotAllowedActions.includes(selectedAction)) {
      message.error("Selected action is not allowed for this lot.");
      return;
    }
    const required = actionFieldConfig[selectedAction].filter((f) => f.required);
    const missing = required.find((f) => {
      const v = actionData[f.key];
      if (Array.isArray(v)) return v.length === 0;
      return v === undefined || v === null || String(v).trim() === "";
    });
    if (missing) {
      message.error(`${missing.label} is required`);
      return;
    }
    const conflictMeta = getConflictAckMeta(selectedAction, manageLot.auction_lane_status);
    if (conflictMeta) {
      const acknowledged = await new Promise<boolean>((resolve) => {
        modal.confirm({
          title: "Warning!",
          content: (
            <Space direction="vertical" size={6}>
              <Typography.Text>
                Lot: {manageLot.mark} / {manageLot.invoice_number}
              </Typography.Text>
              <Typography.Text>{conflictMeta.message}</Typography.Text>
            </Space>
          ),
          okText: "Continue",
          cancelText: "Cancel",
          onOk: () => resolve(true),
          onCancel: () => resolve(false)
        });
      });
      if (!acknowledged) return;
      await manageMutation.mutateAsync({
        lotId: manageLot.id,
        action: selectedAction,
        data: actionData,
        conflictAcknowledged: true,
        conflictPromptType: conflictMeta.promptType,
        conflictAcknowledgedAt: new Date().toISOString()
      });
      return;
    }
    await manageMutation.mutateAsync({
      lotId: manageLot.id,
      action: selectedAction,
      data: actionData
    });
  };

  const submitBulkManageLotAction = async () => {
    if (!selectedLotIds.length || !bulkSelectedAction || bulkManageMutation.isPending) return;
    if (!bulkLaneAlignment.isAligned) {
      message.error("Manage Lot is allowed only when selected lots share one lane status or one non-lane status.");
      return;
    }
    if (!bulkActionOptions.some((option) => option.value === bulkSelectedAction)) {
      message.error("Selected action is not allowed for all selected lots.");
      return;
    }
    const required = actionFieldConfig[bulkSelectedAction].filter((f) => f.required);
    const missing = required.find((f) => {
      const v = bulkActionData[f.key];
      if (Array.isArray(v)) return v.length === 0;
      return v === undefined || v === null || String(v).trim() === "";
    });
    if (missing) {
      message.error(`${missing.label} is required`);
      return;
    }
    const conflicts = selectedRows
      .map((row) => ({ row, conflict: getConflictAckMeta(bulkSelectedAction, row.auction_lane_status) }))
      .filter((entry) => Boolean(entry.conflict));
    if (conflicts.length) {
      const countsByPrompt = new Map<ConflictPromptType, number>();
      for (const entry of conflicts) {
        const promptType = entry.conflict?.promptType as ConflictPromptType | undefined;
        if (!promptType) continue;
        countsByPrompt.set(promptType, (countsByPrompt.get(promptType) ?? 0) + 1);
      }
      const acknowledged = await new Promise<boolean>((resolve) => {
        modal.confirm({
          title: "Warning!",
          content: (
            <Space direction="vertical" size={6}>
              <Typography.Text>
                {conflicts.length} selected lot(s) need confirmation before continuing.
              </Typography.Text>
              {conflictPromptOrder
                .filter((promptType) => (countsByPrompt.get(promptType) ?? 0) > 0)
                .map((promptType) => (
                  <Typography.Text key={`in-transit-bulk-warning-${promptType}`}>
                    {getConflictPromptLabel(promptType)} ({countsByPrompt.get(promptType)} lot(s)): {getConflictPromptMessage(promptType)}
                  </Typography.Text>
                ))}
            </Space>
          ),
          okText: "Continue",
          cancelText: "Cancel",
          onOk: () => resolve(true),
          onCancel: () => resolve(false)
        });
      });
      if (!acknowledged) return;
    }
    await bulkManageMutation.mutateAsync({
      lots: selectedRows,
      action: bulkSelectedAction,
      data: bulkActionData
    });
  };

  const openInTransitManageStep2 = (action: ActionName) => {
    if (!manageLotAllowedActions.includes(action)) return;
    setSelectedAction(action);
    setActionStep1Choice(undefined);
    setActionData(buildInitialActionData(action));
    setReinvoiceTargetSearch("");
    setActionSelectOpen(false);
    setActionDetailsOpen(true);
  };

  const openBulkInTransitManageStep2 = (action: ActionName) => {
    if (!bulkLaneAlignment.isAligned) return;
    if (!bulkActionOptions.some((option) => option.value === action)) return;
    setBulkSelectedAction(action);
    setBulkActionStep1Choice(undefined);
    setBulkActionData(buildInitialActionData(action));
    setBulkActionSelectOpen(false);
    setBulkActionDetailsOpen(true);
  };

  const toggleSelectedLot = (lotId: string) => {
    setSelectedLotIds((prev) => (prev.includes(lotId) ? prev.filter((id) => id !== lotId) : [...prev, lotId]));
  };

  const lotColumns: ColumnsType<InTransitLotRow> = [
    { title: "Lot No.", dataIndex: "invoice_number", key: "invoice_number", width: 150 },
    { title: "Grade", dataIndex: "grade", key: "grade", width: 140 },
    { title: "Bags", dataIndex: "bags", key: "bags", width: 100 },
    { title: "Quantity", dataIndex: "net_weight_kg", key: "net_weight_kg", width: 120 },
    {
      title: "Packing Date",
      dataIndex: "date_created",
      key: "date_created",
      width: 140,
      render: (value: string) => formatPackingDate(value)
    },
    {
      title: "Status",
      key: "status",
      width: 260,
      render: (_, row) => {
        const statuses = row.active_statuses?.length
          ? row.active_statuses
          : getLaneStatusChips(row.auction_lane_status, row.private_lane_status, row.active_statuses).map((chip) => chip.label);
        const negotiatingTooltip = negotiatingTooltipText(row.negotiating_buyers, row.last_negotiated_on);
        return (
          <Space size={[4, 4]} wrap>
            {statuses.map((status) => {
              const label = formatStatusLabel(status);
              const isNegotiatingChip = status === "NEGOTIATING" && Boolean(negotiatingTooltip);
              const tag = (
                <Tag key={`${row.id}-${status}`} color={status === "NEGOTIATING" ? "purple" : "geekblue"}>
                  {label}
                </Tag>
              );
              return isNegotiatingChip ? (
                <Tooltip key={`${row.id}-${status}-tooltip`} title={negotiatingTooltip}>
                  {tag}
                </Tooltip>
              ) : (
                tag
              );
            })}
            {row.is_sampled ? <Tag color="cyan">SAMPLED</Tag> : null}
            {row.reinvoiced_from_lot_id && !row.auction_lane_status && !row.private_lane_status ? (
              <Tag color="gold">REINVOICED</Tag>
            ) : null}
          </Space>
        );
      }
    },
    {
      title: "Action",
      key: "action",
      width: 320,
      render: (_, row) => {
        const allowedActions = sanitizeAllowedActions(row.allowed_actions);
        const firstAction = allowedActions[0];
        return (
          <Space size={8}>
            <Button
              size="small"
              disabled={!firstAction}
              title={!firstAction ? "No actions available for current status" : undefined}
              onClick={() => {
                if (!firstAction) return;
                setManageLot(row);
                setSelectedAction(undefined);
                setActionStep1Choice(undefined);
                setActionSelectOpen(true);
                setActionDetailsOpen(false);
                setActionData({});
              }}
            >
              Manage Lot
            </Button>
            <Link href={`/lots/${row.id}`}>
              <Button size="small">View</Button>
            </Link>
            <Popconfirm
              title="Delete this action only?"
              description="Lot will remain. Only latest action can be deleted."
              okText="Delete Action"
              okButtonProps={{ danger: true, loading: deleteActionMutation.isPending }}
              cancelText="Cancel"
              onConfirm={async () => {
                await deleteActionMutation.mutateAsync({ lotId: row.id });
              }}
            >
              <Button size="small" danger>
                Delete Action
              </Button>
            </Popconfirm>
          </Space>
        );
      }
    }
  ];

  return (
    <AppShell title="In Transit">
      <Card variant="borderless">
        <Space direction="vertical" style={{ width: "100%" }} size="middle">
          <Typography.Title level={4} style={{ margin: 0 }}>
            In Transit
          </Typography.Title>

          {hasBulkSelection ? (
            <div style={{ display: "flex", justifyContent: "flex-end", width: "100%" }}>
              <Space direction="vertical" size={4} style={{ alignItems: "flex-end" }}>
                <Space size={8} align="center">
                  <Button
                    type="primary"
                    size="small"
                    disabled={!bulkLaneAlignment.isAligned || !bulkActionOptions.length}
                    title={bulkManageDisabledReason || undefined}
                    onClick={() => {
                      setBulkActionStep1Choice(undefined);
                      setBulkSelectedAction(undefined);
                      setBulkActionSelectOpen(true);
                      setBulkActionDetailsOpen(false);
                    }}
                  >
                    Manage lots
                  </Button>
                  <Button
                    type="default"
                    size="small"
                    danger
                    shape="circle"
                    icon={<CloseOutlined style={{ fontSize: 10 }} />}
                    style={{
                      borderColor: "#ff7875",
                      color: "#ff4d4f",
                      background: "#fff",
                      width: 22,
                      minWidth: 22,
                      height: 22,
                      paddingInline: 0
                    }}
                    aria-label="Clear selection"
                    title="Clear selection"
                    onClick={() => setSelectedLotIds([])}
                  />
                </Space>
                <Typography.Text type={bulkLaneAlignment.isAligned ? "secondary" : "danger"} style={{ fontSize: 11, lineHeight: 1.1 }}>
                  {bulkLaneAlignment.isAligned ? `${selectedLotIds.length} lots` : "Conflict"}
                </Typography.Text>
              </Space>
            </div>
          ) : null}

          {isLoading ? <Spin /> : null}
          {!isLoading && isGroupingContextLoading ? <Spin /> : null}
          {!isLoading && rows.length === 0 ? <Empty description="No in-transit lots" /> : null}

          {!isLoading
            ? groups.map((auctionCentreGroup) => (
                <Card
                  key={auctionCentreGroup.auctionCentre}
                  size="small"
                  title={<Typography.Text strong>{auctionCentreGroup.auctionCentre}</Typography.Text>}
                >
                  <Space direction="vertical" size={12} style={{ width: "100%" }}>
                    {auctionCentreGroup.dispatchDateGroups.map((dispatchDateGroup) => (
                      <Card
                        key={`${auctionCentreGroup.auctionCentre}-${dispatchDateGroup.dispatchDate}`}
                        size="small"
                        title={<Typography.Text strong>{formatGroupDate(dispatchDateGroup.dispatchDate)}</Typography.Text>}
                      >
                        <Space direction="vertical" size={12} style={{ width: "100%" }}>
                          {dispatchDateGroup.markGroups.map((markGroup) => (
                            <Card
                              key={`${auctionCentreGroup.auctionCentre}-${dispatchDateGroup.dispatchDate}-${markGroup.mark}`}
                              size="small"
                              title={
                                <Space>
                                  <Typography.Text strong>{markGroup.mark}</Typography.Text>
                                  <Tag color="gold">Total Bags: {markGroup.totalBags}</Tag>
                                  <Tag color="blue">Total Quantity: {markGroup.totalWeight} kgs</Tag>
                                </Space>
                              }
                            >
                              <Table
                                rowKey="id"
                                columns={lotColumns}
                                dataSource={markGroup.lots}
                                rowSelection={{
                                  selectedRowKeys: markGroup.lots
                                    .map((row) => row.id)
                                    .filter((id) => selectedLotIds.includes(id)),
                                  onSelect: (record, selected) => {
                                    setSelectedLotIds((prev) => {
                                      if (selected) return Array.from(new Set([...prev, String(record.id)]));
                                      return prev.filter((id) => id !== String(record.id));
                                    });
                                  },
                                  onSelectAll: (selected, _selectedRows, changeRows) => {
                                    const changedIds = changeRows.map((row) => String(row.id));
                                    setSelectedLotIds((prev) => {
                                      if (selected) return Array.from(new Set([...prev, ...changedIds]));
                                      return prev.filter((id) => !changedIds.includes(id));
                                    });
                                  }
                                }}
                                onRow={(record) => ({
                                  onClick: (event) => {
                                    const target = event.target as HTMLElement;
                                    if (target.closest("button, a, input, .ant-checkbox-wrapper, .ant-select, .ant-input-number")) return;
                                    toggleSelectedLot(record.id);
                                  }
                                })}
                                rowClassName={() => "clickable-lot-row"}
                                pagination={false}
                                size="small"
                                scroll={{ x: 920 }}
                              />
                            </Card>
                          ))}
                        </Space>
                      </Card>
                    ))}
                  </Space>
                </Card>
              ))
            : null}

          {!isLoading && total > pageSize ? (
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <Button
                disabled={page <= 1}
                onClick={() => {
                  setPage((current) => Math.max(1, current - 1));
                  setSelectedLotIds([]);
                }}
                style={{ marginRight: 8 }}
              >
                Previous
              </Button>
              <Button
                disabled={page * pageSize >= total}
                onClick={() => {
                  setPage((current) => current + 1);
                  setSelectedLotIds([]);
                }}
                style={{ marginRight: 12 }}
              >
                Next
              </Button>
              <Typography.Text type="secondary">
                {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, total)} of {total} lots
              </Typography.Text>
            </div>
          ) : null}
        </Space>
      </Card>

      <Drawer
        title={actionDetailsOpen ? "Manage Lot • Step 2 of 2" : "Manage Lot • Step 1 of 2"}
        open={actionSelectOpen || actionDetailsOpen}
        width={620}
        onClose={() => {
          setActionSelectOpen(false);
          setActionDetailsOpen(false);
          setActionStep1Choice(undefined);
          setManageLot(null);
          setSelectedAction(undefined);
          setActionData({});
          setReinvoiceTargetSearch("");
        }}
        placement="right"
        footer={
          actionDetailsOpen ? (
            <Space style={{ width: "100%", justifyContent: "space-between" }}>
              <Button
                onClick={() => {
                  setActionDetailsOpen(false);
                  setActionSelectOpen(true);
                  setActionStep1Choice(undefined);
                  setSelectedAction(undefined);
                }}
              >
                Back
              </Button>
              <Button type="primary" loading={manageMutation.isPending} onClick={submitInTransitManageLotAction}>
                Save Action
              </Button>
            </Space>
          ) : (
            <Space style={{ width: "100%", justifyContent: "flex-end" }}>
              <Button
                onClick={() => {
                  setActionSelectOpen(false);
                  setActionStep1Choice(undefined);
                  setSelectedAction(undefined);
                  setReinvoiceTargetSearch("");
                }}
              >
                Cancel
              </Button>
            </Space>
          )
        }
      >
        {!actionDetailsOpen ? (
          <Space direction="vertical" size={16} style={{ width: "100%" }}>
            <Card variant="borderless" style={{ background: "#fbfcf8", border: "1px solid #ecf0e7" }}>
              <Space direction="vertical" size={6}>
                <Typography.Text type="secondary">Lot</Typography.Text>
                <Typography.Text strong>{manageLot ? `${manageLot.mark} / ${manageLot.invoice_number}` : "No lot selected"}</Typography.Text>
              </Space>
            </Card>
            <div>
              <Typography.Text strong>Select Action</Typography.Text>
              <Select
                {...modalSelectProps}
                placeholder="Choose action"
                value={actionStep1Choice}
                options={actionOptions}
                onChange={(value) => {
                  const nextAction = value as ActionName;
                  setActionStep1Choice(nextAction);
                  openInTransitManageStep2(nextAction);
                }}
                style={{ width: "100%", marginTop: 8 }}
              />
            </div>
          </Space>
        ) : selectedAction ? (
          <div onKeyDown={(event) => void handleEnterToSubmit(event, submitInTransitManageLotAction)}>
            <Space direction="vertical" size={16} style={{ width: "100%" }}>
              <Card variant="borderless" style={{ background: "#fbfcf8", border: "1px solid #ecf0e7" }}>
                <Space direction="vertical" size={6}>
                  <Typography.Text type="secondary">Action</Typography.Text>
                  <Typography.Text strong>{formatActionName(selectedAction)}</Typography.Text>
                  <Typography.Text type="secondary">
                    Lot: {manageLot ? `${manageLot.mark} / ${manageLot.invoice_number}` : "-"}
                  </Typography.Text>
                </Space>
              </Card>
              <ManageLotHistoryContext
                selectedAction={selectedAction}
                lot={manageLot}
                actions={manageLotActionsData?.rows ?? []}
                loading={manageLotActionsLoading}
              />
              <Row gutter={[12, 12]}>
                {actionFieldConfig[selectedAction].map((field) => (
                  <Col
                    xs={24}
                    md={field.key === "remarks" || field.key === "parties" || field.key === "buyers" || field.key === "reinvoiced_to_lot_id" ? 24 : 12}
                    key={`in-transit-action-field-${field.key}`}
                  >
                    <Space direction="vertical" size={6} style={{ width: "100%" }}>
                      <Typography.Text strong>{field.label}{field.required ? " *" : ""}</Typography.Text>
                      {renderActionField(field, actionData, setActionData, selectedAction, "single")}
                    </Space>
                  </Col>
                ))}
              </Row>
            </Space>
          </div>
        ) : null}
      </Drawer>

      <Drawer
        title={bulkActionDetailsOpen ? `Manage Lots • Step 2 of 2 (${selectedLotIds.length} lots)` : `Manage Lots • Step 1 of 2 (${selectedLotIds.length} lots)`}
        open={bulkActionSelectOpen || bulkActionDetailsOpen}
        width={620}
        onClose={() => {
          setBulkActionSelectOpen(false);
          setBulkActionDetailsOpen(false);
          setBulkActionStep1Choice(undefined);
          setBulkSelectedAction(undefined);
          setBulkActionData({});
        }}
        placement="right"
        footer={
          bulkActionDetailsOpen ? (
            <Space style={{ width: "100%", justifyContent: "space-between" }}>
              <Button
                onClick={() => {
                  setBulkActionDetailsOpen(false);
                  setBulkActionSelectOpen(true);
                  setBulkActionStep1Choice(undefined);
                  setBulkSelectedAction(undefined);
                }}
              >
                Back
              </Button>
              <Button type="primary" loading={bulkManageMutation.isPending} onClick={submitBulkManageLotAction}>
                Save Action
              </Button>
            </Space>
          ) : (
            <Space style={{ width: "100%", justifyContent: "flex-end" }}>
              <Button
                onClick={() => {
                  setBulkActionSelectOpen(false);
                  setBulkActionStep1Choice(undefined);
                  setBulkSelectedAction(undefined);
                }}
              >
                Cancel
              </Button>
            </Space>
          )
        }
      >
        {!bulkActionDetailsOpen ? (
          <Space direction="vertical" size={16} style={{ width: "100%" }}>
            <Card variant="borderless" style={{ background: "#fbfcf8", border: "1px solid #ecf0e7" }}>
              <Space direction="vertical" size={6}>
                <Typography.Text type="secondary">Selected Lots</Typography.Text>
                <Typography.Text strong>{selectedLotIds.length} lots</Typography.Text>
                <Typography.Text type="secondary">
                  {bulkLaneAlignment.isAligned ? `Shared status: ${bulkLaneAlignment.status ?? "-"}` : "Conflict"}
                </Typography.Text>
              </Space>
            </Card>
            <div>
              <Typography.Text strong>Select Action</Typography.Text>
              <Select
                {...modalSelectProps}
                placeholder="Choose action"
                value={bulkActionStep1Choice}
                options={bulkActionOptions}
                onChange={(value) => {
                  const nextAction = value as ActionName;
                  setBulkActionStep1Choice(nextAction);
                  openBulkInTransitManageStep2(nextAction);
                }}
                style={{ width: "100%", marginTop: 8 }}
              />
            </div>
          </Space>
        ) : bulkSelectedAction ? (
          <div onKeyDown={(event) => void handleEnterToSubmit(event, submitBulkManageLotAction)}>
            <Space direction="vertical" size={16} style={{ width: "100%" }}>
              <Card variant="borderless" style={{ background: "#fbfcf8", border: "1px solid #ecf0e7" }}>
                <Space direction="vertical" size={6}>
                  <Typography.Text type="secondary">Action</Typography.Text>
                  <Typography.Text strong>{formatActionName(bulkSelectedAction)}</Typography.Text>
                  <Typography.Text type="secondary">{selectedLotIds.length} lots</Typography.Text>
                </Space>
              </Card>
              <Row gutter={[12, 12]}>
                {actionFieldConfig[bulkSelectedAction].map((field) => (
                  <Col
                    xs={24}
                    md={field.key === "remarks" || field.key === "parties" || field.key === "buyers" ? 24 : 12}
                    key={`in-transit-bulk-field-${field.key}`}
                  >
                    <Space direction="vertical" size={6} style={{ width: "100%" }}>
                      <Typography.Text strong>{field.label}{field.required ? " *" : ""}</Typography.Text>
                      {renderActionField(field, bulkActionData, setBulkActionData, bulkSelectedAction, "bulk")}
                    </Space>
                  </Col>
                ))}
              </Row>
            </Space>
          </div>
        ) : null}
      </Drawer>
    </AppShell>
  );
}
