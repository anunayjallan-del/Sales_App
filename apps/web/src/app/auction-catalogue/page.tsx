"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CloseOutlined } from "@ant-design/icons";
import { App, Button, Card, Checkbox, Col, Drawer, Empty, Input, InputNumber, Modal, Row, Select, Space, Spin, Table, Tag, Tooltip, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { AppShell } from "@/components/app-shell";
import { fetchJson } from "@/lib/fetcher";
import { handleEnterToSubmit } from "@/lib/keyboard-submit";

type CatalogueRow = {
  id: string;
  mark: string;
  invoice_number: string;
  grade: string;
  bags: number;
  net_weight_kg: number;
  date_created: string;
  auction_centre: string;
  sale_no: string;
  status: string;
  active_statuses?: string[];
  auction_lane_status?: string | null;
  private_lane_status?: string | null;
  is_sampled?: boolean;
  allowed_actions?: string[];
  reinvoiced_from_lot_id?: string | null;
  negotiating_buyers?: string[];
  last_negotiated_on?: string | null;
};

type ReinvoiceTargetRow = {
  id: string;
  mark: string;
  invoice_number: string;
  grade: string;
};

type MarkGroup = {
  mark: string;
  rows: CatalogueRow[];
  totalBags: number;
  totalQuantity: number;
};

type SaleGroup = {
  saleNo: string;
  markGroups: MarkGroup[];
};

type CentreGroup = {
  centre: string;
  saleGroups: SaleGroup[];
};

type ActionName =
  | "SAMPLING"
  | "DISPATCH_TO_AUCTION"
  | "AUCTION_DISPATCHED"
  | "HOLD_AWR"
  | "AWR_RECEIVED"
  | "PRINT"
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
    { key: "remarks", label: "Remarks", type: "text" }
  ],
  PRINT: [
    { key: "print_date", label: "Print date", type: "date", required: true },
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
  "AWR_RECEIVED",
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

const laneStatusSet = new Set<string>([
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
  "WITHDRAW",
  "NEGOTIATING",
  "SOLD_PENDING_DISPATCH",
  "SOLD"
]);

const modalSelectProps = {
  style: { width: "100%" as const },
  listHeight: 420,
  popupMatchSelectWidth: false as const,
  styles: { popup: { root: { minWidth: 420 } } }
};

function sanitizeAllowedActions(actions: string[] | undefined): ActionName[] {
  if (!actions?.length) {
    return Object.keys(actionFieldConfig) as ActionName[];
  }
  return actions
    .map((action) => String(action) as ActionName)
    .filter((action) => actionNameSet.has(action));
}

function resolveConflictPromptType(auctionStatus: string | null | undefined): ConflictPromptType | null {
  if (!auctionStatus) return null;
  if (auctionStatusesEarlyStage.has(auctionStatus)) return "EARLY_STAGE_GUIDANCE";
  if (auctionStatusesMiddleStage1.has(auctionStatus)) return "MIDDLE_STAGE_1_GUIDANCE";
  if (auctionStatusesMiddleStage2.has(auctionStatus)) return "MIDDLE_STAGE_2_GUIDANCE";
  if (auctionStatusesLaterStage.has(auctionStatus)) return "LATER_STAGE_GUIDANCE";
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
  if (!auctionStatus || !auctionActiveForPrivateConflict.has(auctionStatus)) return null;
  const promptType = resolveConflictPromptType(auctionStatus);
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

function getNonLaneStatuses(row: CatalogueRow): string[] {
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

function negotiatingTooltipText(buyers: string[] | undefined, negotiatedOn: string | null | undefined): string | null {
  if (!buyers?.length) return null;
  const buyersText = buyers.join(", ");
  if (!negotiatedOn) return `Negotiating with: ${buyersText}`;
  return `Negotiating with: ${buyersText} (as of ${negotiatedOn})`;
}

function formatPackingDate(value: string): string {
  if (!value) return "-";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split("-");
    return `${d}-${m}-${String(y).slice(-2)}`;
  }
  return value;
}

export default function AuctionCataloguePage() {
  const queryClient = useQueryClient();
  const { message } = App.useApp();

  const [selectedLotIds, setSelectedLotIds] = useState<string[]>([]);
  const [bulkActionSelectOpen, setBulkActionSelectOpen] = useState(false);
  const [bulkActionDetailsOpen, setBulkActionDetailsOpen] = useState(false);
  const [bulkActionStep1Choice, setBulkActionStep1Choice] = useState<ActionName | undefined>(undefined);
  const [bulkSelectedAction, setBulkSelectedAction] = useState<ActionName>("SAMPLING");
  const [bulkActionData, setBulkActionData] = useState<Record<string, unknown>>({});
  const [bulkPartySearch, setBulkPartySearch] = useState("");
  const [reinvoiceTargetSearch, setReinvoiceTargetSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["auction-catalogue"],
    queryFn: () => fetchJson<{ rows: CatalogueRow[] }>("/api/auction-catalogue")
  });

  const { data: partyOptions } = useQuery({
    queryKey: ["party-options-auction-catalogue"],
    queryFn: () => fetchJson<{ buyers: string[]; brokers: string[] }>("/api/parties/options")
  });

  const { data: reinvoiceTargetsData, isFetching: reinvoiceTargetsLoading } = useQuery({
    queryKey: ["reinvoice-target-options-auction-catalogue", reinvoiceTargetSearch],
    queryFn: () =>
      fetchJson<{ rows: ReinvoiceTargetRow[] }>(
        `/api/lots/reinvoice-targets?search=${encodeURIComponent(reinvoiceTargetSearch)}&limit=120`
      ),
    enabled: bulkActionDetailsOpen && bulkSelectedAction === "REINVOICED"
  });

  const rows = useMemo(() => data?.rows ?? [], [data?.rows]);

  const grouped = useMemo<CentreGroup[]>(() => {
    const centreMap = new Map<string, Map<string, Map<string, CatalogueRow[]>>>();
    for (const row of rows) {
      const centre = row.auction_centre || "-";
      const saleNo = row.sale_no || "-";
      const mark = row.mark || "-";
      const saleMap = centreMap.get(centre) ?? new Map<string, Map<string, CatalogueRow[]>>();
      const markMap = saleMap.get(saleNo) ?? new Map<string, CatalogueRow[]>();
      const lots = markMap.get(mark) ?? [];
      lots.push(row);
      markMap.set(mark, lots);
      saleMap.set(saleNo, markMap);
      centreMap.set(centre, saleMap);
    }

    return Array.from(centreMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([centre, saleMap]) => ({
        centre,
        saleGroups: Array.from(saleMap.entries())
          .sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true, sensitivity: "base" }))
          .map(([saleNo, markMap]) => ({
            saleNo,
            markGroups: Array.from(markMap.entries())
              .sort((a, b) => a[0].localeCompare(b[0]))
              .map(([mark, groupedRows]) => ({
                mark,
                rows: [...groupedRows].sort((a, b) => a.invoice_number.localeCompare(b.invoice_number)),
                totalBags: groupedRows.reduce((sum, lot) => sum + Number(lot.bags ?? 0), 0),
                totalQuantity: groupedRows.reduce((sum, lot) => sum + Number(lot.net_weight_kg ?? 0), 0)
              }))
          }))
      }));
  }, [rows]);

  const selectedRows = useMemo(() => rows.filter((row) => selectedLotIds.includes(row.id)), [rows, selectedLotIds]);
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
        new Set([...(partyOptions?.buyers ?? []), ...(partyOptions?.brokers ?? [])].map((n) => String(n || "").trim()).filter(Boolean))
      )
        .sort((a, b) => a.localeCompare(b))
        .map((name) => ({ label: name, value: name })),
    [partyOptions?.buyers, partyOptions?.brokers]
  );

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

  const warehouseSelectOptions = useMemo(
    () => WAREHOUSE_OPTIONS.map((name) => ({ label: name, value: name })),
    []
  );

  const auctionCentreSelectOptions = useMemo(
    () => AUCTION_CENTRE_OPTIONS.map((name) => ({ label: name, value: name })),
    []
  );

  const reinvoiceTargetOptions = useMemo(
    () =>
      (reinvoiceTargetsData?.rows ?? [])
        .filter((row) => !selectedLotIds.includes(row.id))
        .map((row) => ({
          label: `${row.mark} / ${row.invoice_number} (${row.grade})`,
          value: row.id
        })),
    [reinvoiceTargetsData?.rows, selectedLotIds]
  );

  const bulkManageMutation = useMutation({
    mutationFn: async (payload: { lots: CatalogueRow[]; action: ActionName; data: Record<string, unknown> }) =>
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
      setBulkActionData({});
      setSelectedLotIds([]);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["auction-catalogue"] }),
        queryClient.invalidateQueries({ queryKey: ["lots"] }),
        queryClient.invalidateQueries({ queryKey: ["dispatch-pending-lots"] })
      ]);
    },
    onError: (error: Error) => {
      message.error(error.message || "Failed to execute action");
    }
  });

  const submitBulkManageLotAction = async () => {
    if (selectedLotIds.length < 2 || bulkManageMutation.isPending) return;
    if (!bulkLaneAlignment.isAligned) {
      message.error("Manage Lots is allowed only when selected lots share one lane status or one non-lane status.");
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
        Modal.confirm({
          title: "Warning!",
          content: (
            <Space direction="vertical" size={6}>
              <Typography.Text>
                {conflicts.length} selected lot(s) need confirmation before continuing.
              </Typography.Text>
              {conflictPromptOrder
                .filter((promptType) => (countsByPrompt.get(promptType) ?? 0) > 0)
                .map((promptType) => (
                  <Typography.Text key={`catalogue-bulk-warning-${promptType}`}>
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

  const openBulkManageStep2 = (action: ActionName) => {
    if (!bulkLaneAlignment.isAligned) return;
    if (!bulkActionOptions.some((option) => option.value === action)) return;
    setBulkSelectedAction(action);
    setBulkActionStep1Choice(undefined);
    setBulkActionData(buildInitialActionData(action));
    setBulkPartySearch("");
    setReinvoiceTargetSearch("");
    setBulkActionSelectOpen(false);
    setBulkActionDetailsOpen(true);
  };

  const toggleSelectedLot = (lotId: string) => {
    setSelectedLotIds((prev) => (prev.includes(lotId) ? prev.filter((id) => id !== lotId) : [...prev, lotId]));
  };

  const columns: ColumnsType<CatalogueRow> = [
    { title: "Lot No.", dataIndex: "invoice_number", key: "invoice_number", width: 140 },
    { title: "Grade", dataIndex: "grade", key: "grade", width: 120 },
    { title: "Bags", dataIndex: "bags", key: "bags", width: 90 },
    {
      title: "Quantity",
      dataIndex: "net_weight_kg",
      key: "net_weight_kg",
      width: 120,
      render: (value: number) => `${Number(value ?? 0).toFixed(3)} kgs`
    },
    {
      title: "Packing Date",
      dataIndex: "date_created",
      key: "date_created",
      width: 130,
      render: (value: string) => formatPackingDate(value)
    },
    {
      title: "Status",
      key: "status",
      width: 220,
      render: (_, row) => {
        const chips = getLaneStatusChips(row.auction_lane_status, row.private_lane_status, row.active_statuses);
        const negotiatingTooltip = negotiatingTooltipText(row.negotiating_buyers, row.last_negotiated_on);
        return (
          <Space size={[4, 4]} wrap>
            {chips.map((chip) => {
              const isNegotiatingChip =
                chip.color === "purple" &&
                row.private_lane_status === "NEGOTIATING" &&
                chip.label === "NEGOTIATING" &&
                Boolean(negotiatingTooltip);
              const tag = (
                <Tag key={`${row.id}-${chip.color}-${chip.label}`} color={chip.color}>
                  {chip.label}
                </Tag>
              );
              return isNegotiatingChip ? (
                <Tooltip key={`${row.id}-${chip.color}-${chip.label}-tooltip`} title={negotiatingTooltip}>
                  {tag}
                </Tooltip>
              ) : (
                tag
              );
            })}
            {row.is_sampled ? <Tag color="cyan">SAMPLED</Tag> : null}
          </Space>
        );
      }
    },
    {
      title: "Action",
      key: "action",
      width: 280,
      render: (_, row) => (
        <Space size={8}>
          <Link href={`/lots/${row.id}`}>
            <Button size="small">View</Button>
          </Link>
        </Space>
      )
    }
  ];

  return (
    <AppShell title="Auction Catalogue">
      {isLoading ? (
        <Card>
          <Spin />
        </Card>
      ) : grouped.length === 0 ? (
        <Card>
          <Empty description="No catalogued lots found." />
        </Card>
      ) : (
        <Space direction="vertical" size={16} style={{ width: "100%" }}>
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
          {grouped.map((centreGroup) => (
            <Card key={centreGroup.centre}>
              <Typography.Title level={5} style={{ marginTop: 0 }}>
                Auction Centre: {centreGroup.centre}
              </Typography.Title>
              <Space direction="vertical" size={16} style={{ width: "100%" }}>
                {centreGroup.saleGroups.map((saleGroup) => (
                  <Card key={`${centreGroup.centre}-${saleGroup.saleNo}`} variant="borderless" style={{ background: "#fafafa" }}>
                    <Typography.Title level={5} style={{ marginTop: 0, marginBottom: 12 }}>
                      Sale No.: {saleGroup.saleNo}
                    </Typography.Title>
                    <Space direction="vertical" size={12} style={{ width: "100%" }}>
                      {saleGroup.markGroups.map((markGroup) => (
                        <Card key={`${centreGroup.centre}-${saleGroup.saleNo}-${markGroup.mark}`} size="small">
                          <Space align="baseline" style={{ marginBottom: 10 }}>
                            <Typography.Title level={5} style={{ margin: 0 }}>
                              Mark: {markGroup.mark}
                            </Typography.Title>
                            <Typography.Text type="secondary">
                              Bags: {markGroup.totalBags} | Quantity: {markGroup.totalQuantity.toFixed(3)} kgs
                            </Typography.Text>
                          </Space>
                          <Table<CatalogueRow>
                            rowKey="id"
                            columns={columns}
                            dataSource={markGroup.rows}
                            rowSelection={{
                              selectedRowKeys: markGroup.rows
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
                                if (target.closest("button, a, input, .ant-checkbox-wrapper, .ant-checkbox, .ant-select, .ant-input-number")) return;
                                toggleSelectedLot(record.id);
                              }
                            })}
                            rowClassName={() => "clickable-lot-row"}
                            pagination={false}
                            size="small"
                            scroll={{ x: 840 }}
                          />
                        </Card>
                      ))}
                    </Space>
                  </Card>
                ))}
              </Space>
            </Card>
          ))}
        </Space>
      )}

      <Drawer
        title={bulkActionDetailsOpen ? `Manage Lot • Step 2 of 2 (${selectedLotIds.length} lots)` : `Manage Lot • Step 1 of 2 (${selectedLotIds.length} lots)`}
        open={bulkActionSelectOpen || bulkActionDetailsOpen}
        width={620}
        onClose={() => {
          setBulkActionSelectOpen(false);
          setBulkActionDetailsOpen(false);
          setBulkActionStep1Choice(undefined);
          setBulkActionData({});
          setBulkPartySearch("");
          setReinvoiceTargetSearch("");
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
                  setBulkActionDetailsOpen(false);
                  setBulkActionStep1Choice(undefined);
                }}
              >
                Cancel
              </Button>
            </Space>
          )
        }
      >
        {!bulkActionDetailsOpen ? (
          <Space
            direction="vertical"
            style={{ width: "100%" }}
            size={12}
            onKeyDown={(event) =>
              void handleEnterToSubmit(event, async () => {
                if (!bulkActionStep1Choice) {
                  message.error("Select an action first.");
                  return;
                }
                openBulkManageStep2(bulkActionStep1Choice);
              })
            }
          >
            <Card size="small" style={{ background: "#fafafa" }}>
              <Space direction="vertical" size={2} style={{ width: "100%" }}>
                <Typography.Text type="secondary">Selected Lots</Typography.Text>
                <Typography.Text strong>{selectedLotIds.length} lots selected</Typography.Text>
              </Space>
            </Card>
            <Space direction="vertical" style={{ width: "100%" }} size={6}>
              <Typography.Text type="secondary">Choose an action</Typography.Text>
            </Space>
            <Select
              size="large"
              value={bulkActionStep1Choice}
              placeholder="Select an action"
              onChange={(value) => setBulkActionStep1Choice(value)}
              onSelect={(value) => openBulkManageStep2(value as ActionName)}
              options={bulkActionOptions}
              disabled={!bulkActionOptions.length}
              {...modalSelectProps}
            />
            {!bulkActionOptions.length ? <Typography.Text type="secondary">{bulkManageDisabledReason}</Typography.Text> : null}
          </Space>
        ) : (
          <Space direction="vertical" style={{ width: "100%" }} onKeyDown={(event) => void handleEnterToSubmit(event, submitBulkManageLotAction)}>
            <Card size="small" style={{ background: "#fafafa" }}>
              <Space direction="vertical" size={2} style={{ width: "100%" }}>
                <Typography.Text type="secondary">Action</Typography.Text>
                <Typography.Text strong>{formatActionName(bulkSelectedAction)}</Typography.Text>
                <Typography.Text type="secondary">{selectedLotIds.length} lots selected</Typography.Text>
              </Space>
            </Card>
            <Row gutter={[12, 12]}>
              {(actionFieldConfig[bulkSelectedAction] ?? []).map((field) => (
                <Col key={field.key} xs={24} md={field.type === "tags" || field.key === "remarks" ? 24 : 12}>
                  <Space direction="vertical" size={6} style={{ width: "100%" }}>
                    <Typography.Text type="secondary">
                      {field.label}
                      {field.required ? " *" : ""}
                    </Typography.Text>
                    {field.type === "text" ? (
                      field.key === "buyers" ? (
                        <Select
                          mode="multiple"
                          showSearch
                          optionFilterProp="label"
                          value={Array.isArray(bulkActionData[field.key]) ? (bulkActionData[field.key] as string[]) : []}
                          options={buyerSelectOptions}
                          onChange={(value) => setBulkActionData((prev) => ({ ...prev, [field.key]: value.map((item) => String(item)) }))}
                          {...modalSelectProps}
                        />
                      ) : (field.key === "buyer" || field.key === "buyer_name") ? (
                        <Select
                          showSearch
                          optionFilterProp="label"
                          value={String(bulkActionData[field.key] ?? "") || undefined}
                          options={buyerSelectOptions}
                          onChange={(value) => setBulkActionData((prev) => ({ ...prev, [field.key]: String(value) }))}
                          {...modalSelectProps}
                        />
                      ) : field.key === "broker" ? (
                        <Select
                          showSearch
                          optionFilterProp="label"
                          value={String(bulkActionData[field.key] ?? "") || undefined}
                          options={bulkSelectedAction === "DISPATCH_TO_AUCTION" ? dispatchBrokerSelectOptions : brokerSelectOptions}
                          onChange={(value) => setBulkActionData((prev) => applyDispatchMappings(prev, field.key, String(value)))}
                          {...modalSelectProps}
                        />
                      ) : field.key === "warehouse" ? (
                        <Select
                          value={String(bulkActionData[field.key] ?? "") || undefined}
                          options={warehouseSelectOptions}
                          onChange={(value) => setBulkActionData((prev) => applyDispatchMappings(prev, field.key, String(value)))}
                          {...modalSelectProps}
                        />
                      ) : field.key === "auction_centre" ? (
                        <Select
                          value={String(bulkActionData[field.key] ?? "") || undefined}
                          options={auctionCentreSelectOptions}
                          onChange={(value) => setBulkActionData((prev) => ({ ...prev, [field.key]: String(value) }))}
                          {...modalSelectProps}
                        />
                      ) : field.key === "reinvoiced_to_lot_id" ? (
                        <Select
                          showSearch
                          value={String(bulkActionData[field.key] ?? "") || undefined}
                          options={reinvoiceTargetOptions}
                          filterOption={false}
                          onSearch={(value) => setReinvoiceTargetSearch(String(value))}
                          notFoundContent={reinvoiceTargetsLoading ? "Loading..." : "No pending lots found"}
                          placeholder="Select target pending lot"
                          onChange={(value) => setBulkActionData((prev) => ({ ...prev, [field.key]: String(value) }))}
                          {...modalSelectProps}
                        />
                      ) : (
                        <Input
                          value={String(bulkActionData[field.key] ?? "")}
                          onChange={(e) => setBulkActionData((prev) => ({ ...prev, [field.key]: e.target.value }))}
                        />
                      )
                    ) : null}
                    {field.type === "date" ? (
                      <Input
                        type="date"
                        value={String(bulkActionData[field.key] ?? "")}
                        onChange={(e) => setBulkActionData((prev) => ({ ...prev, [field.key]: e.target.value }))}
                      />
                    ) : null}
                    {field.type === "number" ? (
                      <InputNumber
                        style={{ width: "100%" }}
                        value={typeof bulkActionData[field.key] === "number" ? (bulkActionData[field.key] as number) : undefined}
                        onChange={(value) => setBulkActionData((prev) => ({ ...prev, [field.key]: value ?? null }))}
                      />
                    ) : null}
                    {field.type === "tags" ? (
                      field.key === "parties" ? (
                        <Space direction="vertical" style={{ width: "100%" }} size={8}>
                          <Input
                            placeholder="Search buyer/broker"
                            data-enter-submit="ignore"
                            value={bulkPartySearch}
                            onChange={(e) => setBulkPartySearch(e.target.value)}
                          />
                          <div style={{ maxHeight: 220, overflowY: "auto", border: "1px solid #f0f0f0", borderRadius: 8, padding: 8 }}>
                            <Checkbox.Group
                              style={{ width: "100%" }}
                              value={Array.isArray(bulkActionData[field.key]) ? (bulkActionData[field.key] as string[]) : []}
                              options={filteredBulkSamplingPartyOptions}
                              onChange={(values) =>
                                setBulkActionData((prev) => ({ ...prev, [field.key]: values.map((value) => String(value)) }))
                              }
                            />
                          </div>
                        </Space>
                      ) : (
                        <Select
                          mode="tags"
                          value={Array.isArray(bulkActionData[field.key]) ? (bulkActionData[field.key] as string[]) : []}
                          onChange={(value) => setBulkActionData((prev) => ({ ...prev, [field.key]: value }))}
                          showSearch
                          {...modalSelectProps}
                        />
                      )
                    ) : null}
                  </Space>
                </Col>
              ))}
            </Row>
          </Space>
        )}
      </Drawer>
    </AppShell>
  );
}
