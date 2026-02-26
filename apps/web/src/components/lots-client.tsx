"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { ColumnsType } from "antd/es/table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FilterOutlined } from "@ant-design/icons";
import { App, Button, Card, Col, Dropdown, Input, InputNumber, Modal, Popover, Row, Select, Space, Table, Tag, Typography } from "antd";
import { fetchJson } from "@/lib/fetcher";

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
  auction_status_badge?: string | null;
  private_status_badge?: string | null;
  master_status?: string;
};

type ActionName =
  | "SAMPLING"
  | "DISPATCH_TO_AUCTION"
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

const actionFieldConfig: Record<ActionName, ActionField[]> = {
  SAMPLING: [
    { key: "parties", label: "Parties (buyers/brokers)", type: "tags", required: true },
    { key: "sampling_date", label: "Date of sampling", type: "date", required: true },
    { key: "remarks", label: "Remarks", type: "text" }
  ],
  DISPATCH_TO_AUCTION: [
    { key: "dispatch_date", label: "Date of dispatch", type: "date", required: true },
    { key: "broker", label: "Broker", type: "text", required: true },
    { key: "warehouse", label: "Warehouse", type: "text", required: true },
    { key: "auction_centre", label: "Auction Centre", type: "text", required: true },
    { key: "transporter", label: "Transporter", type: "text" },
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
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string[]>([]);
  const [actionModalOpen, setActionModalOpen] = useState(false);
  const [selectedAction, setSelectedAction] = useState<ActionName>("SAMPLING");
  const [actionData, setActionData] = useState<Record<string, unknown>>({});
  const [bulkActionModalOpen, setBulkActionModalOpen] = useState(false);
  const [bulkSelectedAction, setBulkSelectedAction] = useState<ActionName>("SAMPLING");
  const [bulkActionData, setBulkActionData] = useState<Record<string, unknown>>({});
  const queryClient = useQueryClient();
  const router = useRouter();
  const { message, modal } = App.useApp();

  const pageSize = 20;

  const { data: filterOptions } = useQuery({
    queryKey: ["lot-filter-options"],
    queryFn: () => fetchJson<{ marks: string[]; factories: string[]; grades: string[] }>("/api/lots/filter-options")
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
    mutationFn: (payload: { lotId: string; action: ActionName; data: Record<string, unknown> }) =>
      fetchJson(`/api/lots/${payload.lotId}/actions`, {
        method: "POST",
        body: JSON.stringify({ action: payload.action, data: payload.data })
      }),
    onSuccess: async () => {
      message.success("Action executed");
      await invalidate();
      setActionModalOpen(false);
      setActionData({});
    }
  });
  const runBulkAction = useMutation({
    mutationFn: async (payload: { lotIds: string[]; action: ActionName; data: Record<string, unknown> }) =>
      Promise.all(
        payload.lotIds.map((lotId) =>
          fetchJson(`/api/lots/${lotId}/actions`, {
            method: "POST",
            body: JSON.stringify({ action: payload.action, data: payload.data })
          })
        )
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
  const selectedLotId = selected.length === 1 ? selected[0] : null;

  const gradeItems = useMemo(
    () => [
      { key: "__ALL__", label: "All grades" },
      ...(filterOptions?.grades ?? []).map((grade) => ({ key: grade, label: grade }))
    ],
    [filterOptions?.grades]
  );

  const statusItems = useMemo(
    () => [
      { key: "__ALL__", label: "All statuses" },
      { key: "PENDING", label: "PENDING" },
      { key: "IN_TRANSIT", label: "IN_TRANSIT" },
      { key: "AWR_PENDING", label: "AWR_PENDING" },
      { key: "AWR_RECEIVED", label: "AWR_RECEIVED" },
      { key: "CATALOGUED", label: "CATALOGUED" },
      { key: "RESERVE_SET", label: "RESERVE_SET" },
      { key: "AUCTION_SCHEDULED", label: "AUCTION_SCHEDULED" },
      { key: "SOLD_AUCTION", label: "SOLD_AUCTION" },
      { key: "OUT", label: "OUT" },
      { key: "HOLD", label: "HOLD" },
      { key: "REPRINT", label: "REPRINT" },
      { key: "WITHDRAW", label: "WITHDRAW" },
      { key: "SAMPLING_SENT", label: "SAMPLING_SENT" },
      { key: "NEGOTIATING", label: "NEGOTIATING" },
      { key: "SOLD_PENDING_DISPATCH", label: "SOLD_PENDING_DISPATCH" },
      { key: "SOLD", label: "SOLD" },
      { key: "CANCELLED", label: "Cancelled" },
      { key: "CLOSED", label: "CLOSED" }
    ],
    []
  );
  const actionOptions = useMemo(
    () =>
      (Object.keys(actionFieldConfig) as ActionName[]).map((action) => ({
        label: action.replaceAll("_", " "),
        value: action
      })),
    []
  );
  const bulkActionOptions = useMemo(
    () =>
      actionOptions.filter((option) => option.value !== "REINVOICED"),
    [actionOptions]
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
            label="Weight"
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
          const statuses = row.active_statuses?.length ? row.active_statuses : row.lifecycle_status ? [row.lifecycle_status] : ["PENDING"];
          return (
            <Space size={[4, 4]} wrap>
              {statuses.map((s) => (
                <Tag key={`${row.id}-${s}`} color={s === "CANCELLED" ? "red" : s === "CLOSED" ? "blue" : "green"}>
                  {s}
                </Tag>
              ))}
              {(row.warnings ?? []).map((w) => (
                <Tag key={`${row.id}-${w}`} color="orange">
                  {w}
                </Tag>
              ))}
            </Space>
          );
        }
      },
      {
        title: "Action",
        key: "open",
        width: 260,
        render: (_, row) => (
          <Space size={8}>
            <Button
              size="small"
              onClick={() => {
                setSelected([row.id]);
                setSelectedAction("SAMPLING");
                setActionData({});
                setActionModalOpen(true);
              }}
            >
              Manage
            </Button>
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
        )
      }
    ],
    [bagsMax, bagsMin, deleteLot, gradeFilter, gradeItems, modal, packingDateFrom, packingDateTo, statusFilter, statusItems, weightMax, weightMin]
  );

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <Card title="Filters" variant="borderless">
        <Row gutter={[12, 12]}>
          <Col xs={24} md={6}>
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
          <Col xs={24} md={10}>
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
          <Col xs={24} md={8}>
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
                onClick={() => {
                  setBulkSelectedAction("SAMPLING");
                  setBulkActionData({});
                  setBulkActionModalOpen(true);
                }}
              >
                Bulk Take Action
              </Button>
              <Button onClick={() => setSelected([])}>Clear Selection</Button>
            </Space>
          </Card>
        </div>
      ) : null}

      <Modal
        title="Take Action"
        open={actionModalOpen}
        onCancel={() => setActionModalOpen(false)}
        onOk={async () => {
          if (!selectedLotId) return;
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
          await runAction.mutateAsync({
            lotId: selectedLotId,
            action: selectedAction,
            data: actionData
          });
        }}
        okButtonProps={{ loading: runAction.isPending }}
      >
        <Space direction="vertical" style={{ width: "100%" }}>
          <Select
            value={selectedAction}
            onChange={(v) => {
              setSelectedAction(v);
              setActionData({});
            }}
            options={actionOptions}
          />
          {actionFieldConfig[selectedAction].map((field) => (
            <div key={field.key}>
              <Typography.Text type="secondary">
                {field.label}
                {field.required ? " *" : ""}
              </Typography.Text>
              {field.type === "text" ? (
                <Input
                  value={String(actionData[field.key] ?? "")}
                  onChange={(e) => setActionData((prev) => ({ ...prev, [field.key]: e.target.value }))}
                />
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
                <Select
                  mode="tags"
                  value={Array.isArray(actionData[field.key]) ? (actionData[field.key] as string[]) : []}
                  onChange={(v) => setActionData((prev) => ({ ...prev, [field.key]: v }))}
                />
              ) : null}
            </div>
          ))}
        </Space>
      </Modal>

      <Modal
        title={`Bulk Take Action (${selected.length} lots)`}
        open={bulkActionModalOpen}
        onCancel={() => setBulkActionModalOpen(false)}
        onOk={async () => {
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
          await runBulkAction.mutateAsync({
            lotIds: selected,
            action: bulkSelectedAction,
            data: bulkActionData
          });
        }}
        okButtonProps={{ loading: runBulkAction.isPending }}
      >
        <Space direction="vertical" style={{ width: "100%" }}>
          <Select
            value={bulkSelectedAction}
            onChange={(v) => {
              setBulkSelectedAction(v);
              setBulkActionData({});
            }}
            options={bulkActionOptions}
          />
          {actionFieldConfig[bulkSelectedAction].map((field) => (
            <div key={field.key}>
              <Typography.Text type="secondary">
                {field.label}
                {field.required ? " *" : ""}
              </Typography.Text>
              {field.type === "text" ? (
                <Input
                  value={String(bulkActionData[field.key] ?? "")}
                  onChange={(e) => setBulkActionData((prev) => ({ ...prev, [field.key]: e.target.value }))}
                />
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
                  onChange={(v) => setBulkActionData((prev) => ({ ...prev, [field.key]: v ?? null }))}
                />
              ) : null}
              {field.type === "tags" ? (
                <Select
                  mode="tags"
                  value={Array.isArray(bulkActionData[field.key]) ? (bulkActionData[field.key] as string[]) : []}
                  onChange={(v) => setBulkActionData((prev) => ({ ...prev, [field.key]: v }))}
                />
              ) : null}
            </div>
          ))}
        </Space>
      </Modal>

    </Space>
  );
}
