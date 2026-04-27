"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { ColumnsType } from "antd/es/table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckOutlined, CloseOutlined, FilterOutlined, ReloadOutlined } from "@ant-design/icons";
import { App, Button, Card, Checkbox, Col, Divider, Drawer, Dropdown, Input, InputNumber, List, Modal, Popover, Row, Select, Space, Table, Tag, Tooltip, Typography } from "antd";
import { fetchJson } from "@/lib/fetcher";
import { handleEnterToSubmit } from "@/lib/keyboard-submit";
import { ManageLotHistoryContext } from "@/components/manage-lot-history-context";

type LotRow = {
  id: string;
  factory: string | null;
  mark: string;
  invoice_number: string;
  grade: string;
  bags: number;
  net_weight_kg: number;
  date_created: string;
  updated_at?: string;
  is_cancelled: boolean;
  lifecycle_status?: string;
  active_statuses?: string[];
  warnings?: string[];
  auction_lane_status?: string | null;
  private_lane_status?: string | null;
  allowed_actions?: string[];
  auction_status_badge?: string | null;
  private_status_badge?: string | null;
  master_status?: string;
  is_sampled?: boolean;
  last_sampled_on?: string | null;
  recent_sampling_parties?: string[];
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

type SortOptionValue =
  | "LOT_NO_ASC"
  | "LOT_NO_DESC"
  | "PACKING_DATE_ASC"
  | "PACKING_DATE_DESC"
  | "QUANTITY_ASC"
  | "QUANTITY_DESC";

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
const actionsRequiringExpectedLotUpdatedAt = new Set<ActionName>(["SAMPLING", "NEGOTIATING"]);
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

export function actionRequiresExpectedLotUpdatedAt(action: ActionName): boolean {
  return actionsRequiringExpectedLotUpdatedAt.has(action);
}

export function resolveExpectedLotUpdatedAt(action: ActionName, updatedAt: string | null | undefined): string {
  if (!actionRequiresExpectedLotUpdatedAt(action)) return "";
  return String(updatedAt ?? "").trim();
}

type BuildLotActionRequestBodyInput = {
  action: ActionName;
  data: Record<string, unknown>;
  expectedLotUpdatedAt?: string;
  conflictAcknowledged?: boolean;
  conflictPromptType?: ConflictPromptType;
  conflictAcknowledgedAt?: string;
};

export function buildLotActionRequestBody(input: BuildLotActionRequestBodyInput): Record<string, unknown> {
  const expectedLotUpdatedAt = resolveExpectedLotUpdatedAt(input.action, input.expectedLotUpdatedAt);
  return {
    action: input.action,
    data: input.data,
    expected_lot_updated_at: expectedLotUpdatedAt || undefined,
    conflict_acknowledged: input.conflictAcknowledged,
    conflict_prompt_type: input.conflictPromptType,
    conflict_acknowledged_at: input.conflictAcknowledgedAt
  };
}
const MARK_FILTER_SEQUENCE = [
  { key: "FURKATING", label: "Furkating" },
  { key: "ABHOYJAN", label: "Abhoyjan" },
  { key: "ABHOYBARII", label: "Abhoybarii" },
  { key: "FURKATING SELECT", label: "Furkating Select" },
  { key: "ALL MY TEA", label: "All My Tea" }
] as const;

function sanitizeAllowedActions(actions: string[] | undefined): ActionName[] {
  if (!actions?.length) {
    return Object.keys(actionFieldConfig) as ActionName[];
  }
  return actions
    .map((action) => String(action) as ActionName)
    .filter((action) => actionNameSet.has(action));
}

function ensureSamplingForNonTerminalLot(actions: ActionName[], row: LotRow | null): ActionName[] {
  if (!row) return actions;
  const statuses = row.active_statuses ?? [];
  if (statuses.includes("CANCELLED") || statuses.includes("CLOSED")) return actions;
  if (actions.includes("SAMPLING")) return actions;
  return ["SAMPLING", ...actions];
}

function normalizeAuctionStatusForConflict(auctionStatus: string | null | undefined): string | null {
  if (!auctionStatus) return null;
  return auctionStatus === "AWR_RECEIVED" ? "CATALOGUED" : auctionStatus;
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

function normalizeLotSearchInput(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 7);
}

function normalizeMarkKey(value: string): string {
  return String(value ?? "").trim().toUpperCase().replace(/\s+/g, " ");
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
  if (status === "SAMPLING_SENT") return "SAMPLED";
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

function getNonLaneStatuses(row: LotRow): string[] {
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

const modalSelectProps = {
  style: { width: "100%" as const },
  listHeight: 420,
  popupMatchSelectWidth: false as const,
  styles: { popup: { root: { minWidth: 420 } } }
};

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function buildInitialActionData(action: ActionName): Record<string, unknown> {
  const fields = actionFieldConfig[action] ?? [];
  const initial: Record<string, unknown> = {};
  for (const field of fields) {
    if (field.type === "date") {
      initial[field.key] = todayIsoDate();
    }
  }
  return initial;
}

function applyDispatchMappings(
  current: Record<string, unknown>,
  key: string,
  value: string
): Record<string, unknown> {
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

function uniqueNameOptions(names: string[]): Array<{ label: string; value: string }> {
  return Array.from(new Set(names.map((name) => String(name).trim()).filter(Boolean)))
    .sort((a, b) => a.localeCompare(b))
    .map((name) => ({ label: name, value: name }));
}

function tryOpenDatePicker(input: HTMLInputElement) {
  const pickerInput = input as HTMLInputElement & { showPicker?: () => void };
  if (!pickerInput.showPicker) return;
  try {
    pickerInput.showPicker();
  } catch {
    // Some browsers require stricter gesture context; fallback is native date input behavior.
  }
}

function parsePackingDate(value: string): Date | null {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  if (/^\d{2}-\d{2}-\d{2}$/.test(value)) {
    const [d, m, yy] = value.split("-").map(Number);
    const y = yy >= 70 ? 1900 + yy : 2000 + yy;
    return new Date(y, m - 1, d);
  }
  if (/^\d{2}-\d{2}-\d{4}$/.test(value)) {
    const [d, m, y] = value.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatPackingDate(value: string): string {
  const dt = parsePackingDate(value);
  if (!dt) return "-";
  const dd = String(dt.getDate()).padStart(2, "0");
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const yy = String(dt.getFullYear()).slice(-2);
  return `${dd}-${mm}-${yy}`;
}

function HeaderFilter({
  label,
  active,
  content,
  sortControl
}: {
  label: string;
  active: boolean;
  content: React.ReactNode;
  sortControl?: React.ReactNode;
}) {
  return (
    <Space size={6}>
      <span>{label}</span>
      {sortControl}
      <Popover trigger="click" placement="bottomLeft" content={content}>
        <Button
          size="small"
          type={active ? "primary" : "text"}
          icon={<FilterOutlined />}
          onClick={(e) => e.stopPropagation()}
        />
      </Popover>
    </Space>
  );
}

function HeaderMenuFilter({
  label,
  active,
  items,
  onClick
}: {
  label: string;
  active: boolean;
  items: Array<{ key: string; label: React.ReactNode }>;
  onClick: (key: string) => void;
}) {
  return (
    <Space size={6}>
      <span>{label}</span>
      <Dropdown
        trigger={["click"]}
        menu={{
          items,
          onClick: ({ key }) => onClick(String(key))
        }}
      >
        <Button size="small" type={active ? "primary" : "text"} icon={<FilterOutlined />} onClick={(e) => e.stopPropagation()} />
      </Dropdown>
    </Space>
  );
}

export function LotsClient() {
  const searchParams = useSearchParams();
  const searchFromQuery = useMemo(() => normalizeLotSearchInput(searchParams.get("search") ?? ""), [searchParams]);
  const [search, setSearch] = useState(searchFromQuery);
  const [markFilters, setMarkFilters] = useState<string[]>([]);
  const [factoryFilter, setFactoryFilter] = useState<string | null>(null);
  const [gradeFilter, setGradeFilter] = useState("");
  const [bagsMin, setBagsMin] = useState<number | null>(null);
  const [bagsMax, setBagsMax] = useState<number | null>(null);
  const [weightMin, setWeightMin] = useState<number | null>(null);
  const [weightMax, setWeightMax] = useState<number | null>(null);
  const [packingDateFrom, setPackingDateFrom] = useState("");
  const [packingDateTo, setPackingDateTo] = useState("");
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<"LOT_NO" | "PACKING_DATE" | "QUANTITY">("LOT_NO");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string[]>([]);
  const [actionSelectModalOpen, setActionSelectModalOpen] = useState(false);
  const [actionDetailsModalOpen, setActionDetailsModalOpen] = useState(false);
  const [selectedAction, setSelectedAction] = useState<ActionName>("SAMPLING");
  const [actionStep1Choice, setActionStep1Choice] = useState<ActionName | undefined>(undefined);
  const [actionData, setActionData] = useState<Record<string, unknown>>({});
  const [partySearch, setPartySearch] = useState("");
  const [bulkActionSelectOpen, setBulkActionSelectOpen] = useState(false);
  const [bulkActionDetailsOpen, setBulkActionDetailsOpen] = useState(false);
  const [bulkActionStep1Choice, setBulkActionStep1Choice] = useState<ActionName | undefined>(undefined);
  const [bulkSelectedAction, setBulkSelectedAction] = useState<ActionName>("SAMPLING");
  const [bulkActionData, setBulkActionData] = useState<Record<string, unknown>>({});
  const [bulkPartySearch, setBulkPartySearch] = useState("");
  const [reinvoiceTargetSearch, setReinvoiceTargetSearch] = useState("");
  const [samplingHistoryLotId, setSamplingHistoryLotId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const router = useRouter();
  const { message, modal } = App.useApp();

  const pageSize = 20;
  const selectedLotId = selected.length === 1 ? selected[0] : null;

  useEffect(() => {
    setSearch(searchFromQuery);
    setPage(1);
  }, [searchFromQuery]);

  const { data: filterOptions } = useQuery({
    queryKey: ["lot-filter-options"],
    queryFn: () => fetchJson<{ marks: string[]; factories: string[]; grades: string[] }>("/api/lots/filter-options")
  });
  const { data: partyOptions } = useQuery({
    queryKey: ["party-options"],
    queryFn: () => fetchJson<{ buyers: string[]; brokers: string[] }>("/api/parties/options")
  });
  const orderedMarkRows = useMemo(() => {
    const availableMarksByKey = new Map<string, string>();
    for (const mark of filterOptions?.marks ?? []) {
      const key = normalizeMarkKey(mark);
      if (!availableMarksByKey.has(key)) {
        availableMarksByKey.set(key, mark);
      }
    }
    const ordered = MARK_FILTER_SEQUENCE.map((item) => ({
      value: availableMarksByKey.get(item.key) ?? item.key,
      label: item.label
    }));
    return [ordered.slice(0, 3), ordered.slice(3)];
  }, [filterOptions?.marks]);

  const lotsQuery = useMemo(() => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));
    if (search.trim()) params.set("search", search.trim());
    if (markFilters.length) params.set("marks", markFilters.join(","));
    if (factoryFilter) params.set("factory", factoryFilter);
    if (gradeFilter.trim()) params.set("grade", gradeFilter.trim());
    if (bagsMin !== null) params.set("bagsMin", String(bagsMin));
    if (bagsMax !== null) params.set("bagsMax", String(bagsMax));
    if (weightMin !== null) params.set("weightMin", String(weightMin));
    if (weightMax !== null) params.set("weightMax", String(weightMax));
    if (packingDateFrom) params.set("packingDateFrom", packingDateFrom);
    if (packingDateTo) params.set("packingDateTo", packingDateTo);
    const sampledSelected = statusFilter.includes("SAMPLED");
    const lifecycleStatuses = statusFilter.filter((status) => status !== "SAMPLED");
    if (lifecycleStatuses.length) params.set("status", lifecycleStatuses.join(","));
    if (sampledSelected) params.set("sampled", "true");
    params.set("sortBy", sortBy);
    params.set("sortDir", sortDirection);
    return params.toString();
  }, [
    bagsMax,
    bagsMin,
    factoryFilter,
    gradeFilter,
    markFilters,
    packingDateFrom,
    packingDateTo,
    page,
    pageSize,
    search,
    statusFilter,
    sortBy,
    sortDirection,
    weightMax,
    weightMin
  ]);

  const { data, isLoading } = useQuery({
    queryKey: ["lots", lotsQuery],
    queryFn: () =>
      fetchJson<{ lots: LotRow[]; total: number; page: number; pageSize: number }>(
        `/api/lots?${lotsQuery}`
      )
  });
  const { data: samplingHistoryData, isLoading: samplingHistoryLoading } = useQuery({
    queryKey: ["lot-actions", samplingHistoryLotId],
    queryFn: () => fetchJson<{ rows: LotActionRow[] }>(`/api/lots/${samplingHistoryLotId}/actions`),
    enabled: Boolean(samplingHistoryLotId)
  });
  const { data: manageLotActionsData, isLoading: manageLotActionsLoading } = useQuery({
    queryKey: ["lot-actions-manage", selectedLotId],
    queryFn: () => fetchJson<{ rows: LotActionRow[] }>(`/api/lots/${selectedLotId}/actions`),
    enabled: Boolean(selectedLotId) && actionDetailsModalOpen
  });
  const { data: reinvoiceTargetsData, isFetching: reinvoiceTargetsLoading } = useQuery({
    queryKey: ["reinvoice-target-options", reinvoiceTargetSearch],
    queryFn: () =>
      fetchJson<{ rows: ReinvoiceTargetRow[] }>(
        `/api/lots/reinvoice-targets?search=${encodeURIComponent(reinvoiceTargetSearch)}&limit=120`
      ),
    enabled: actionDetailsModalOpen && selectedAction === "REINVOICED"
  });

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["lots"] });
  };

  const deleteLot = useMutation({
    mutationFn: (lotId: string) =>
      fetchJson(`/api/lots/${lotId}`, {
        method: "DELETE"
      }),
    onSuccess: async () => {
      message.success("Lot deleted");
      setSelected([]);
      await invalidate();
    }
  });

  const runAction = useMutation({
    mutationFn: (payload: {
      lotId: string;
      action: ActionName;
      data: Record<string, unknown>;
      expectedLotUpdatedAt?: string;
      conflictAcknowledged?: boolean;
      conflictPromptType?: ConflictPromptType;
      conflictAcknowledgedAt?: string;
    }) =>
      fetchJson<{ warnings?: string[] }>(`/api/lots/${payload.lotId}/actions`, {
        method: "POST",
        body: JSON.stringify(
          buildLotActionRequestBody({
            action: payload.action,
            data: payload.data,
            expectedLotUpdatedAt: payload.expectedLotUpdatedAt,
            conflictAcknowledged: payload.conflictAcknowledged,
            conflictPromptType: payload.conflictPromptType,
            conflictAcknowledgedAt: payload.conflictAcknowledgedAt
          })
        )
      }),
    onSuccess: async (response) => {
      message.success("Action executed");
      if (response?.warnings?.includes("DISPATCH_ADVICE_MISSING")) {
        message.warning("Dispatch advice not found for this lot. Please review.");
      }
      await invalidate();
      setActionDetailsModalOpen(false);
      setActionData({});
    }
  });
  const runBulkAction = useMutation({
    mutationFn: async (payload: { lots: LotRow[]; action: ActionName; data: Record<string, unknown> }) =>
      Promise.all(
        payload.lots.map((lot) => {
          const expectedLotUpdatedAt = resolveExpectedLotUpdatedAt(payload.action, lot.updated_at);
          if (actionRequiresExpectedLotUpdatedAt(payload.action) && !expectedLotUpdatedAt) {
            throw new Error(`Missing expected lot version for lot ${lot.invoice_number}. Refresh and retry.`);
          }
          const conflictMeta = getConflictAckMeta(payload.action, lot.auction_lane_status);
          return fetchJson(`/api/lots/${lot.id}/actions`, {
            method: "POST",
            body: JSON.stringify(
              buildLotActionRequestBody({
                action: payload.action,
                data: payload.data,
                expectedLotUpdatedAt: expectedLotUpdatedAt || undefined,
                conflictAcknowledged: conflictMeta ? true : undefined,
                conflictPromptType: conflictMeta?.promptType,
                conflictAcknowledgedAt: conflictMeta ? new Date().toISOString() : undefined
              })
            )
          });
        })
      ),
    onSuccess: async () => {
      message.success("Action executed");
      await invalidate();
      setBulkActionSelectOpen(false);
      setBulkActionDetailsOpen(false);
      setBulkActionStep1Choice(undefined);
      setBulkActionData({});
      setSelected([]);
    }
  });

  const rows = data?.lots ?? [];
  const totalLots = data?.total ?? 0;
  const selectedRows = rows.filter((row) => selected.includes(row.id));
  const hasBulkSelection = selected.length >= 2;
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
  const selectedLotRow = rows.find((row) => row.id === selectedLotId) ?? null;
  const samplingHistoryLot = rows.find((row) => row.id === samplingHistoryLotId) ?? null;

  const submitManageLotAction = async () => {
    if (!selectedLotId || runAction.isPending || !selectedLotRow) return;
    if (!selectedLotAllowedActions.includes(selectedAction)) {
      message.error("Selected action is not allowed for current lot status.");
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
    const expectedLotUpdatedAt = resolveExpectedLotUpdatedAt(selectedAction, selectedLotRow.updated_at);
    if (actionRequiresExpectedLotUpdatedAt(selectedAction) && !expectedLotUpdatedAt) {
      message.error(`Missing lot version for ${selectedAction.toLowerCase()} action. Refresh and retry.`);
      return;
    }
    const conflictMeta = getConflictAckMeta(selectedAction, selectedLotRow.auction_lane_status);
    if (conflictMeta) {
      const acknowledged = await new Promise<boolean>((resolve) => {
        modal.confirm({
          title: "Warning!",
          content: (
            <Space direction="vertical" size={6}>
              <Typography.Text>
                Lot: {selectedLotRow.mark} / {selectedLotRow.invoice_number}
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
      await runAction.mutateAsync({
        lotId: selectedLotId,
        action: selectedAction,
        data: actionData,
        expectedLotUpdatedAt: expectedLotUpdatedAt || undefined,
        conflictAcknowledged: true,
        conflictPromptType: conflictMeta.promptType,
        conflictAcknowledgedAt: new Date().toISOString()
      });
      return;
    }
    await runAction.mutateAsync({
      lotId: selectedLotId,
      action: selectedAction,
      data: actionData,
      expectedLotUpdatedAt: expectedLotUpdatedAt || undefined
    });
  };

  const submitBulkManageLotAction = async () => {
    if (runBulkAction.isPending || !selectedRows.length) return;
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
                  <Typography.Text key={`bulk-warning-${promptType}`}>
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
    await runBulkAction.mutateAsync({
      lots: selectedRows,
      action: bulkSelectedAction,
      data: bulkActionData
    });
  };
  const openManageLotStep2 = (action: ActionName) => {
    if (!selectedLotAllowedActions.includes(action)) return;
    setSelectedAction(action);
    setActionStep1Choice(undefined);
    setActionData(buildInitialActionData(action));
    setReinvoiceTargetSearch("");
    setActionSelectModalOpen(false);
    setActionDetailsModalOpen(true);
  };
  const openBulkManageLotStep2 = (action: ActionName) => {
    if (!bulkLaneAlignment.isAligned) return;
    if (!bulkActionOptions.some((option) => option.value === action)) return;
    setBulkSelectedAction(action);
    setBulkActionStep1Choice(undefined);
    setBulkActionData(buildInitialActionData(action));
    setBulkActionSelectOpen(false);
    setBulkActionDetailsOpen(true);
  };

  const samplingHistoryRows = useMemo(() => {
    const rows = samplingHistoryData?.rows ?? [];
    const byDate = new Map<string, Set<string>>();
    for (const row of rows) {
      if (row.action !== "SAMPLING") continue;
      const payload = row.payload ?? {};
      const samplingDateRaw = String((payload as Record<string, unknown>).sampling_date ?? "").trim();
      const performedDate = String(row.performed_at ?? "").slice(0, 10);
      const date = samplingDateRaw || performedDate || "-";
      const partiesRaw = (payload as Record<string, unknown>).parties;
      const parties = Array.isArray(partiesRaw)
        ? partiesRaw.map((party) => String(party ?? "").trim()).filter(Boolean)
        : [];
      if (!byDate.has(date)) byDate.set(date, new Set<string>());
      const dateParties = byDate.get(date)!;
      if (!parties.length) {
        dateParties.add("-");
      } else {
        for (const party of parties) dateParties.add(party);
      }
    }
    return Array.from(byDate.entries())
      .map(([date, parties]) => ({ date, parties: Array.from(parties).sort((a, b) => a.localeCompare(b)) }))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [samplingHistoryData?.rows]);
  const sampledPartyCount = useMemo(
    () =>
      new Set(
        samplingHistoryRows.flatMap((entry) => entry.parties).filter((party) => party && party !== "-")
      ).size,
    [samplingHistoryRows]
  );
  const sampledDateCount = samplingHistoryRows.length;
  const gradeItems = useMemo(
    () => [
      { key: "__ALL__", label: "All grades" },
      ...(filterOptions?.grades ?? []).map((grade) => ({ key: grade, label: grade }))
    ],
    [filterOptions?.grades]
  );

  const statusItems = useMemo(() => {
    const selected = new Set(statusFilter);
    const statuses = [
      { key: "SAMPLED", label: "SAMPLED" },
      { key: "PENDING", label: "PENDING" },
      { key: "PENDING_AUCTION_DISPATCH", label: "PENDING_AUCTION_DISPATCH" },
      { key: "IN_TRANSIT", label: "IN_TRANSIT" },
      { key: "AWR_PENDING", label: "AWR_PENDING" },
      { key: "CATALOGUED", label: "CATALOGUED" },
      { key: "RESERVE_SET", label: "RESERVE_SET" },
      { key: "SOLD_AUCTION", label: "SOLD_AUCTION" },
      { key: "OUT", label: "OUT" },
      { key: "HOLD", label: "HOLD" },
      { key: "REPRINT", label: "REPRINT" },
      { key: "WITHDRAW", label: "WITHDRAWN" },
      { key: "NEGOTIATING", label: "NEGOTIATING" },
      { key: "SOLD_PENDING_DISPATCH", label: "SOLD_PENDING_DISPATCH" },
      { key: "SOLD", label: "SOLD" },
      { key: "CANCELLED", label: "Cancelled" },
      { key: "CLOSED", label: "CLOSED" }
    ];
    return [
      {
        key: "__ALL__",
        label: "All statuses",
        icon: selected.size === 0 ? <CheckOutlined /> : undefined
      },
      ...statuses.map((item) => ({
        ...item,
        icon: selected.has(item.key) ? <CheckOutlined /> : undefined
      }))
    ];
  }, [statusFilter]);
  const selectedLotAllowedActions = useMemo(
    () => ensureSamplingForNonTerminalLot(sanitizeAllowedActions(selectedLotRow?.allowed_actions), selectedLotRow),
    [selectedLotRow]
  );
  const actionOptions = useMemo(
    () =>
      selectedLotAllowedActions.map((action) => ({
        label: formatActionName(action),
        value: action
      })),
    [selectedLotAllowedActions]
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
  const sortOptionValue: SortOptionValue = useMemo(() => {
    if (sortBy === "LOT_NO" && sortDirection === "asc") return "LOT_NO_ASC";
    if (sortBy === "LOT_NO" && sortDirection === "desc") return "LOT_NO_DESC";
    if (sortBy === "PACKING_DATE" && sortDirection === "asc") return "PACKING_DATE_ASC";
    if (sortBy === "PACKING_DATE" && sortDirection === "desc") return "PACKING_DATE_DESC";
    if (sortBy === "QUANTITY" && sortDirection === "asc") return "QUANTITY_ASC";
    return "QUANTITY_DESC";
  }, [sortBy, sortDirection]);
  const sortOptions: Array<{ value: SortOptionValue; label: string }> = useMemo(
    () => [
      { value: "LOT_NO_ASC", label: "Lot No. (Ascending)" },
      { value: "LOT_NO_DESC", label: "Lot No. (Descending)" },
      { value: "PACKING_DATE_ASC", label: "Packing Date (Oldest first)" },
      { value: "PACKING_DATE_DESC", label: "Packing Date (Newest first)" },
      { value: "QUANTITY_ASC", label: "Qty (Low to high)" },
      { value: "QUANTITY_DESC", label: "Qty (High to low)" }
    ],
    []
  );
  const applySortOption = (value: SortOptionValue) => {
    if (value === "LOT_NO_ASC") {
      setSortBy("LOT_NO");
      setSortDirection("asc");
    } else if (value === "LOT_NO_DESC") {
      setSortBy("LOT_NO");
      setSortDirection("desc");
    } else if (value === "PACKING_DATE_ASC") {
      setSortBy("PACKING_DATE");
      setSortDirection("asc");
    } else if (value === "PACKING_DATE_DESC") {
      setSortBy("PACKING_DATE");
      setSortDirection("desc");
    } else if (value === "QUANTITY_ASC") {
      setSortBy("QUANTITY");
      setSortDirection("asc");
    } else {
      setSortBy("QUANTITY");
      setSortDirection("desc");
    }
    setPage(1);
  };
  const samplingPartyOptions = useMemo(
    () => uniqueNameOptions([...(partyOptions?.buyers ?? []), ...(partyOptions?.brokers ?? [])]),
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
    () => uniqueNameOptions(partyOptions?.brokers ?? []),
    [partyOptions?.brokers]
  );
  const buyerSelectOptions = useMemo(
    () => uniqueNameOptions(partyOptions?.buyers ?? []),
    [partyOptions?.buyers]
  );
  const dispatchBrokerSelectOptions = useMemo(
    () =>
      brokerSelectOptions.filter((option) => DISPATCH_BROKER_OPTIONS.includes(String(option.value) as (typeof DISPATCH_BROKER_OPTIONS)[number])),
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
        .filter((row) => row.id !== selectedLotId)
        .map((row) => ({
          label: `${row.mark} / ${row.invoice_number} (${row.grade})`,
          value: row.id
        })),
    [reinvoiceTargetsData?.rows, selectedLotId]
  );

  const columns: ColumnsType<LotRow> = useMemo(
    () => [
      {
        title: "Factory",
        dataIndex: "factory",
        key: "factory",
        width: 130,
        render: (value: string | null) => <span style={{ whiteSpace: "nowrap" }}>{value || "-"}</span>
      },
      {
        title: "Mark",
        dataIndex: "mark",
        key: "mark",
        width: 160,
        render: (value: string) => <span style={{ whiteSpace: "nowrap" }}>{value}</span>
      },
      {
        title: (
          <HeaderFilter
            label="Lot No."
            active={Boolean(search.trim())}
            content={
              <Input
                size="small"
                allowClear
                placeholder="Search by Lot No."
                value={search}
                maxLength={7}
                onChange={(e) => {
                  const compact = normalizeLotSearchInput(e.target.value);
                  setSearch(compact);
                  setPage(1);
                }}
              />
            }
          />
        ),
        dataIndex: "invoice_number",
        key: "invoice_number",
        width: 130,
        render: (value: string) => <span style={{ whiteSpace: "nowrap" }}>{value}</span>
      },
      {
        dataIndex: "grade",
        key: "grade",
        width: 120,
        title: (
          <HeaderMenuFilter
            label="Grade"
            active={Boolean(gradeFilter.trim())}
            items={gradeItems}
            onClick={(key) => {
              setPage(1);
              setGradeFilter(key === "__ALL__" ? "" : key);
            }}
          />
        ),
        responsive: ["sm"]
      },
      {
        title: (
          <HeaderFilter
            label="Bags"
            active={bagsMin !== null || bagsMax !== null}
            content={
              <Space.Compact size="small">
                <InputNumber
                  size="small"
                  placeholder="Min"
                  value={bagsMin ?? undefined}
                  onChange={(v) => {
                    setPage(1);
                    setBagsMin(v ?? null);
                  }}
                  style={{ width: 90 }}
                />
                <InputNumber
                  size="small"
                  placeholder="Max"
                  value={bagsMax ?? undefined}
                  onChange={(v) => {
                    setPage(1);
                    setBagsMax(v ?? null);
                  }}
                  style={{ width: 90 }}
                />
              </Space.Compact>
            }
          />
        ),
        dataIndex: "bags",
        key: "bags",
        width: 85,
        responsive: ["md"]
      },
      {
        title: (
          <HeaderFilter
            label="Qty"
            active={weightMin !== null || weightMax !== null}
            content={
              <Space.Compact size="small">
                <InputNumber
                  size="small"
                  placeholder="Min"
                  value={weightMin ?? undefined}
                  onChange={(v) => {
                    setPage(1);
                    setWeightMin(v ?? null);
                  }}
                  style={{ width: 90 }}
                />
                <InputNumber
                  size="small"
                  placeholder="Max"
                  value={weightMax ?? undefined}
                  onChange={(v) => {
                    setPage(1);
                    setWeightMax(v ?? null);
                  }}
                  style={{ width: 90 }}
                />
              </Space.Compact>
            }
          />
        ),
        dataIndex: "net_weight_kg",
        key: "net_weight_kg",
        width: 84,
        responsive: ["md"]
      },
      {
        title: (
          <HeaderFilter
            label="Packing Date"
            active={Boolean(packingDateFrom || packingDateTo)}
            content={
              <Space direction="vertical" size={8}>
                <Input
                  size="small"
                  type="date"
                  value={packingDateFrom}
                  onChange={(e) => {
                    setPage(1);
                    setPackingDateFrom(e.target.value);
                  }}
                />
                <Input
                  size="small"
                  type="date"
                  value={packingDateTo}
                  onChange={(e) => {
                    setPage(1);
                    setPackingDateTo(e.target.value);
                  }}
                />
              </Space>
            }
          />
        ),
        dataIndex: "date_created",
        key: "date_created",
        width: 110,
        render: (value: string) => formatPackingDate(value),
        responsive: ["md"]
      },
      {
        title: (
          <HeaderMenuFilter
            label="Status"
            active={Boolean(statusFilter.length)}
            items={statusItems}
            onClick={(key) => {
              setPage(1);
              if (key === "__ALL__") {
                setStatusFilter([]);
                return;
              }
              setStatusFilter((prev) => (prev.includes(key) ? prev.filter((s) => s !== key) : [...prev, key]));
            }}
          />
        ),
        key: "lifecycle_status",
        render: (_, row) => {
          const sampled = Boolean(row.is_sampled);
          const allowedActions = sanitizeAllowedActions(row.allowed_actions);
          const laneChips = getLaneStatusChips(row.auction_lane_status, row.private_lane_status, row.active_statuses);
          const negotiatingTooltip = negotiatingTooltipText(row.negotiating_buyers, row.last_negotiated_on);
          return (
            <Space size={[4, 4]} wrap>
              {laneChips.map((chip) => {
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
              {sampled ? (
                <Tooltip title={row.last_sampled_on ? `Last sampled on ${row.last_sampled_on}` : "Sampled"}>
                  <Tag
                    color="cyan"
                    style={{ cursor: "pointer" }}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setSamplingHistoryLotId(row.id);
                    }}
                  >
                    SAMPLED
                  </Tag>
                </Tooltip>
              ) : null}
              {row.reinvoiced_from_lot_id && !row.auction_lane_status && !row.private_lane_status ? (
                <Tag color="gold">REINVOICED</Tag>
              ) : null}
              {allowedActions.length === 0 ? <Tag color="default">NO_MANAGE_ACTIONS</Tag> : null}
            </Space>
          );
        }
      },
      {
        title: "Action",
        key: "open",
        width: 280,
        render: (_, row) => {
          const allowedActions = sanitizeAllowedActions(row.allowed_actions);
          const firstAction = allowedActions[0];
          return (
          <Space size={8}>
            <Tooltip title={allowedActions.length ? undefined : "No actions available for current status"}>
              <Button
                size="small"
                disabled={!firstAction}
                onClick={() => {
                  if (!firstAction) return;
                  setSelected([row.id]);
                  setActionStep1Choice(undefined);
                  setActionSelectModalOpen(true);
                }}
              >
                Manage
              </Button>
            </Tooltip>
            <Link href={`/lots/${row.id}`}>
              <Button size="small">View</Button>
            </Link>
            <Button
              size="small"
              danger
              loading={deleteLot.isPending}
              onClick={() => {
                modal.confirm({
                  title: "Delete this lot?",
                  content:
                    "This will permanently delete the selected lot and linked records (auction/private/dispatch). This action cannot be undone.",
                  okText: "Delete",
                  okType: "danger",
                  cancelText: "Cancel",
                  onOk: async () => {
                    await deleteLot.mutateAsync(row.id);
                  }
                });
              }}
            >
              Delete
            </Button>
          </Space>
        );
        }
      }
    ],
    [
      bagsMax,
      bagsMin,
      deleteLot,
      gradeFilter,
      gradeItems,
      modal,
      packingDateFrom,
      packingDateTo,
      search,
      statusFilter,
      statusItems,
      weightMax,
      weightMin
    ]
  );

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <Card variant="borderless" styles={{ body: { padding: 16 } }}>
        <Row gutter={[16, 12]} align="stretch">
          <Col xs={24} lg={16}>
            <div
              style={{
                border: "1px solid #e7ece3",
                borderRadius: 12,
                background: "#fcfdfb",
                padding: 12,
                minHeight: 140
              }}
            >
              <Row gutter={[20, 8]} align="top">
                <Col xs={24} md={14}>
                  <Space direction="vertical" size={6} style={{ width: "100%" }}>
                    <Typography.Text type="secondary" style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.3 }}>
                      Mark
                    </Typography.Text>
                    <Space direction="vertical" size={6} style={{ width: "100%" }}>
                      {orderedMarkRows.map((row, rowIndex) => (
                        <div
                          key={`mark-row-${rowIndex}`}
                          style={{
                            display: "flex",
                            gap: 8,
                            flexWrap: "nowrap",
                            overflowX: "auto",
                            paddingBottom: 2
                          }}
                        >
                          {row.map((option) => (
                            <Button
                              key={`${option.value}-${option.label}`}
                              size="small"
                              shape="round"
                              type={markFilters.includes(option.value) ? "primary" : "default"}
                              style={
                                markFilters.includes(option.value)
                                  ? { whiteSpace: "nowrap" }
                                  : { borderColor: "#d9d9d9", whiteSpace: "nowrap" }
                              }
                              onClick={() => {
                                setMarkFilters((prev) =>
                                  prev.includes(option.value) ? prev.filter((item) => item !== option.value) : [...prev, option.value]
                                );
                                setPage(1);
                              }}
                            >
                              {option.label}
                            </Button>
                          ))}
                        </div>
                      ))}
                    </Space>
                  </Space>
                </Col>
                <Col xs={24} md={10}>
                  <Space direction="vertical" size={8} style={{ width: "100%" }}>
                    <Typography.Text type="secondary" style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.3 }}>
                      Factory
                    </Typography.Text>
                    <Space wrap size={[8, 8]}>
                      {(filterOptions?.factories ?? []).map((factory) => (
                        <Button
                          key={factory}
                          size="small"
                          shape="round"
                          type={factoryFilter === factory ? "primary" : "default"}
                          style={factoryFilter === factory ? undefined : { borderColor: "#d9d9d9" }}
                          onClick={() => {
                            setFactoryFilter(factoryFilter === factory ? null : factory);
                            setPage(1);
                          }}
                        >
                          {factory}
                        </Button>
                      ))}
                    </Space>
                  </Space>
                </Col>
              </Row>
            </div>
          </Col>
          <Col xs={24} lg={8}>
            <div
              style={{
                border: "1px solid #e7ece3",
                borderRadius: 12,
                background: "#fcfdfb",
                padding: 12,
                minHeight: 140,
                display: "flex",
                flexDirection: "column",
                gap: 12
              }}
            >
              <Space direction="vertical" size={8} style={{ width: "100%" }}>
                <Typography.Text type="secondary" style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.3 }}>
                  Sort By
                </Typography.Text>
                <Select
                  size="small"
                  value={sortOptionValue}
                  options={sortOptions}
                  onChange={(value) => applySortOption(value as SortOptionValue)}
                  style={{ width: 170 }}
                  popupMatchSelectWidth={false}
                />
                <Button
                  size="small"
                  type="default"
                  icon={<ReloadOutlined />}
                  style={{
                    borderColor: "#b8c3b0",
                    color: "#384237",
                    fontWeight: 700,
                    borderRadius: 10,
                    background: "#f6faf3",
                    height: 30,
                    paddingInline: 10,
                    alignSelf: "flex-start",
                    fontSize: 12
                  }}
                  onClick={() => {
                    setSearch("");
                    setMarkFilters([]);
                    setFactoryFilter(null);
                    setGradeFilter("");
                    setBagsMin(null);
                    setBagsMax(null);
                    setWeightMin(null);
                    setWeightMax(null);
                    setPackingDateFrom("");
                    setPackingDateTo("");
                    setStatusFilter([]);
                    setSortBy("LOT_NO");
                    setSortDirection("asc");
                    setPage(1);
                  }}
                >
                  Clear Filters & Sort
                </Button>
              </Space>
              {hasBulkSelection ? (
                <div
                  style={{
                    border: !bulkLaneAlignment.isAligned ? "1px solid #ffd6d6" : "1px solid #e7ece3",
                    borderRadius: 10,
                    background: !bulkLaneAlignment.isAligned ? "#fff7f7" : "#ffffff",
                    padding: 10
                  }}
                >
                  <Space direction="vertical" size={10} style={{ width: "100%" }}>
                    <Space size={10} align="center">
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
                        onClick={() => setSelected([])}
                      />
                    </Space>
                    <Typography.Text
                      type={!bulkLaneAlignment.isAligned ? "danger" : "secondary"}
                      style={{ fontSize: 12, fontWeight: 600 }}
                    >
                      {bulkLaneAlignment.isAligned ? `${selected.length} lots` : "Check Status"}
                    </Typography.Text>
                  </Space>
                </div>
              ) : (
                <div style={{ flex: 1 }} />
              )}
            </div>
          </Col>
        </Row>
      </Card>

      <Card variant="borderless" styles={{ body: { padding: 0, overflow: "hidden" } }}>
        <Table
          rowKey="id"
          loading={isLoading}
          columns={columns}
          dataSource={rows}
          pagination={{
            current: page,
            total: totalLots,
            pageSize,
            showSizeChanger: false,
            showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} lots`,
            onChange: (nextPage) => setPage(nextPage)
          }}
          rowSelection={{
            selectedRowKeys: selected,
            onChange: (keys) => setSelected(keys as string[])
          }}
          onRow={(record) => ({
            onClick: (event) => {
              const target = event.target as HTMLElement;
              if (target.closest("button, a, input, .ant-checkbox-wrapper, .ant-select, .ant-input-number")) return;
              setSelected((prev) => (prev.includes(record.id) ? prev.filter((id) => id !== record.id) : [...prev, record.id]));
            }
          })}
          rowClassName={() => "clickable-lot-row"}
          scroll={{ x: 1020 }}
        />
      </Card>

      <Drawer
        title={actionDetailsModalOpen ? "Manage Lot • Step 2 of 2" : "Manage Lot • Step 1 of 2"}
        open={actionSelectModalOpen || actionDetailsModalOpen}
        width={620}
        onClose={() => {
          setActionSelectModalOpen(false);
          setActionDetailsModalOpen(false);
          setActionStep1Choice(undefined);
          setReinvoiceTargetSearch("");
        }}
        placement="right"
        footer={
          actionDetailsModalOpen ? (
            <Space style={{ width: "100%", justifyContent: "space-between" }}>
              <Button
                key="back"
                onClick={() => {
                  setActionDetailsModalOpen(false);
                  setActionSelectModalOpen(true);
                  setActionStep1Choice(undefined);
                }}
              >
                Back
              </Button>
              <Button
                key="execute"
                type="primary"
                loading={runAction.isPending}
                onClick={submitManageLotAction}
              >
                Save Action
              </Button>
            </Space>
          ) : (
            <Space style={{ width: "100%", justifyContent: "flex-end" }}>
              <Button
                key="cancel"
                onClick={() => {
                  setActionSelectModalOpen(false);
                  setActionDetailsModalOpen(false);
                  setReinvoiceTargetSearch("");
                }}
              >
                Cancel
              </Button>
            </Space>
          )
        }
      >
        {!actionDetailsModalOpen ? (
          <Space
            direction="vertical"
            style={{ width: "100%" }}
            size={12}
            onKeyDown={(event) =>
              void handleEnterToSubmit(event, async () => {
                if (!actionStep1Choice) {
                  message.error("Select an action first.");
                  return;
                }
                openManageLotStep2(actionStep1Choice);
              })
            }
          >
            <Card size="small" style={{ background: "#fafafa" }}>
              <Space direction="vertical" size={2} style={{ width: "100%" }}>
                <Typography.Text type="secondary">Selected Lot</Typography.Text>
                <Typography.Text strong>
                  {selectedLotRow ? `${selectedLotRow.mark} / ${selectedLotRow.invoice_number}` : "No lot selected"}
                </Typography.Text>
                <Space size={[6, 6]} wrap>
                  {getLaneStatusChips(
                    selectedLotRow?.auction_lane_status,
                    selectedLotRow?.private_lane_status,
                    selectedLotRow?.active_statuses
                  ).map((chip) => {
                    const negotiatingTooltip = negotiatingTooltipText(
                      selectedLotRow?.negotiating_buyers,
                      selectedLotRow?.last_negotiated_on
                    );
                    const isNegotiatingChip =
                      chip.color === "purple" &&
                      selectedLotRow?.private_lane_status === "NEGOTIATING" &&
                      chip.label === "NEGOTIATING" &&
                      Boolean(negotiatingTooltip);
                    const tag = (
                      <Tag key={`selected-${chip.color}-${chip.label}`} color={chip.color}>
                        {chip.label}
                      </Tag>
                    );
                    return isNegotiatingChip ? (
                      <Tooltip key={`selected-${chip.color}-${chip.label}-tooltip`} title={negotiatingTooltip}>
                        {tag}
                      </Tooltip>
                    ) : (
                      tag
                    );
                  })}
                  {selectedLotRow?.is_sampled ? <Tag color="cyan">SAMPLED</Tag> : null}
                  {selectedLotRow?.reinvoiced_from_lot_id && !selectedLotRow?.auction_lane_status && !selectedLotRow?.private_lane_status ? (
                    <Tag color="gold">REINVOICED</Tag>
                  ) : null}
                </Space>
              </Space>
            </Card>

            <Space direction="vertical" style={{ width: "100%" }} size={6}>
              <Typography.Text type="secondary">Choose an action</Typography.Text>
            </Space>
            <Select
              size="large"
              value={actionStep1Choice}
              placeholder="Select an action"
              onChange={(v) => setActionStep1Choice(v)}
              onSelect={(v) => openManageLotStep2(v as ActionName)}
              options={actionOptions}
              disabled={!actionOptions.length}
              {...modalSelectProps}
            />
            {!actionOptions.length ? (
              <Typography.Text type="secondary">No actions are available for this lot right now.</Typography.Text>
            ) : null}
          </Space>
        ) : (
          <Space
            direction="vertical"
            style={{ width: "100%" }}
            size={12}
            onKeyDown={(event) => void handleEnterToSubmit(event, submitManageLotAction)}
          >
            <Card size="small" style={{ background: "#fafafa" }}>
              <Space direction="vertical" size={2} style={{ width: "100%" }}>
                <Typography.Text type="secondary">Action</Typography.Text>
                <Typography.Text strong>{formatActionName(selectedAction)}</Typography.Text>
                <Typography.Text type="secondary">
                  Lot: {selectedLotRow ? `${selectedLotRow.mark} / ${selectedLotRow.invoice_number}` : "-"}
                </Typography.Text>
              </Space>
            </Card>
            <ManageLotHistoryContext
              selectedAction={selectedAction}
              lot={selectedLotRow}
              actions={manageLotActionsData?.rows ?? []}
              loading={manageLotActionsLoading}
            />

            <Row gutter={[12, 12]}>
              {actionFieldConfig[selectedAction].map((field) => (
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
                          value={Array.isArray(actionData[field.key]) ? (actionData[field.key] as string[]) : []}
                          options={buyerSelectOptions}
                          onChange={(value) => setActionData((prev) => ({ ...prev, [field.key]: value.map((item) => String(item)) }))}
                          {...modalSelectProps}
                        />
                      ) : (field.key === "buyer" || field.key === "buyer_name") ? (
                        <Select
                          showSearch
                          optionFilterProp="label"
                          value={String(actionData[field.key] ?? "") || undefined}
                          options={buyerSelectOptions}
                          onChange={(value) => setActionData((prev) => ({ ...prev, [field.key]: String(value) }))}
                          {...modalSelectProps}
                        />
                      ) : field.key === "broker" ? (
                        <Select
                          showSearch
                          optionFilterProp="label"
                          value={String(actionData[field.key] ?? "") || undefined}
                          options={selectedAction === "DISPATCH_TO_AUCTION" ? dispatchBrokerSelectOptions : brokerSelectOptions}
                          onChange={(value) => setActionData((prev) => applyDispatchMappings(prev, field.key, String(value)))}
                          {...modalSelectProps}
                        />
                      ) : field.key === "warehouse" ? (
                        <Select
                          value={String(actionData[field.key] ?? "") || undefined}
                          options={warehouseSelectOptions}
                          onChange={(value) => setActionData((prev) => applyDispatchMappings(prev, field.key, String(value)))}
                          {...modalSelectProps}
                        />
                      ) : field.key === "auction_centre" ? (
                        <Select
                          value={String(actionData[field.key] ?? "") || undefined}
                          options={auctionCentreSelectOptions}
                          onChange={(value) => setActionData((prev) => ({ ...prev, [field.key]: String(value) }))}
                          {...modalSelectProps}
                        />
                      ) : field.key === "reinvoiced_to_lot_id" ? (
                        <Select
                          showSearch
                          value={String(actionData[field.key] ?? "") || undefined}
                          options={reinvoiceTargetOptions}
                          filterOption={false}
                          onSearch={(value) => setReinvoiceTargetSearch(String(value))}
                          notFoundContent={reinvoiceTargetsLoading ? "Loading..." : "No pending lots found"}
                          placeholder="Select target pending lot"
                          onChange={(value) => setActionData((prev) => ({ ...prev, [field.key]: String(value) }))}
                          {...modalSelectProps}
                        />
                      ) : (
                        <Input
                          value={String(actionData[field.key] ?? "")}
                          onChange={(e) => setActionData((prev) => ({ ...prev, [field.key]: e.target.value }))}
                        />
                      )
                    ) : null}
                    {field.type === "date" ? (
                      <Input
                        type="date"
                        value={String(actionData[field.key] ?? "")}
                        onChange={(e) => setActionData((prev) => ({ ...prev, [field.key]: e.target.value }))}
                        onClick={(e) => tryOpenDatePicker(e.currentTarget)}
                      />
                    ) : null}
                    {field.type === "number" ? (
                      <InputNumber
                        style={{ width: "100%" }}
                        value={typeof actionData[field.key] === "number" ? (actionData[field.key] as number) : undefined}
                        onChange={(v) => setActionData((prev) => ({ ...prev, [field.key]: v ?? null }))}
                      />
                    ) : null}
                    {field.type === "tags" ? (
                      field.key === "parties" ? (
                        <Space direction="vertical" style={{ width: "100%" }} size={8}>
                          <Input
                            placeholder="Search buyer/broker"
                            value={partySearch}
                            data-enter-submit="ignore"
                            onChange={(e) => setPartySearch(e.target.value)}
                          />
                          <div
                            style={{ maxHeight: 280, overflowY: "auto", border: "1px solid #f0f0f0", borderRadius: 8, padding: 8 }}
                          >
                            <Checkbox.Group
                              style={{ width: "100%" }}
                              value={Array.isArray(actionData[field.key]) ? (actionData[field.key] as string[]) : []}
                              options={filteredSamplingPartyOptions}
                              onChange={(vals) =>
                                setActionData((prev) => ({ ...prev, [field.key]: vals.map((v) => String(v)) }))
                              }
                            />
                          </div>
                        </Space>
                      ) : (
                        <Select
                          mode="tags"
                          value={Array.isArray(actionData[field.key]) ? (actionData[field.key] as string[]) : []}
                          onChange={(v) => setActionData((prev) => ({ ...prev, [field.key]: v }))}
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

      <Drawer
        title={bulkActionDetailsOpen ? `Manage Lot • Step 2 of 2 (${selected.length} lots)` : `Manage Lot • Step 1 of 2 (${selected.length} lots)`}
        open={bulkActionSelectOpen || bulkActionDetailsOpen}
        width={620}
        onClose={() => {
          setBulkActionSelectOpen(false);
          setBulkActionDetailsOpen(false);
          setBulkActionStep1Choice(undefined);
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
              <Button
                type="primary"
                loading={runBulkAction.isPending}
                onClick={submitBulkManageLotAction}
              >
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
                openBulkManageLotStep2(bulkActionStep1Choice);
              })
            }
          >
            <Card size="small" style={{ background: "#fafafa" }}>
              <Space direction="vertical" size={2} style={{ width: "100%" }}>
                <Typography.Text type="secondary">Selected Lots</Typography.Text>
                <Typography.Text strong>{selected.length} lots</Typography.Text>
              </Space>
            </Card>
            <Space direction="vertical" style={{ width: "100%" }} size={6}>
              <Typography.Text type="secondary">Choose an action</Typography.Text>
            </Space>
            <Select
              size="large"
              value={bulkActionStep1Choice}
              placeholder="Select an action"
              onChange={(v) => setBulkActionStep1Choice(v)}
              onSelect={(v) => openBulkManageLotStep2(v as ActionName)}
              options={bulkActionOptions}
              disabled={!bulkActionOptions.length}
              {...modalSelectProps}
            />
            {!bulkActionOptions.length ? <Typography.Text type="secondary">{bulkManageDisabledReason}</Typography.Text> : null}
          </Space>
        ) : (
          <Space
            direction="vertical"
            style={{ width: "100%" }}
            onKeyDown={(event) => void handleEnterToSubmit(event, submitBulkManageLotAction)}
          >
            <Card size="small" style={{ background: "#fafafa" }}>
              <Space direction="vertical" size={2} style={{ width: "100%" }}>
                <Typography.Text type="secondary">Action</Typography.Text>
                <Typography.Text strong>{formatActionName(bulkSelectedAction)}</Typography.Text>
                <Typography.Text type="secondary">{selected.length} lots</Typography.Text>
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
                        onClick={(e) => tryOpenDatePicker(e.currentTarget)}
                      />
                    ) : null}
                    {field.type === "number" ? (
                      <InputNumber
                        style={{ width: "100%" }}
                        value={typeof bulkActionData[field.key] === "number" ? (bulkActionData[field.key] as number) : undefined}
                        onChange={(v) => setBulkActionData((prev) => ({ ...prev, [field.key]: v ?? null }))}
                      />
                    ) : null}
                    {field.type === "tags" ? (
                      field.key === "parties" ? (
                        <Space direction="vertical" style={{ width: "100%" }} size={8}>
                          <Input
                            placeholder="Search buyer/broker"
                            value={bulkPartySearch}
                            data-enter-submit="ignore"
                            onChange={(e) => setBulkPartySearch(e.target.value)}
                          />
                          <div style={{ maxHeight: 280, overflowY: "auto", border: "1px solid #f0f0f0", borderRadius: 8, padding: 8 }}>
                            <Checkbox.Group
                              style={{ width: "100%" }}
                              value={Array.isArray(bulkActionData[field.key]) ? (bulkActionData[field.key] as string[]) : []}
                              options={filteredBulkSamplingPartyOptions}
                              onChange={(vals) =>
                                setBulkActionData((prev) => ({ ...prev, [field.key]: vals.map((v) => String(v)) }))
                              }
                            />
                          </div>
                        </Space>
                      ) : (
                        <Select
                          mode="tags"
                          value={Array.isArray(bulkActionData[field.key]) ? (bulkActionData[field.key] as string[]) : []}
                          onChange={(v) => setBulkActionData((prev) => ({ ...prev, [field.key]: v }))}
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

      <Modal
        title="Sampling History"
        open={Boolean(samplingHistoryLotId)}
        onCancel={() => setSamplingHistoryLotId(null)}
        width={760}
        footer={[
          <Button key="close" onClick={() => setSamplingHistoryLotId(null)}>
            Close
          </Button>
        ]}
      >
        <Space direction="vertical" style={{ width: "100%" }} size={12}>
          <Card size="small" style={{ background: "#f6ffed", borderColor: "#b7eb8f" }}>
            <Space direction="vertical" size={4} style={{ width: "100%" }}>
              <Typography.Text strong>
                {samplingHistoryLot ? `${samplingHistoryLot.mark} / ${samplingHistoryLot.invoice_number}` : "Selected Lot"}
              </Typography.Text>
              <Row gutter={12}>
                <Col span={12}>
                  <Typography.Text type="secondary">Number of parties sampled to</Typography.Text>
                  <div>
                    <Typography.Title level={4} style={{ margin: 0 }}>
                      {sampledPartyCount}
                    </Typography.Title>
                  </div>
                </Col>
                <Col span={12}>
                  <Typography.Text type="secondary">Sampling dates recorded</Typography.Text>
                  <div>
                    <Typography.Title level={4} style={{ margin: 0 }}>
                      {sampledDateCount}
                    </Typography.Title>
                  </div>
                </Col>
              </Row>
            </Space>
          </Card>

          {samplingHistoryLoading ? (
            <Typography.Text type="secondary">Loading sampling history...</Typography.Text>
          ) : samplingHistoryRows.length === 0 ? (
            <Typography.Text type="secondary">No sampling history found.</Typography.Text>
          ) : (
            <Card size="small" styles={{ body: { paddingTop: 8, paddingBottom: 8 } }}>
              <List
                dataSource={samplingHistoryRows}
                renderItem={(entry) => (
                  <List.Item key={entry.date} style={{ display: "block", paddingTop: 10, paddingBottom: 10 }}>
                    <Space direction="vertical" style={{ width: "100%" }} size={8}>
                      <Typography.Text strong>{entry.date}</Typography.Text>
                      <Space size={[6, 6]} wrap>
                        {entry.parties.map((party) => (
                          <Tag key={`${entry.date}-${party}`} color={party === "-" ? "default" : "blue"}>
                            {party}
                          </Tag>
                        ))}
                      </Space>
                    </Space>
                    <Divider style={{ margin: "10px 0 0" }} />
                  </List.Item>
                )}
              />
            </Card>
          )}
        </Space>
      </Modal>

    </Space>
  );
}
