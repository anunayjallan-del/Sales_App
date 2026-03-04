"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { ColumnsType } from "antd/es/table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckOutlined, FilterOutlined } from "@ant-design/icons";
import { App, Button, Card, Checkbox, Col, Divider, Drawer, Dropdown, Input, InputNumber, List, Modal, Popover, Row, Select, Space, Table, Tag, Tooltip, Typography } from "antd";
import { fetchJson } from "@/lib/fetcher";
import { handleEnterToSubmit } from "@/lib/keyboard-submit";

type LotRow = {
  id: string;
  factory: string | null;
  mark: string;
  invoice_number: string;
  grade: string;
  bags: number;
  net_weight_kg: number;
  date_created: string;
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
    { key: "advice_date", label: "Advice date", type: "date", required: true },
    { key: "broker", label: "Broker", type: "text", required: true },
    { key: "warehouse", label: "Warehouse", type: "text", required: true },
    { key: "auction_centre", label: "Auction Centre", type: "text", required: true },
    { key: "remarks", label: "Remarks", type: "text" }
  ],
  AUCTION_DISPATCHED: [
    { key: "dispatch_date", label: "Dispatch date", type: "date", required: true },
    { key: "transporter", label: "Transporter", type: "text", required: true },
    { key: "remarks", label: "Remarks", type: "text" }
  ],
  HOLD_AWR: [
    { key: "arrival_date", label: "Date of arrival", type: "date", required: true },
    { key: "remarks", label: "Remarks", type: "text" }
  ],
  AWR_RECEIVED: [
    { key: "arrival_date", label: "Date of arrival", type: "date", required: true },
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
    { key: "point_of_contact", label: "Point of contact", type: "text", required: true },
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
  content
}: {
  label: string;
  active: boolean;
  content: React.ReactNode;
}) {
  return (
    <Space size={6}>
      <span>{label}</span>
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
  const [search, setSearch] = useState("");
  const [markFilter, setMarkFilter] = useState<string | null>(null);
  const [factoryFilter, setFactoryFilter] = useState<string | null>(null);
  const [gradeFilter, setGradeFilter] = useState("");
  const [bagsMin, setBagsMin] = useState<number | null>(null);
  const [bagsMax, setBagsMax] = useState<number | null>(null);
  const [weightMin, setWeightMin] = useState<number | null>(null);
  const [weightMax, setWeightMax] = useState<number | null>(null);
  const [packingDateFrom, setPackingDateFrom] = useState("");
  const [packingDateTo, setPackingDateTo] = useState("");
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [sampledFilter, setSampledFilter] = useState<"ALL" | "YES" | "NO">("ALL");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string[]>([]);
  const [actionSelectModalOpen, setActionSelectModalOpen] = useState(false);
  const [actionDetailsModalOpen, setActionDetailsModalOpen] = useState(false);
  const [selectedAction, setSelectedAction] = useState<ActionName>("SAMPLING");
  const [actionStep1Choice, setActionStep1Choice] = useState<ActionName | undefined>(undefined);
  const [actionData, setActionData] = useState<Record<string, unknown>>({});
  const [partySearch, setPartySearch] = useState("");
  const [bulkActionModalOpen, setBulkActionModalOpen] = useState(false);
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

  const { data: filterOptions } = useQuery({
    queryKey: ["lot-filter-options"],
    queryFn: () => fetchJson<{ marks: string[]; factories: string[]; grades: string[] }>("/api/lots/filter-options")
  });
  const { data: partyOptions } = useQuery({
    queryKey: ["party-options"],
    queryFn: () => fetchJson<{ buyers: string[]; brokers: string[] }>("/api/parties/options")
  });

  const lotsQuery = useMemo(() => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));
    if (search.trim()) params.set("search", search.trim());
    if (markFilter) params.set("mark", markFilter);
    if (factoryFilter) params.set("factory", factoryFilter);
    if (gradeFilter.trim()) params.set("grade", gradeFilter.trim());
    if (bagsMin !== null) params.set("bagsMin", String(bagsMin));
    if (bagsMax !== null) params.set("bagsMax", String(bagsMax));
    if (weightMin !== null) params.set("weightMin", String(weightMin));
    if (weightMax !== null) params.set("weightMax", String(weightMax));
    if (packingDateFrom) params.set("packingDateFrom", packingDateFrom);
    if (packingDateTo) params.set("packingDateTo", packingDateTo);
    if (statusFilter.length) params.set("status", statusFilter.join(","));
    if (sampledFilter === "YES") params.set("sampled", "true");
    if (sampledFilter === "NO") params.set("sampled", "false");
    return params.toString();
  }, [
    bagsMax,
    bagsMin,
    factoryFilter,
    gradeFilter,
    markFilter,
    packingDateFrom,
    packingDateTo,
    page,
    pageSize,
    search,
    statusFilter,
    sampledFilter,
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
    enabled: Boolean(selectedLotId) && actionDetailsModalOpen && selectedAction === "AUCTION_DISPATCHED"
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
      conflictAcknowledged?: boolean;
      conflictPromptType?: ConflictPromptType;
      conflictAcknowledgedAt?: string;
    }) =>
      fetchJson<{ warnings?: string[] }>(`/api/lots/${payload.lotId}/actions`, {
        method: "POST",
        body: JSON.stringify({
          action: payload.action,
          data: payload.data,
          conflict_acknowledged: payload.conflictAcknowledged,
          conflict_prompt_type: payload.conflictPromptType,
          conflict_acknowledged_at: payload.conflictAcknowledgedAt
        })
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
      message.success("Bulk action executed");
      await invalidate();
      setBulkActionModalOpen(false);
      setBulkActionData({});
      setSelected([]);
    }
  });

  const rows = data?.lots ?? [];
  const totalLots = data?.total ?? 0;
  const selectedRows = rows.filter((row) => selected.includes(row.id));
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
        conflictAcknowledged: true,
        conflictPromptType: conflictMeta.promptType,
        conflictAcknowledgedAt: new Date().toISOString()
      });
      return;
    }
    await runAction.mutateAsync({
      lotId: selectedLotId,
      action: selectedAction,
      data: actionData
    });
  };

  const submitBulkManageLotAction = async () => {
    if (runBulkAction.isPending || !selectedRows.length) return;
    if (!bulkActionOptions.some((option) => option.value === bulkSelectedAction)) {
      message.error("Selected bulk action is not allowed for all selected lots.");
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
  const latestDispatchAdvicePayload = useMemo(() => {
    const rows = manageLotActionsData?.rows ?? [];
    for (const row of rows) {
      if (row.action !== "DISPATCH_TO_AUCTION") continue;
      const payload = (row.payload ?? {}) as Record<string, unknown>;
      return {
        advice_date: String(payload.advice_date ?? ""),
        broker: String(payload.broker ?? ""),
        warehouse: String(payload.warehouse ?? ""),
        auction_centre: String(payload.auction_centre ?? "")
      };
    }
    return null;
  }, [manageLotActionsData?.rows]);

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
      { key: "PENDING", label: "PENDING" },
      { key: "PENDING_AUCTION_DISPATCH", label: "PENDING_AUCTION_DISPATCH" },
      { key: "IN_TRANSIT", label: "IN_TRANSIT" },
      { key: "AWR_PENDING", label: "AWR_PENDING" },
      { key: "AWR_RECEIVED", label: "AWR_RECEIVED" },
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
    if (!selectedRows.length) return [] as ActionName[];
    const [head, ...tail] = selectedRows.map((row) => sanitizeAllowedActions(row.allowed_actions));
    const base = new Set(head);
    for (const actions of tail) {
      const current = new Set(actions);
      for (const action of Array.from(base)) {
        if (!current.has(action)) base.delete(action);
      }
    }
    return Array.from(base);
  }, [selectedRows]);
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
        render: (value: string | null) => value || "-"
      },
      {
        title: "Mark",
        dataIndex: "mark",
        key: "mark"
      },
      {
        title: "Lot No.",
        dataIndex: "invoice_number",
        key: "invoice_number"
      },
      {
        dataIndex: "grade",
        key: "grade",
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
        width: 90,
        responsive: ["md"]
      },
      {
        title: (
          <HeaderFilter
            label="Quantity"
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
        width: 110,
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
        width: 120,
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
        width: 260,
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
    [bagsMax, bagsMin, deleteLot, gradeFilter, gradeItems, modal, packingDateFrom, packingDateTo, statusFilter, statusItems, weightMax, weightMin]
  );

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <Card title="Filters" variant="borderless">
        <Row gutter={[12, 12]}>
          <Col xs={24} md={5}>
            <Space direction="vertical" size={4}>
              <Typography.Text type="secondary">Lot Number</Typography.Text>
              <Input
                size="middle"
                placeholder="UKD9999"
                value={search}
                maxLength={7}
                style={{ width: 140 }}
                onChange={(e) => {
                  const compact = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 7);
                  setSearch(compact);
                  setPage(1);
                }}
              />
            </Space>
          </Col>
          <Col xs={24} md={9}>
            <Space direction="vertical" size={6} style={{ width: "100%" }}>
              <Typography.Text type="secondary">Mark</Typography.Text>
              <Space wrap size={[8, 8]}>
                <Button
                  size="small"
                  shape="round"
                  type={markFilter === null ? "primary" : "default"}
                  onClick={() => {
                    setMarkFilter(null);
                    setPage(1);
                  }}
                >
                  All
                </Button>
                {(filterOptions?.marks ?? []).map((mark) => (
                  <Button
                    key={mark}
                    size="small"
                    shape="round"
                    type={markFilter === mark ? "primary" : "default"}
                    style={markFilter === mark ? undefined : { borderColor: "#d9d9d9" }}
                    onClick={() => {
                      setMarkFilter(markFilter === mark ? null : mark);
                      setPage(1);
                    }}
                  >
                    {mark}
                  </Button>
                ))}
              </Space>
            </Space>
          </Col>
          <Col xs={24} md={6}>
            <Space direction="vertical" size={6} style={{ width: "100%" }}>
              <Typography.Text type="secondary">Factory</Typography.Text>
              <Space wrap size={[8, 8]}>
                <Button
                  size="small"
                  shape="round"
                  type={factoryFilter === null ? "primary" : "default"}
                  onClick={() => {
                    setFactoryFilter(null);
                    setPage(1);
                  }}
                >
                  All
                </Button>
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
          <Col xs={24} md={4}>
            <Space direction="vertical" size={6} style={{ width: "100%" }}>
              <Typography.Text type="secondary">Sampled</Typography.Text>
              <Space wrap size={[8, 8]}>
                <Button
                  size="small"
                  shape="round"
                  type={sampledFilter === "ALL" ? "primary" : "default"}
                  onClick={() => {
                    setSampledFilter("ALL");
                    setPage(1);
                  }}
                >
                  All
                </Button>
                <Button
                  size="small"
                  shape="round"
                  type={sampledFilter === "YES" ? "primary" : "default"}
                  onClick={() => {
                    setSampledFilter("YES");
                    setPage(1);
                  }}
                >
                  Yes
                </Button>
                <Button
                  size="small"
                  shape="round"
                  type={sampledFilter === "NO" ? "primary" : "default"}
                  onClick={() => {
                    setSampledFilter("NO");
                    setPage(1);
                  }}
                >
                  No
                </Button>
              </Space>
            </Space>
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
          scroll={{ x: 700 }}
        />
      </Card>

      {selected.length >= 2 ? (
        <div
          style={{
            position: "fixed",
            left: "50%",
            bottom: 16,
            transform: "translateX(-50%)",
            zIndex: 40,
            width: "min(960px, calc(100vw - 24px))"
          }}
        >
          <Card variant="borderless" style={{ boxShadow: "0 12px 36px rgba(0,0,0,0.18)" }}>
            <Space wrap size={[8, 8]}>
              <Typography.Text strong>Selected: {selected.length}</Typography.Text>
              <Button
                disabled={!bulkActionOptions.length}
                title={!bulkActionOptions.length ? "No common actions for selected lots" : undefined}
                onClick={() => {
                  const first = bulkActionOptions[0]?.value;
                  if (!first) return;
                  setBulkSelectedAction(first);
                  setBulkActionData(buildInitialActionData(first));
                  setBulkActionModalOpen(true);
                }}
              >
                Bulk Manage Lot
              </Button>
              <Button onClick={() => setSelected([])}>Clear Selection</Button>
            </Space>
          </Card>
        </div>
      ) : null}

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
            {selectedAction === "AUCTION_DISPATCHED" ? (
              <Card
                size="small"
                style={{
                  background: latestDispatchAdvicePayload ? "#f6ffed" : "#fff2e8",
                  borderColor: latestDispatchAdvicePayload ? "#b7eb8f" : "#ffbb96"
                }}
              >
                <Space direction="vertical" size={6} style={{ width: "100%" }}>
                  <Typography.Text strong>Dispatch Advice Context</Typography.Text>
                  {!latestDispatchAdvicePayload && !manageLotActionsLoading ? (
                    <Typography.Text type="warning">
                      Dispatch advice not found; proceed carefully.
                    </Typography.Text>
                  ) : null}
                  {manageLotActionsLoading ? (
                    <Typography.Text type="secondary">Loading dispatch advice...</Typography.Text>
                  ) : (
                    <Row gutter={[10, 8]}>
                      <Col span={12}>
                        <Typography.Text type="secondary">Advice date</Typography.Text>
                        <div>{latestDispatchAdvicePayload?.advice_date || "-"}</div>
                      </Col>
                      <Col span={12}>
                        <Typography.Text type="secondary">Broker</Typography.Text>
                        <div>{latestDispatchAdvicePayload?.broker || "-"}</div>
                      </Col>
                      <Col span={12}>
                        <Typography.Text type="secondary">Warehouse</Typography.Text>
                        <div>{latestDispatchAdvicePayload?.warehouse || "-"}</div>
                      </Col>
                      <Col span={12}>
                        <Typography.Text type="secondary">Auction Centre</Typography.Text>
                        <div>{latestDispatchAdvicePayload?.auction_centre || "-"}</div>
                      </Col>
                    </Row>
                  )}
                </Space>
              </Card>
            ) : null}

            <Row gutter={[12, 12]}>
              {actionFieldConfig[selectedAction].map((field) => (
                <Col key={field.key} xs={24} md={field.type === "tags" || field.key === "remarks" ? 24 : 12}>
                  <Space direction="vertical" size={6} style={{ width: "100%" }}>
                    <Typography.Text type="secondary">
                      {field.label}
                      {field.required ? " *" : ""}
                    </Typography.Text>
                    {field.type === "text" ? (
                      selectedAction === "AUCTION_DISPATCHED" &&
                      (field.key === "broker" || field.key === "warehouse" || field.key === "auction_centre" || field.key === "advice_date") ? (
                        <Input value={String(latestDispatchAdvicePayload?.[field.key as keyof typeof latestDispatchAdvicePayload] ?? "")} readOnly />
                      ) : field.key === "buyers" ? (
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
                      selectedAction === "AUCTION_DISPATCHED" && field.key === "advice_date" ? (
                        <Input value={String(latestDispatchAdvicePayload?.advice_date ?? "")} readOnly />
                      ) : (
                        <Input
                          type="date"
                          value={String(actionData[field.key] ?? "")}
                          onChange={(e) => setActionData((prev) => ({ ...prev, [field.key]: e.target.value }))}
                          onClick={(e) => tryOpenDatePicker(e.currentTarget)}
                        />
                      )
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

      <Modal
        title={`Bulk Manage Lot (${selected.length} lots)`}
        open={bulkActionModalOpen}
        onCancel={() => setBulkActionModalOpen(false)}
        onOk={submitBulkManageLotAction}
        okButtonProps={{ loading: runBulkAction.isPending }}
      >
        <Space
          direction="vertical"
          style={{ width: "100%" }}
          onKeyDown={(event) => void handleEnterToSubmit(event, submitBulkManageLotAction)}
        >
          <Select
            value={bulkSelectedAction}
            onChange={(v) => {
              setBulkSelectedAction(v);
              setBulkActionData(buildInitialActionData(v));
            }}
            options={bulkActionOptions}
            disabled={!bulkActionOptions.length}
            {...modalSelectProps}
          />
          {!bulkActionOptions.length ? (
            <Typography.Text type="secondary">No common actions for selected lots’ current statuses.</Typography.Text>
          ) : null}
          {(actionFieldConfig[bulkSelectedAction] ?? []).map((field) => (
            <div key={field.key}>
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
            </div>
          ))}
        </Space>
      </Modal>

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
