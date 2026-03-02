"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { App, Button, Card, Checkbox, Drawer, Empty, Input, InputNumber, Popconfirm, Segmented, Select, Space, Spin, Table, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { AppShell } from "@/components/app-shell";
import { fetchJson } from "@/lib/fetcher";

type PendingLotRow = {
  id: string;
  mark: string;
  invoice_number: string;
  grade: string;
  bags: number;
  net_weight_kg: number;
  date_created: string;
};

type LotActionRow = {
  id: string;
  action: string;
  payload?: Record<string, unknown> | null;
  performed_at: string;
};

type PendingDispatchSection = {
  parentLabel: string;
  markGroups: Array<{
    mark: string;
    lots: PendingLotRow[];
    totalBags: number;
    totalWeight: number;
  }>;
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
    { key: "buyer", label: "Buyer", type: "text", required: true },
    { key: "negotiation_date", label: "Negotiation date", type: "date", required: true },
    { key: "offered_price", label: "Offered price", type: "number" },
    { key: "remarks", label: "Remarks", type: "text" }
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
    { key: "new_lot_number", label: "New lot number", type: "text", required: true },
    { key: "remarks", label: "Remarks", type: "text" }
  ],
  PAYMENT_RECEIVED: [
    { key: "payment_received_date", label: "Payment received date", type: "date", required: true },
    { key: "amount_received", label: "Amount received", type: "number", required: true },
    { key: "remarks", label: "Remarks", type: "text" }
  ]
};

const modalSelectProps = {
  style: { width: "100%" as const },
  listHeight: 420,
  popupMatchSelectWidth: false as const,
  styles: { popup: { root: { minWidth: 420 } } }
};

function formatActionName(action: ActionName): string {
  return action
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
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
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split("-");
    return `${d}-${m}-${String(y).slice(-2)}`;
  }
  return value;
}

export default function DispatchPendingPage() {
  const queryClient = useQueryClient();
  const { message } = App.useApp();

  const [page, setPage] = useState(1);
  const [view, setView] = useState<"AUCTION_DISPATCH" | "PRIVATE">("AUCTION_DISPATCH");
  const [dispatchLot, setDispatchLot] = useState<PendingLotRow | null>(null);
  const [dispatchForm, setDispatchForm] = useState<{ dispatch_date: string; transporter: string; remarks: string }>({
    dispatch_date: new Date().toISOString().slice(0, 10),
    transporter: "",
    remarks: ""
  });
  const [manageLot, setManageLot] = useState<PendingLotRow | null>(null);
  const [actionSelectOpen, setActionSelectOpen] = useState(false);
  const [actionDetailsOpen, setActionDetailsOpen] = useState(false);
  const [selectedAction, setSelectedAction] = useState<ActionName>("SAMPLING");
  const [actionData, setActionData] = useState<Record<string, unknown>>({});
  const [partySearch, setPartySearch] = useState("");

  const pageSize = 60;
  const activeStatus = view === "AUCTION_DISPATCH" ? "PENDING_AUCTION_DISPATCH" : "SOLD_PENDING_DISPATCH";

  const { data, isLoading } = useQuery({
    queryKey: ["dispatch-pending-lots", view, page, pageSize],
    queryFn: () =>
      fetchJson<{ lots: PendingLotRow[]; total: number; page: number; pageSize: number }>(
        `/api/lots?page=${page}&pageSize=${pageSize}&status=${activeStatus}`
      )
  });
  const { data: partyOptions } = useQuery({
    queryKey: ["party-options-dispatch-pending"],
    queryFn: () => fetchJson<{ buyers: string[]; brokers: string[] }>("/api/parties/options")
  });

  const { data: dispatchContextData, isLoading: dispatchContextLoading } = useQuery({
    queryKey: ["dispatch-context", dispatchLot?.id],
    queryFn: () => fetchJson<{ rows: LotActionRow[] }>(`/api/lots/${dispatchLot?.id}/actions`),
    enabled: Boolean(dispatchLot?.id)
  });
  const { data: groupingContextByLotId, isLoading: isGroupingContextLoading } = useQuery({
    queryKey: ["dispatch-pending-grouping-context", view, (data?.lots ?? []).map((row) => row.id).join(",")],
    enabled: (data?.lots ?? []).length > 0,
    queryFn: async () => {
      const lots = data?.lots ?? [];
      const entries = await Promise.all(
        lots.map(async (row) => {
          const actions = await fetchJson<{ rows: LotActionRow[] }>(`/api/lots/${row.id}/actions`);
          if (view === "AUCTION_DISPATCH") {
            const prepared = (actions.rows ?? []).find((action) => action.action === "DISPATCH_TO_AUCTION");
            const auctionCentre = String((prepared?.payload?.auction_centre as unknown) ?? "").trim();
            return [row.id, auctionCentre || "Unspecified Auction Centre"] as const;
          }
          const soldPending = (actions.rows ?? []).find((action) => action.action === "SOLD_PENDING_DISPATCH");
          const broker = String((soldPending?.payload?.broker as unknown) ?? "").trim();
          return [row.id, broker || "Unspecified Broker"] as const;
        })
      );
      return Object.fromEntries(entries) as Record<string, string>;
    }
  });

  const dispatchMutation = useMutation({
    mutationFn: (payload: { lotId: string; data: Record<string, unknown> }) =>
      fetchJson<{ warnings?: string[] }>(`/api/lots/${payload.lotId}/actions`, {
        method: "POST",
        body: JSON.stringify({ action: "AUCTION_DISPATCHED", data: payload.data })
      }),
    onSuccess: async (res) => {
      message.success("Auction dispatched");
      if (res?.warnings?.includes("DISPATCH_ADVICE_MISSING")) {
        message.warning("Dispatch advice not found; proceeded with soft warning.");
      }
      setDispatchLot(null);
      setDispatchForm({ dispatch_date: new Date().toISOString().slice(0, 10), transporter: "", remarks: "" });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["dispatch-pending-lots"] }),
        queryClient.invalidateQueries({ queryKey: ["lots"] })
      ]);
    },
    onError: (err: Error) => {
      message.error(err.message || "Failed to dispatch lot");
    }
  });
  const manageMutation = useMutation({
    mutationFn: (payload: { lotId: string; action: ActionName; data: Record<string, unknown> }) =>
      fetchJson(`/api/lots/${payload.lotId}/actions`, {
        method: "POST",
        body: JSON.stringify({ action: payload.action, data: payload.data })
      }),
    onSuccess: async () => {
      message.success("Action executed");
      setActionDetailsOpen(false);
      setActionSelectOpen(false);
      setManageLot(null);
      setActionData({});
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["dispatch-pending-lots"] }),
        queryClient.invalidateQueries({ queryKey: ["lots"] })
      ]);
    },
    onError: (err: Error) => {
      message.error(err.message || "Failed to execute action");
    }
  });
  const deleteActionMutation = useMutation({
    mutationFn: async (payload: { lotId: string; view: "AUCTION_DISPATCH" | "PRIVATE" }) => {
      const actions = await fetchJson<{ rows: LotActionRow[] }>(`/api/lots/${payload.lotId}/actions`);
      const allowedActions = new Set<string>(
        payload.view === "AUCTION_DISPATCH" ? ["DISPATCH_TO_AUCTION", "AUCTION_DISPATCHED"] : ["SOLD_PENDING_DISPATCH"]
      );
      const target = (actions.rows ?? []).find((row) => allowedActions.has(String(row.action)));
      if (!target) {
        throw new Error("No matching pending-dispatch action found for this lot.");
      }
      return fetchJson<{ deleted: boolean; rolledBackToStatus?: string }>(`/api/lots/${payload.lotId}/actions/${target.id}`, {
        method: "DELETE"
      });
    },
    onSuccess: async () => {
      message.success("Action deleted");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["dispatch-pending-lots"] }),
        queryClient.invalidateQueries({ queryKey: ["lots"] })
      ]);
    },
    onError: (error: Error) => {
      message.error(error.message || "Failed to delete action");
    }
  });

  const rows = useMemo(() => data?.lots ?? [], [data?.lots]);
  const total = data?.total ?? 0;

  const latestPreparedAdvice = useMemo(() => {
    const actions = dispatchContextData?.rows ?? [];
    for (const row of actions) {
      if (row.action !== "DISPATCH_TO_AUCTION") continue;
      const payload = row.payload ?? {};
      return {
        advice_date: String((payload as Record<string, unknown>).advice_date ?? ""),
        broker: String((payload as Record<string, unknown>).broker ?? ""),
        warehouse: String((payload as Record<string, unknown>).warehouse ?? ""),
        auction_centre: String((payload as Record<string, unknown>).auction_centre ?? "")
      };
    }
    return null;
  }, [dispatchContextData?.rows]);

  const groups = useMemo<PendingDispatchSection[]>(() => {
    const parentMap = new Map<string, Map<string, PendingLotRow[]>>();
    for (const row of rows) {
      const parentLabel =
        groupingContextByLotId?.[row.id] ??
        (view === "AUCTION_DISPATCH" ? "Unspecified Auction Centre" : "Unspecified Buyer");
      const markLabel = row.mark || "-";
      if (!parentMap.has(parentLabel)) parentMap.set(parentLabel, new Map<string, PendingLotRow[]>());
      const markMap = parentMap.get(parentLabel)!;
      const current = markMap.get(markLabel) ?? [];
      current.push(row);
      markMap.set(markLabel, current);
    }

    return Array.from(parentMap.entries())
      .map(([parentLabel, markMap]) => ({
        parentLabel,
        markGroups: Array.from(markMap.entries())
          .map(([mark, lots]) => ({
            mark,
            lots: lots.sort((a, b) => a.invoice_number.localeCompare(b.invoice_number)),
            totalBags: lots.reduce((sum, lot) => sum + Number(lot.bags ?? 0), 0),
            totalWeight: lots.reduce((sum, lot) => sum + Number(lot.net_weight_kg ?? 0), 0)
          }))
          .sort((a, b) => {
            if (b.totalBags !== a.totalBags) return b.totalBags - a.totalBags;
            if (b.totalWeight !== a.totalWeight) return b.totalWeight - a.totalWeight;
            return a.mark.localeCompare(b.mark);
          })
      }))
      .sort((a, b) => {
        const aBags = a.markGroups.reduce((sum, group) => sum + group.totalBags, 0);
        const bBags = b.markGroups.reduce((sum, group) => sum + group.totalBags, 0);
        if (bBags !== aBags) return bBags - aBags;
        const aWeight = a.markGroups.reduce((sum, group) => sum + group.totalWeight, 0);
        const bWeight = b.markGroups.reduce((sum, group) => sum + group.totalWeight, 0);
        if (bWeight !== aWeight) return bWeight - aWeight;
        return a.parentLabel.localeCompare(b.parentLabel);
      });
  }, [groupingContextByLotId, rows, view]);
  const actionOptions = useMemo(
    () =>
      (Object.keys(actionFieldConfig) as ActionName[]).map((action) => ({
        label: formatActionName(action),
        value: action
      })),
    []
  );
  const samplingPartyOptions = useMemo(
    () =>
      Array.from(
        new Set([...(partyOptions?.buyers ?? []), ...(partyOptions?.brokers ?? [])].map((n) => String(n || "").trim()).filter(Boolean))
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
  const brokerSelectOptions = useMemo(
    () => (partyOptions?.brokers ?? []).map((name) => ({ label: name, value: name })),
    [partyOptions?.brokers]
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

  const lotColumns: ColumnsType<PendingLotRow> = [
    { title: "Lot No.", dataIndex: "invoice_number", key: "invoice_number", width: 150 },
    { title: "Grade", dataIndex: "grade", key: "grade", width: 140 },
    { title: "Bags", dataIndex: "bags", key: "bags", width: 100 },
    { title: "Weight", dataIndex: "net_weight_kg", key: "net_weight_kg", width: 120 },
    {
      title: "Packing Date",
      dataIndex: "date_created",
      key: "date_created",
      width: 140,
      render: (value: string) => formatPackingDate(value)
    },
    {
      title: "Action",
      key: "action",
      width: 390,
      render: (_, row) => {
        return (
          <Space size={8}>
            <Button
              size="small"
              disabled={view !== "AUCTION_DISPATCH"}
              onClick={() => {
                setDispatchLot(row);
                setDispatchForm({
                  dispatch_date: new Date().toISOString().slice(0, 10),
                  transporter: "",
                  remarks: ""
                });
              }}
            >
              Dispatch
            </Button>
            <Link href={`/lots/${row.id}`}>
              <Button size="small">View</Button>
            </Link>
            <Button
              size="small"
              onClick={() => {
                setManageLot(row);
                setSelectedAction(view === "AUCTION_DISPATCH" ? "AUCTION_DISPATCHED" : "SOLD_PRIVATE");
                setActionData(buildInitialActionData(view === "AUCTION_DISPATCH" ? "AUCTION_DISPATCHED" : "SOLD_PRIVATE"));
                setActionSelectOpen(true);
              }}
            >
              Manage Lot
            </Button>
            <Popconfirm
              title="Delete this action only?"
              description="Lot will remain. Only latest action can be deleted."
              okText="Delete Action"
              okButtonProps={{ danger: true, loading: deleteActionMutation.isPending }}
              cancelText="Cancel"
              onConfirm={async () => {
                await deleteActionMutation.mutateAsync({ lotId: row.id, view });
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
    <AppShell title="Pending Dispatches">
      <Card variant="borderless">
        <Space direction="vertical" style={{ width: "100%" }} size="middle">
          <Segmented
            value={view}
            onChange={(v) => {
              setView(v as "AUCTION_DISPATCH" | "PRIVATE");
              setPage(1);
            }}
            options={[
              { label: "Auction", value: "AUCTION_DISPATCH" },
              { label: "Private", value: "PRIVATE" }
            ]}
          />

          <Typography.Title level={4} style={{ margin: 0 }}>
            {view === "AUCTION_DISPATCH" ? "Auction" : "Private"}
          </Typography.Title>

          {isLoading ? <Spin /> : null}
          {!isLoading && isGroupingContextLoading ? <Spin /> : null}
          {!isLoading && rows.length === 0 ? <Empty description="No dispatch-pending lots" /> : null}

          {!isLoading
            ? groups.map((group) => (
                <Card
                  key={`${view}-${group.parentLabel}`}
                  size="small"
                  title={<Typography.Text strong>{group.parentLabel}</Typography.Text>}
                >
                  <Space direction="vertical" size={12} style={{ width: "100%" }}>
                    {group.markGroups.map((markGroup) => (
                      <Card
                        key={`${view}-${group.parentLabel}-${markGroup.mark}`}
                        size="small"
                        title={
                          <Space>
                            <Typography.Text strong>{markGroup.mark}</Typography.Text>
                            <Tag color={view === "AUCTION_DISPATCH" ? "gold" : "volcano"}>
                              Total Bags: {markGroup.totalBags}
                            </Tag>
                            <Tag color="blue">Total Weight: {markGroup.totalWeight} kgs</Tag>
                          </Space>
                        }
                      >
                        <Table
                          rowKey="id"
                          columns={lotColumns}
                          dataSource={markGroup.lots}
                          pagination={false}
                          size="small"
                          scroll={{ x: 920 }}
                        />
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
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                style={{ marginRight: 8 }}
              >
                Previous
              </Button>
              <Button
                disabled={page * pageSize >= total}
                onClick={() => setPage((p) => p + 1)}
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
          setManageLot(null);
          setActionData({});
        }}
        placement="right"
        footer={
          actionDetailsOpen ? (
            <Space style={{ width: "100%", justifyContent: "space-between" }}>
              <Button
                onClick={() => {
                  setActionDetailsOpen(false);
                  setActionSelectOpen(true);
                }}
              >
                Back
              </Button>
              <Button
                type="primary"
                loading={manageMutation.isPending}
                onClick={async () => {
                  if (!manageLot?.id) return;
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
                  await manageMutation.mutateAsync({
                    lotId: manageLot.id,
                    action: selectedAction,
                    data: actionData
                  });
                }}
              >
                Save Action
              </Button>
            </Space>
          ) : (
            <Space style={{ width: "100%", justifyContent: "flex-end" }}>
              <Button onClick={() => setActionSelectOpen(false)}>Cancel</Button>
            </Space>
          )
        }
      >
        {!actionDetailsOpen ? (
          <Space direction="vertical" style={{ width: "100%" }} size={12}>
            <Card size="small" style={{ background: "#fafafa" }}>
              <Typography.Text type="secondary">Selected Lot</Typography.Text>
              <br />
              <Typography.Text strong>
                {manageLot ? `${manageLot.mark} / ${manageLot.invoice_number}` : "No lot selected"}
              </Typography.Text>
            </Card>
            <Typography.Text type="secondary">Choose an action</Typography.Text>
            <Select
              size="large"
              value={selectedAction}
              onChange={(v) => {
                setSelectedAction(v);
                setActionData(buildInitialActionData(v));
                setActionSelectOpen(false);
                setActionDetailsOpen(true);
              }}
              options={actionOptions}
              {...modalSelectProps}
            />
          </Space>
        ) : (
          <Space direction="vertical" style={{ width: "100%" }} size={12}>
            <Card size="small" style={{ background: "#fafafa" }}>
              <Typography.Text type="secondary">Action</Typography.Text>
              <br />
              <Typography.Text strong>{formatActionName(selectedAction)}</Typography.Text>
              <br />
              <Typography.Text type="secondary">
                Lot: {manageLot ? `${manageLot.mark} / ${manageLot.invoice_number}` : "-"}
              </Typography.Text>
            </Card>

            {actionFieldConfig[selectedAction].map((field) => (
              <div key={field.key}>
                <Typography.Text type="secondary">
                  {field.label}
                  {field.required ? " *" : ""}
                </Typography.Text>
                {field.type === "text" ? (
                  field.key === "broker" ? (
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
                      <Input placeholder="Search buyer/broker" value={partySearch} onChange={(e) => setPartySearch(e.target.value)} />
                      <div style={{ maxHeight: 220, overflowY: "auto", border: "1px solid #f0f0f0", borderRadius: 8, padding: 8 }}>
                        <Checkbox.Group
                          style={{ width: "100%" }}
                          value={Array.isArray(actionData[field.key]) ? (actionData[field.key] as string[]) : []}
                          options={filteredSamplingPartyOptions}
                          onChange={(vals) => setActionData((prev) => ({ ...prev, [field.key]: vals.map((v) => String(v)) }))}
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
              </div>
            ))}
          </Space>
        )}
      </Drawer>

      {dispatchLot ? (
        <Card
          size="small"
          style={{ position: "fixed", right: 16, bottom: 16, width: 420, zIndex: 50, boxShadow: "0 10px 30px rgba(0,0,0,0.2)" }}
          title={`Dispatch: ${dispatchLot.mark}/${dispatchLot.invoice_number}`}
          extra={<Button size="small" onClick={() => setDispatchLot(null)}>Close</Button>}
        >
          <Space direction="vertical" style={{ width: "100%" }} size={10}>
            <Card
              size="small"
              style={{
                background: latestPreparedAdvice ? "#f6ffed" : "#fff2e8",
                borderColor: latestPreparedAdvice ? "#b7eb8f" : "#ffbb96"
              }}
            >
              <Typography.Text strong>Dispatch Advice Context</Typography.Text>
              <br />
              {dispatchContextLoading ? (
                <Typography.Text type="secondary">Loading...</Typography.Text>
              ) : (
                <Typography.Text type={latestPreparedAdvice ? "secondary" : "warning"}>
                  {latestPreparedAdvice
                    ? `${latestPreparedAdvice.advice_date || "-"} | ${latestPreparedAdvice.broker || "-"} | ${latestPreparedAdvice.warehouse || "-"} | ${latestPreparedAdvice.auction_centre || "-"}`
                    : "Dispatch advice not found; proceed carefully."}
                </Typography.Text>
              )}
            </Card>

            <div>
              <Typography.Text type="secondary">Dispatch date *</Typography.Text>
              <Input
                type="date"
                value={dispatchForm.dispatch_date}
                onChange={(e) => setDispatchForm((prev) => ({ ...prev, dispatch_date: e.target.value }))}
              />
            </div>
            <div>
              <Typography.Text type="secondary">Transporter *</Typography.Text>
              <Input
                value={dispatchForm.transporter}
                onChange={(e) => setDispatchForm((prev) => ({ ...prev, transporter: e.target.value }))}
              />
            </div>
            <div>
              <Typography.Text type="secondary">Remarks</Typography.Text>
              <Input
                value={dispatchForm.remarks}
                onChange={(e) => setDispatchForm((prev) => ({ ...prev, remarks: e.target.value }))}
              />
            </div>

            <Space style={{ justifyContent: "flex-end", width: "100%" }}>
              <Button onClick={() => setDispatchLot(null)}>Cancel</Button>
              <Button
                type="primary"
                loading={dispatchMutation.isPending}
                onClick={async () => {
                  if (!dispatchLot?.id) return;
                  if (!dispatchForm.dispatch_date.trim()) {
                    message.error("Dispatch date is required");
                    return;
                  }
                  if (!dispatchForm.transporter.trim()) {
                    message.error("Transporter is required");
                    return;
                  }
                  await dispatchMutation.mutateAsync({
                    lotId: dispatchLot.id,
                    data: {
                      dispatch_date: dispatchForm.dispatch_date,
                      transporter: dispatchForm.transporter,
                      remarks: dispatchForm.remarks || undefined
                    }
                  });
                }}
              >
                Dispatch
              </Button>
            </Space>
          </Space>
        </Card>
      ) : null}
    </AppShell>
  );
}
