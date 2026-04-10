"use client";

import Link from "next/link";
import { KeyboardEvent as ReactKeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { App, Alert, Button, Card, Empty, Modal, Popconfirm, Space, Table, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { fetchJson } from "@/lib/fetcher";

type SaleDeskCommittedResult = {
  action_id: string;
  action: "OUT" | "SOLD_AUCTION_LIVE" | "FINALIZE_SOLD_AUCTION" | "SOLD_AUCTION";
  status: "OUT" | "SOLD_AUCTION_PENDING_DETAILS" | "SOLD_AUCTION";
  sale_no: string | null;
  sale_date: string | null;
  out_date: string | null;
  buyer_name: string | null;
  hammer_price: number | null;
  out_price: number | null;
  settlement_due_date: string | null;
  remarks: string | null;
};

type SaleDeskRow = {
  lot_id: string;
  mark: string;
  invoice_number: string;
  grade: string;
  bags: number;
  net_weight_kg: number;
  reserve_price: number | null;
  sale_no: string;
  auction_centre: string;
  auction_lane_status: string;
  active_statuses: string[];
  committed_result: SaleDeskCommittedResult | null;
  can_capture_live: boolean;
};

type SaleDeskResponse = {
  auction_centre: string;
  sale_no: string;
  pending_details_supported: boolean;
  rows: SaleDeskRow[];
};

type LiveDraftRow = {
  result: "" | "SOLD" | "OUT";
  buyer_name: string;
  hammer_price: string;
  out_price: string;
};

type PersistedLiveDraft = {
  sale_date: string;
  rows: Record<string, LiveDraftRow>;
};

type FinalizeDraftRow = {
  sale_no: string;
  sale_date: string;
  buyer_name: string;
  hammer_price: string;
  settlement_due_date: string;
  remarks: string;
};

type CommitRequestRow = {
  lot_id: string;
  result: "SOLD" | "OUT";
  buyer_name?: string;
  hammer_price?: number;
  out_price?: number;
};

type CommitReview = {
  issues: string[];
  rows: CommitRequestRow[];
  soldCount: number;
  outCount: number;
};

type FieldName = "result" | "buyer_name" | "hammer_price" | "out_price";

const emptyLiveDraft: LiveDraftRow = {
  result: "",
  buyer_name: "",
  hammer_price: "",
  out_price: ""
};

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeText(value: unknown): string {
  return String(value ?? "").trim();
}

function parseOptionalNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined) return "-";
  return Number(value).toFixed(2);
}

function formatQuantity(value: number): string {
  return `${Number(value ?? 0).toFixed(3)} kgs`;
}

function formatStatusLabel(status: string): string {
  if (!status) return "-";
  if (status === "SOLD_AUCTION_PENDING_DETAILS") return "SOLD PENDING DETAILS";
  return status.replaceAll("_", " ");
}

function getStatusColor(status: string): string {
  if (status === "OUT") return "orange";
  if (status === "SOLD_AUCTION_PENDING_DETAILS") return "blue";
  if (status === "SOLD_AUCTION") return "green";
  if (status === "RESERVE_SET") return "gold";
  if (status === "REPRINT") return "purple";
  return "geekblue";
}

function hasLiveDraftValue(draft: LiveDraftRow | undefined): boolean {
  if (!draft) return false;
  return Boolean(draft.result || normalizeText(draft.buyer_name) || normalizeText(draft.hammer_price) || normalizeText(draft.out_price));
}

function sanitizeLiveDraftRows(rows: Record<string, LiveDraftRow>): Record<string, LiveDraftRow> {
  return Object.fromEntries(Object.entries(rows).filter(([, value]) => hasLiveDraftValue(value)));
}

function buildFinalizeDraft(row: SaleDeskRow): FinalizeDraftRow {
  const committed = row.committed_result;
  return {
    sale_no: committed?.sale_no ?? row.sale_no ?? "",
    sale_date: committed?.sale_date ?? "",
    buyer_name: committed?.buyer_name ?? "",
    hammer_price: committed?.hammer_price === null || committed?.hammer_price === undefined ? "" : String(committed.hammer_price),
    settlement_due_date: committed?.settlement_due_date ?? "",
    remarks: committed?.remarks ?? ""
  };
}

function buildCommitReview(rows: SaleDeskRow[], draftRows: Record<string, LiveDraftRow>): CommitReview {
  const issues: string[] = [];
  const requestRows: CommitRequestRow[] = [];

  for (const row of rows) {
    const draft = draftRows[row.lot_id] ?? emptyLiveDraft;
    if (draft.result !== "SOLD" && draft.result !== "OUT") {
      issues.push(`${row.invoice_number}: choose Sold or Out.`);
      continue;
    }

    if (draft.result === "SOLD") {
      const buyerName = normalizeText(draft.buyer_name);
      const hammerPrice = parseOptionalNumber(draft.hammer_price);
      if (!buyerName) {
        issues.push(`${row.invoice_number}: buyer name is required.`);
        continue;
      }
      if (hammerPrice === null || hammerPrice <= 0) {
        issues.push(`${row.invoice_number}: hammer price must be greater than 0.`);
        continue;
      }
      requestRows.push({
        lot_id: row.lot_id,
        result: "SOLD",
        buyer_name: buyerName,
        hammer_price: hammerPrice
      });
      continue;
    }

    const outPrice = parseOptionalNumber(draft.out_price);
    if (outPrice === null || outPrice < 0) {
      issues.push(`${row.invoice_number}: out price must be 0 or greater.`);
      continue;
    }
    requestRows.push({
      lot_id: row.lot_id,
      result: "OUT",
      out_price: outPrice
    });
  }

  return {
    issues,
    rows: requestRows,
    soldCount: requestRows.filter((row) => row.result === "SOLD").length,
    outCount: requestRows.filter((row) => row.result === "OUT").length
  };
}

class RequestError extends Error {
  status: number;
  payload: Record<string, unknown>;

  constructor(message: string, status: number, payload: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.payload = payload;
  }
}

async function postCommitRequest(body: {
  auction_centre: string;
  sale_no: string;
  sale_date: string;
  rows: CommitRequestRow[];
}) {
  const response = await fetch("/api/auction-sales/live/commit", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const message =
      (typeof payload.error === "string" && payload.error) ||
      (typeof payload.message === "string" && payload.message) ||
      `Request failed: ${response.status}`;
    throw new RequestError(message, response.status, payload);
  }
  return payload;
}

export function AuctionSaleDeskClient({
  auctionCentre,
  saleNo
}: {
  auctionCentre: string;
  saleNo: string;
}) {
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const draftStorageKey = `auction-sale-draft:${auctionCentre}:${saleNo}`;
  const today = todayIsoDate();

  const [mode, setMode] = useState<"live" | "finalize">("live");
  const [saleDate, setSaleDate] = useState(today);
  const [liveDraftRows, setLiveDraftRows] = useState<Record<string, LiveDraftRow>>({});
  const [pendingDraft, setPendingDraft] = useState<PersistedLiveDraft | null>(null);
  const [draftChoicePending, setDraftChoicePending] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [activeRowId, setActiveRowId] = useState<string | null>(null);
  const [selectedFinalizeLotIds, setSelectedFinalizeLotIds] = useState<string[]>([]);
  const [bulkSettlementDueDate, setBulkSettlementDueDate] = useState("");
  const [finalizeDrafts, setFinalizeDrafts] = useState<Record<string, FinalizeDraftRow>>({});
  const fieldRefs = useRef<Record<string, HTMLInputElement | HTMLSelectElement | null>>({});

  const { data, isLoading, error } = useQuery({
    queryKey: ["auction-sale-live", auctionCentre, saleNo],
    queryFn: () =>
      fetchJson<SaleDeskResponse>(
        `/api/auction-sales/live?auctionCentre=${encodeURIComponent(auctionCentre)}&saleNo=${encodeURIComponent(saleNo)}`
      )
  });

  const { data: partyOptions } = useQuery({
    queryKey: ["party-options-auction-sale-desk"],
    queryFn: () => fetchJson<{ buyers: string[]; brokers: string[] }>("/api/parties/options")
  });

  const rows = useMemo(() => data?.rows ?? [], [data?.rows]);
  const pendingDetailsSupported = data?.pending_details_supported ?? true;
  const editableRows = useMemo(() => rows.filter((row) => row.can_capture_live), [rows]);
  const finalizeRows = useMemo(
    () => rows.filter((row) => row.auction_lane_status === "SOLD_AUCTION_PENDING_DETAILS"),
    [rows]
  );
  const review = useMemo(() => buildCommitReview(editableRows, liveDraftRows), [editableRows, liveDraftRows]);
  const reviewIssues = useMemo(() => {
    const issues = [...review.issues];
    if (!pendingDetailsSupported && review.rows.some((row) => row.result === "SOLD")) {
      issues.unshift(
        "Live sold capture is unavailable until migration 0008 adds SOLD_AUCTION_PENDING_DETAILS to lot_global_status."
      );
    }
    return issues;
  }, [pendingDetailsSupported, review.issues, review.rows]);
  const savedLiveDraftRows = useMemo(() => sanitizeLiveDraftRows(liveDraftRows), [liveDraftRows]);

  const summary = useMemo(() => {
    const committedSold = rows.filter(
      (row) => row.auction_lane_status === "SOLD_AUCTION_PENDING_DETAILS" || row.auction_lane_status === "SOLD_AUCTION"
    ).length;
    const committedOut = rows.filter((row) => row.auction_lane_status === "OUT").length;
    return {
      unresolvedCount: editableRows.length - review.rows.length,
      soldCount: committedSold + review.soldCount,
      outCount: committedOut + review.outCount
    };
  }, [editableRows.length, review.outCount, review.rows.length, review.soldCount, rows]);

  const canReviewCommit = editableRows.length > 0 && !draftChoicePending && Boolean(normalizeText(saleDate)) && reviewIssues.length === 0;

  useEffect(() => {
    const firstEditable = editableRows[0]?.lot_id ?? rows[0]?.lot_id ?? null;
    if (!firstEditable) {
      setActiveRowId(null);
      return;
    }
    if (!activeRowId || !rows.some((row) => row.lot_id === activeRowId)) {
      setActiveRowId(firstEditable);
    }
  }, [activeRowId, editableRows, rows]);

  useEffect(() => {
    setSaleDate(today);
    setLiveDraftRows({});
    setPendingDraft(null);
    setDraftChoicePending(false);
    setReviewOpen(false);
    setSelectedFinalizeLotIds([]);
    setBulkSettlementDueDate("");

    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem(draftStorageKey);
    if (!raw) return;

    try {
      const parsed = JSON.parse(raw) as PersistedLiveDraft;
      if (parsed && typeof parsed === "object" && parsed.rows && typeof parsed.rows === "object") {
        setPendingDraft(parsed);
        setDraftChoicePending(true);
      }
    } catch {
      window.localStorage.removeItem(draftStorageKey);
    }
  }, [draftStorageKey, today]);

  useEffect(() => {
    setFinalizeDrafts((current) => {
      const next: Record<string, FinalizeDraftRow> = {};
      for (const row of finalizeRows) {
        next[row.lot_id] = current[row.lot_id] ?? buildFinalizeDraft(row);
      }
      return next;
    });
  }, [finalizeRows]);

  useEffect(() => {
    if (typeof window === "undefined" || draftChoicePending) return;
    if (!Object.keys(savedLiveDraftRows).length) {
      window.localStorage.removeItem(draftStorageKey);
      return;
    }
    window.localStorage.setItem(
      draftStorageKey,
      JSON.stringify({
        sale_date: saleDate,
        rows: savedLiveDraftRows
      } satisfies PersistedLiveDraft)
    );
  }, [draftChoicePending, draftStorageKey, saleDate, savedLiveDraftRows]);

  useEffect(() => {
    if (typeof window === "undefined" || draftChoicePending) return;
    if (!Object.keys(savedLiveDraftRows).length) return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [draftChoicePending, savedLiveDraftRows]);

  const invalidateDeskQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["auction-sale-live", auctionCentre, saleNo] }),
      queryClient.invalidateQueries({ queryKey: ["auction-catalogue"] }),
      queryClient.invalidateQueries({ queryKey: ["lots"] }),
      queryClient.invalidateQueries({ queryKey: ["dispatch-pending-lots"] }),
      queryClient.invalidateQueries({ queryKey: ["in-transit-lots"] })
    ]);
  };

  const liveCommitMutation = useMutation({
    mutationFn: () =>
      postCommitRequest({
        auction_centre: auctionCentre,
        sale_no: saleNo,
        sale_date: saleDate,
        rows: review.rows
      }),
    onSuccess: async () => {
      message.success("Live sale results committed.");
      setReviewOpen(false);
      setLiveDraftRows({});
      if (typeof window !== "undefined") {
        window.localStorage.removeItem(draftStorageKey);
      }
      await invalidateDeskQueries();
    },
    onError: async (error: Error) => {
      if (error instanceof RequestError && error.status === 500) {
        const appliedLotIds = Array.isArray(error.payload.appliedLotIds)
          ? error.payload.appliedLotIds.map((value) => String(value))
          : [];
        if (appliedLotIds.length) {
          setLiveDraftRows((current) => {
            const next = { ...current };
            for (const lotId of appliedLotIds) {
              delete next[lotId];
            }
            return next;
          });
          await invalidateDeskQueries();
        }
        message.error(error.message || "Live sale commit failed after partial apply.");
        return;
      }
      message.error(error.message || "Failed to commit live sale results.");
    }
  });

  const finalizeMutation = useMutation({
    mutationFn: async (lotIds: string[]) => {
      const failures: string[] = [];
      let successCount = 0;

      for (const lotId of lotIds) {
        const row = finalizeRows.find((candidate) => candidate.lot_id === lotId);
        const draft = finalizeDrafts[lotId];
        if (!row || !draft) continue;

        const settlementDueDate = normalizeText(draft.settlement_due_date);
        if (!settlementDueDate) {
          failures.push(`${row.invoice_number}: settlement due date is required.`);
          continue;
        }

        try {
          await fetchJson(`/api/lots/${lotId}/actions`, {
            method: "POST",
            body: JSON.stringify({
              action: "FINALIZE_SOLD_AUCTION",
              data: {
                sale_no: normalizeText(draft.sale_no) || undefined,
                sale_date: normalizeText(draft.sale_date) || undefined,
                buyer_name: normalizeText(draft.buyer_name) || undefined,
                hammer_price: parseOptionalNumber(draft.hammer_price) ?? undefined,
                settlement_due_date: settlementDueDate,
                remarks: draft.remarks || undefined
              }
            })
          });
          successCount += 1;
        } catch (error) {
          failures.push(`${row.invoice_number}: ${error instanceof Error ? error.message : "Failed to finalize."}`);
        }
      }

      if (successCount) {
        await invalidateDeskQueries();
      }

      if (failures.length) {
        throw new Error(failures.join(" "));
      }
    },
    onSuccess: () => {
      setSelectedFinalizeLotIds([]);
      setMode("finalize");
      message.success("Sold lots finalized.");
    },
    onError: (error: Error) => {
      message.error(error.message || "Failed to finalize sold lots.");
    }
  });

  const deleteResultMutation = useMutation({
    mutationFn: async (row: SaleDeskRow) => {
      const actionId = row.committed_result?.action_id;
      if (!actionId) {
        throw new Error("No committed sale result is available to delete.");
      }
      return fetchJson(`/api/lots/${row.lot_id}/actions/${actionId}`, {
        method: "DELETE"
      });
    },
    onSuccess: async () => {
      message.success("Latest result deleted.");
      await invalidateDeskQueries();
    },
    onError: (error: Error) => {
      message.error(error.message || "Failed to delete latest result.");
    }
  });

  const registerFieldRef = (lotId: string, field: FieldName, node: HTMLInputElement | HTMLSelectElement | null) => {
    fieldRefs.current[`${lotId}:${field}`] = node;
  };

  const focusField = (lotId: string, field: FieldName) => {
    setActiveRowId(lotId);
    window.requestAnimationFrame(() => {
      const node = fieldRefs.current[`${lotId}:${field}`];
      node?.focus();
      if (node instanceof HTMLInputElement) {
        node.select();
      }
    });
  };

  const updateLiveDraftRow = (lotId: string, updater: (current: LiveDraftRow) => LiveDraftRow) => {
    setLiveDraftRows((current) => {
      const existing = current[lotId] ?? emptyLiveDraft;
      return {
        ...current,
        [lotId]: updater(existing)
      };
    });
  };

  const applyResultSelection = (lotId: string, result: "" | "SOLD" | "OUT") => {
    if (result === "SOLD" && !pendingDetailsSupported) {
      message.error("Sold live capture is unavailable until migration 0008 is applied to the database.");
      return;
    }

    updateLiveDraftRow(lotId, (current) => {
      if (!result) {
        return { ...emptyLiveDraft };
      }
      if (result === "SOLD") {
        return {
          ...current,
          result,
          out_price: ""
        };
      }
      return {
        ...current,
        result,
        buyer_name: "",
        hammer_price: ""
      };
    });

    if (result === "SOLD") {
      focusField(lotId, "buyer_name");
      return;
    }
    if (result === "OUT") {
      focusField(lotId, "out_price");
      return;
    }
    focusField(lotId, "result");
  };

  const moveBetweenEditableRows = (delta: number, preferredField: FieldName = "result") => {
    if (!editableRows.length) return;
    const currentIndex = Math.max(
      0,
      editableRows.findIndex((row) => row.lot_id === activeRowId)
    );
    const nextIndex = Math.min(editableRows.length - 1, Math.max(0, currentIndex + delta));
    const nextRow = editableRows[nextIndex];
    if (!nextRow) return;

    const nextDraft = liveDraftRows[nextRow.lot_id] ?? emptyLiveDraft;
    if (preferredField === "result") {
      focusField(nextRow.lot_id, "result");
      return;
    }
    if (preferredField === "buyer_name" && nextDraft.result === "SOLD") {
      focusField(nextRow.lot_id, "buyer_name");
      return;
    }
    if (preferredField === "out_price" && nextDraft.result === "OUT") {
      focusField(nextRow.lot_id, "out_price");
      return;
    }
    if (nextDraft.result === "SOLD") {
      focusField(nextRow.lot_id, "buyer_name");
      return;
    }
    if (nextDraft.result === "OUT") {
      focusField(nextRow.lot_id, "out_price");
      return;
    }
    focusField(nextRow.lot_id, "result");
  };

  const focusNextField = (lotId: string, field: FieldName) => {
    const draft = liveDraftRows[lotId] ?? emptyLiveDraft;
    const orderedFields: FieldName[] = draft.result === "SOLD" ? ["buyer_name", "hammer_price"] : draft.result === "OUT" ? ["out_price"] : [];
    const currentIndex = orderedFields.indexOf(field);
    if (currentIndex >= 0 && currentIndex < orderedFields.length - 1) {
      focusField(lotId, orderedFields[currentIndex + 1] as FieldName);
      return;
    }
    moveBetweenEditableRows(1);
  };

  const handleLiveDeskKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (mode !== "live" || draftChoicePending) return;
    const target = event.target as HTMLElement;
    const isTextEntry =
      target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;

    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      if (!canReviewCommit) {
        message.error("Complete every unresolved lot before reviewing the sale commit.");
        return;
      }
      setReviewOpen(true);
      return;
    }

    if (isTextEntry) return;
    if (!activeRowId) return;

    if (event.key === "s" || event.key === "S") {
      event.preventDefault();
      applyResultSelection(activeRowId, "SOLD");
      return;
    }

    if (event.key === "o" || event.key === "O") {
      event.preventDefault();
      applyResultSelection(activeRowId, "OUT");
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      applyResultSelection(activeRowId, "");
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      moveBetweenEditableRows(-1);
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveBetweenEditableRows(1);
    }
  };

  const liveColumns: ColumnsType<SaleDeskRow> = [
    { title: "Lot No.", dataIndex: "invoice_number", key: "invoice_number", width: 120 },
    { title: "Mark", dataIndex: "mark", key: "mark", width: 140 },
    { title: "Grade", dataIndex: "grade", key: "grade", width: 90 },
    { title: "Bags", dataIndex: "bags", key: "bags", width: 80 },
    {
      title: "Quantity",
      dataIndex: "net_weight_kg",
      key: "net_weight_kg",
      width: 130,
      render: (value: number) => formatQuantity(value)
    },
    {
      title: "Reserve Price",
      dataIndex: "reserve_price",
      key: "reserve_price",
      width: 120,
      render: (value: number | null) => formatCurrency(value)
    },
    {
      title: "Current Committed Status",
      key: "auction_lane_status",
      width: 180,
      render: (_, row) => (
        <Space direction="vertical" size={4}>
          <Tag color={getStatusColor(row.auction_lane_status)}>{formatStatusLabel(row.auction_lane_status)}</Tag>
          {row.committed_result?.settlement_due_date ? (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              Settlement: {row.committed_result.settlement_due_date}
            </Typography.Text>
          ) : null}
        </Space>
      )
    },
    {
      title: "Staged Result",
      key: "result",
      width: 130,
      render: (_, row) => {
        if (!row.can_capture_live) {
          return (
            <Typography.Text>{row.auction_lane_status === "OUT" ? "Out" : "Sold"}</Typography.Text>
          );
        }
        const draft = liveDraftRows[row.lot_id] ?? emptyLiveDraft;
        return (
          <select
            ref={(node) => registerFieldRef(row.lot_id, "result", node)}
            value={draft.result}
            onFocus={() => setActiveRowId(row.lot_id)}
            onChange={(event) => applyResultSelection(row.lot_id, event.target.value as LiveDraftRow["result"])}
            onKeyDown={(event) => {
              if (event.key === "ArrowUp") {
                event.preventDefault();
                moveBetweenEditableRows(-1);
              }
              if (event.key === "ArrowDown") {
                event.preventDefault();
                moveBetweenEditableRows(1);
              }
              if (event.key === "Enter") {
                event.preventDefault();
                if (draft.result === "SOLD") {
                  focusField(row.lot_id, "buyer_name");
                  return;
                }
                if (draft.result === "OUT") {
                  focusField(row.lot_id, "out_price");
                  return;
                }
                moveBetweenEditableRows(1);
              }
            }}
            style={{ width: "100%", minHeight: 32 }}
          >
            <option value="">-</option>
            <option value="SOLD" disabled={!pendingDetailsSupported}>
              Sold
            </option>
            <option value="OUT">Out</option>
          </select>
        );
      }
    },
    {
      title: "Buyer",
      key: "buyer_name",
      width: 160,
      render: (_, row) => {
        if (!row.can_capture_live) {
          return row.committed_result?.buyer_name ?? "-";
        }
        const draft = liveDraftRows[row.lot_id] ?? emptyLiveDraft;
        return (
          <input
            ref={(node) => registerFieldRef(row.lot_id, "buyer_name", node)}
            list="auction-sale-desk-buyers"
            value={draft.buyer_name}
            disabled={draft.result !== "SOLD"}
            onFocus={() => setActiveRowId(row.lot_id)}
            onChange={(event) =>
              updateLiveDraftRow(row.lot_id, (current) => ({
                ...current,
                buyer_name: event.target.value
              }))
            }
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                focusNextField(row.lot_id, "buyer_name");
              }
              if (event.key === "ArrowUp") {
                event.preventDefault();
                moveBetweenEditableRows(-1, "buyer_name");
              }
              if (event.key === "ArrowDown") {
                event.preventDefault();
                moveBetweenEditableRows(1, "buyer_name");
              }
              if (event.key === "Escape") {
                event.preventDefault();
                applyResultSelection(row.lot_id, "");
              }
            }}
            style={{ width: "100%", minHeight: 32 }}
          />
        );
      }
    },
    {
      title: "Hammer Price",
      key: "hammer_price",
      width: 140,
      render: (_, row) => {
        if (!row.can_capture_live) {
          return formatCurrency(row.committed_result?.hammer_price);
        }
        const draft = liveDraftRows[row.lot_id] ?? emptyLiveDraft;
        return (
          <input
            ref={(node) => registerFieldRef(row.lot_id, "hammer_price", node)}
            type="number"
            min="0"
            step="0.01"
            value={draft.hammer_price}
            disabled={draft.result !== "SOLD"}
            onFocus={() => setActiveRowId(row.lot_id)}
            onChange={(event) =>
              updateLiveDraftRow(row.lot_id, (current) => ({
                ...current,
                hammer_price: event.target.value
              }))
            }
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                focusNextField(row.lot_id, "hammer_price");
              }
              if (event.key === "ArrowUp") {
                event.preventDefault();
                moveBetweenEditableRows(-1, "hammer_price");
              }
              if (event.key === "ArrowDown") {
                event.preventDefault();
                moveBetweenEditableRows(1, "hammer_price");
              }
              if (event.key === "Escape") {
                event.preventDefault();
                applyResultSelection(row.lot_id, "");
              }
            }}
            style={{ width: "100%", minHeight: 32 }}
          />
        );
      }
    },
    {
      title: "Out Price",
      key: "out_price",
      width: 140,
      render: (_, row) => {
        if (!row.can_capture_live) {
          return formatCurrency(row.committed_result?.out_price);
        }
        const draft = liveDraftRows[row.lot_id] ?? emptyLiveDraft;
        return (
          <input
            ref={(node) => registerFieldRef(row.lot_id, "out_price", node)}
            type="number"
            min="0"
            step="0.01"
            value={draft.out_price}
            disabled={draft.result !== "OUT"}
            onFocus={() => setActiveRowId(row.lot_id)}
            onChange={(event) =>
              updateLiveDraftRow(row.lot_id, (current) => ({
                ...current,
                out_price: event.target.value
              }))
            }
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                focusNextField(row.lot_id, "out_price");
              }
              if (event.key === "ArrowUp") {
                event.preventDefault();
                moveBetweenEditableRows(-1, "out_price");
              }
              if (event.key === "ArrowDown") {
                event.preventDefault();
                moveBetweenEditableRows(1, "out_price");
              }
              if (event.key === "Escape") {
                event.preventDefault();
                applyResultSelection(row.lot_id, "");
              }
            }}
            style={{ width: "100%", minHeight: 32 }}
          />
        );
      }
    },
    {
      title: "Action",
      key: "action",
      width: 150,
      render: (_, row) =>
        row.committed_result ? (
          <Popconfirm
            title="Delete latest result?"
            description="Deleting OUT or the latest sold result will reopen the lot for live capture or finalization."
            okText="Delete Result"
            cancelText="Cancel"
            okButtonProps={{ danger: true, loading: deleteResultMutation.isPending }}
            onConfirm={async () => {
              await deleteResultMutation.mutateAsync(row);
            }}
          >
            <Button size="small" danger>
              Delete Result
            </Button>
          </Popconfirm>
        ) : (
          <Typography.Text type="secondary">-</Typography.Text>
        )
    }
  ];

  const finalizeColumns: ColumnsType<SaleDeskRow> = [
    { title: "Lot No.", dataIndex: "invoice_number", key: "invoice_number", width: 120 },
    { title: "Mark", dataIndex: "mark", key: "mark", width: 140 },
    { title: "Grade", dataIndex: "grade", key: "grade", width: 90 },
    {
      title: "Sale No.",
      key: "sale_no",
      width: 110,
      render: (_, row) => (
        <input
          value={finalizeDrafts[row.lot_id]?.sale_no ?? ""}
          onChange={(event) =>
            setFinalizeDrafts((current) => ({
              ...current,
              [row.lot_id]: {
                ...(current[row.lot_id] ?? buildFinalizeDraft(row)),
                sale_no: event.target.value
              }
            }))
          }
          style={{ width: "100%", minHeight: 32 }}
        />
      )
    },
    {
      title: "Sale Date",
      key: "sale_date",
      width: 130,
      render: (_, row) => (
        <input
          type="date"
          value={finalizeDrafts[row.lot_id]?.sale_date ?? ""}
          onChange={(event) =>
            setFinalizeDrafts((current) => ({
              ...current,
              [row.lot_id]: {
                ...(current[row.lot_id] ?? buildFinalizeDraft(row)),
                sale_date: event.target.value
              }
            }))
          }
          style={{ width: "100%", minHeight: 32 }}
        />
      )
    },
    {
      title: "Buyer",
      key: "buyer_name",
      width: 160,
      render: (_, row) => (
        <input
          list="auction-sale-desk-buyers"
          value={finalizeDrafts[row.lot_id]?.buyer_name ?? ""}
          onChange={(event) =>
            setFinalizeDrafts((current) => ({
              ...current,
              [row.lot_id]: {
                ...(current[row.lot_id] ?? buildFinalizeDraft(row)),
                buyer_name: event.target.value
              }
            }))
          }
          style={{ width: "100%", minHeight: 32 }}
        />
      )
    },
    {
      title: "Hammer Price",
      key: "hammer_price",
      width: 140,
      render: (_, row) => (
        <input
          type="number"
          min="0"
          step="0.01"
          value={finalizeDrafts[row.lot_id]?.hammer_price ?? ""}
          onChange={(event) =>
            setFinalizeDrafts((current) => ({
              ...current,
              [row.lot_id]: {
                ...(current[row.lot_id] ?? buildFinalizeDraft(row)),
                hammer_price: event.target.value
              }
            }))
          }
          style={{ width: "100%", minHeight: 32 }}
        />
      )
    },
    {
      title: "Settlement Due Date",
      key: "settlement_due_date",
      width: 160,
      render: (_, row) => (
        <input
          type="date"
          value={finalizeDrafts[row.lot_id]?.settlement_due_date ?? ""}
          onChange={(event) =>
            setFinalizeDrafts((current) => ({
              ...current,
              [row.lot_id]: {
                ...(current[row.lot_id] ?? buildFinalizeDraft(row)),
                settlement_due_date: event.target.value
              }
            }))
          }
          style={{ width: "100%", minHeight: 32 }}
        />
      )
    },
    {
      title: "Remarks",
      key: "remarks",
      width: 200,
      render: (_, row) => (
        <input
          value={finalizeDrafts[row.lot_id]?.remarks ?? ""}
          onChange={(event) =>
            setFinalizeDrafts((current) => ({
              ...current,
              [row.lot_id]: {
                ...(current[row.lot_id] ?? buildFinalizeDraft(row)),
                remarks: event.target.value
              }
            }))
          }
          style={{ width: "100%", minHeight: 32 }}
        />
      )
    },
    {
      title: "Action",
      key: "action",
      width: 220,
      render: (_, row) => (
        <Space size={8}>
          <Button
            size="small"
            type="primary"
            loading={finalizeMutation.isPending}
            onClick={async () => {
              await finalizeMutation.mutateAsync([row.lot_id]);
            }}
          >
            Save Row
          </Button>
          <Popconfirm
            title="Delete latest result?"
            description="Deleting the latest sold result will revert the lot to the previous auction state."
            okText="Delete Result"
            cancelText="Cancel"
            okButtonProps={{ danger: true, loading: deleteResultMutation.isPending }}
            onConfirm={async () => {
              await deleteResultMutation.mutateAsync(row);
            }}
          >
            <Button size="small" danger>
              Delete Result
            </Button>
          </Popconfirm>
        </Space>
      )
    }
  ];

  return (
    <div className="auction-sale-desk" onKeyDown={handleLiveDeskKeyDown} tabIndex={0}>
      <datalist id="auction-sale-desk-buyers">
        {(partyOptions?.buyers ?? []).map((buyer) => (
          <option key={buyer} value={buyer} />
        ))}
      </datalist>

      <Space direction="vertical" size={16} style={{ width: "100%" }}>
        <Card>
          <Space direction="vertical" size={12} style={{ width: "100%" }}>
            <Space style={{ width: "100%", justifyContent: "space-between" }} align="start">
              <div>
                <Typography.Title level={4} style={{ margin: 0 }}>
                  Live Auction Sale Desk
                </Typography.Title>
                <Typography.Text type="secondary">
                  {auctionCentre} • Sale No. {saleNo}
                </Typography.Text>
              </div>
              <Space>
                <Link href="/auction-catalogue">
                  <Button>Back to Catalogue</Button>
                </Link>
                <Button type="primary" disabled={!canReviewCommit} onClick={() => setReviewOpen(true)}>
                  Review & Commit
                </Button>
              </Space>
            </Space>
            <Space size={16} wrap>
              <label style={{ display: "grid", gap: 4 }}>
                <Typography.Text type="secondary">Sale Date</Typography.Text>
                <input
                  type="date"
                  value={saleDate}
                  onChange={(event) => setSaleDate(event.target.value)}
                  disabled={draftChoicePending}
                  style={{ minHeight: 34, paddingInline: 10 }}
                />
              </label>
              <Card size="small" style={{ minWidth: 130 }}>
                <Typography.Text type="secondary">Unresolved</Typography.Text>
                <Typography.Title level={4} style={{ margin: 0 }}>
                  {summary.unresolvedCount}
                </Typography.Title>
              </Card>
              <Card size="small" style={{ minWidth: 130 }}>
                <Typography.Text type="secondary">Sold</Typography.Text>
                <Typography.Title level={4} style={{ margin: 0 }}>
                  {summary.soldCount}
                </Typography.Title>
              </Card>
              <Card size="small" style={{ minWidth: 130 }}>
                <Typography.Text type="secondary">Out</Typography.Text>
                <Typography.Title level={4} style={{ margin: 0 }}>
                  {summary.outCount}
                </Typography.Title>
              </Card>
            </Space>
            <Space wrap>
              <Button type={mode === "live" ? "primary" : "default"} onClick={() => setMode("live")}>
                Live Capture
              </Button>
              <Button type={mode === "finalize" ? "primary" : "default"} onClick={() => setMode("finalize")}>
                Finalize Sold ({finalizeRows.length})
              </Button>
            </Space>
          </Space>
        </Card>

        {draftChoicePending && pendingDraft ? (
          <Alert
            type="warning"
            showIcon
            message="Saved draft found for this sale."
            description={
              <Space wrap>
                <Button
                  type="primary"
                  size="small"
                  onClick={() => {
                    setSaleDate(normalizeText(pendingDraft.sale_date) || today);
                    setLiveDraftRows(pendingDraft.rows ?? {});
                    setDraftChoicePending(false);
                    setPendingDraft(null);
                  }}
                >
                  Restore draft
                </Button>
                <Button
                  size="small"
                  onClick={() => {
                    setSaleDate(today);
                    setLiveDraftRows({});
                    setDraftChoicePending(false);
                    setPendingDraft(null);
                    if (typeof window !== "undefined") {
                      window.localStorage.removeItem(draftStorageKey);
                    }
                  }}
                >
                  Start fresh
                </Button>
              </Space>
            }
          />
        ) : null}

        {isLoading ? (
          <Card loading />
        ) : error ? (
          <Card>
            <Alert
              type="error"
              showIcon
              message="Failed to load this sale desk."
              description={error instanceof Error ? error.message : "Unknown error"}
            />
          </Card>
        ) : rows.length === 0 ? (
          <Card>
            <Empty description="No lots found for this auction centre and sale number." />
          </Card>
        ) : mode === "live" ? (
          <Card>
            <Space direction="vertical" size={12} style={{ width: "100%" }}>
              {!pendingDetailsSupported ? (
                <Alert
                  type="warning"
                  showIcon
                  message="Database migration required for live sold capture."
                  description="The connected database does not yet include SOLD_AUCTION_PENDING_DETAILS. Out rows can still be handled here, but Sold capture and Finalize Sold need migration 0008 applied first."
                />
              ) : null}
              <Typography.Text type="secondary">
                Keyboard: <kbd>S</kbd> Sold, <kbd>O</kbd> Out, <kbd>Enter</kbd> next field, <kbd>Esc</kbd> clear,{" "}
                <kbd>Ctrl/Cmd</kbd> + <kbd>Enter</kbd> review.
              </Typography.Text>
              <Table<SaleDeskRow>
                rowKey="lot_id"
                columns={liveColumns}
                dataSource={rows}
                pagination={false}
                scroll={{ x: 1600 }}
                size="small"
                rowClassName={(row) => (row.lot_id === activeRowId ? "sale-desk-row-active" : "")}
                onRow={(row) => ({
                  onClick: () => {
                    if (!row.can_capture_live) return;
                    const draft = liveDraftRows[row.lot_id] ?? emptyLiveDraft;
                    setActiveRowId(row.lot_id);
                    if (draft.result === "SOLD") {
                      focusField(row.lot_id, "buyer_name");
                      return;
                    }
                    if (draft.result === "OUT") {
                      focusField(row.lot_id, "out_price");
                      return;
                    }
                    focusField(row.lot_id, "result");
                  }
                })}
              />
            </Space>
          </Card>
        ) : (
          <Card>
            <Space direction="vertical" size={12} style={{ width: "100%" }}>
              <Space wrap>
                <label style={{ display: "grid", gap: 4 }}>
                  <Typography.Text type="secondary">Bulk Settlement Due Date</Typography.Text>
                  <input
                    type="date"
                    value={bulkSettlementDueDate}
                    onChange={(event) => setBulkSettlementDueDate(event.target.value)}
                    style={{ minHeight: 34, paddingInline: 10 }}
                  />
                </label>
                <Button
                  onClick={() => {
                    if (!selectedFinalizeLotIds.length) {
                      message.error("Select at least one lot first.");
                      return;
                    }
                    if (!normalizeText(bulkSettlementDueDate)) {
                      message.error("Choose a settlement due date first.");
                      return;
                    }
                    setFinalizeDrafts((current) => {
                      const next = { ...current };
                      for (const lotId of selectedFinalizeLotIds) {
                        next[lotId] = {
                          ...(next[lotId] ?? buildFinalizeDraft(finalizeRows.find((row) => row.lot_id === lotId)!)),
                          settlement_due_date: bulkSettlementDueDate
                        };
                      }
                      return next;
                    });
                  }}
                >
                  Apply Settlement Due Date to Selected
                </Button>
                <Button
                  type="primary"
                  disabled={!selectedFinalizeLotIds.length}
                  loading={finalizeMutation.isPending}
                  onClick={async () => {
                    await finalizeMutation.mutateAsync(selectedFinalizeLotIds);
                  }}
                >
                  Save Selected
                </Button>
              </Space>
              {finalizeRows.length === 0 ? (
                <Empty description="No sold lots are waiting for settlement details." />
              ) : (
                <Table<SaleDeskRow>
                  rowKey="lot_id"
                  columns={finalizeColumns}
                  dataSource={finalizeRows}
                  pagination={false}
                  scroll={{ x: 1400 }}
                  size="small"
                  rowSelection={{
                    selectedRowKeys: selectedFinalizeLotIds,
                    onChange: (keys) => setSelectedFinalizeLotIds(keys.map((key) => String(key)))
                  }}
                />
              )}
            </Space>
          </Card>
        )}
      </Space>

      <Modal
        title="Review Sale Commit"
        open={reviewOpen}
        onCancel={() => setReviewOpen(false)}
        onOk={async () => {
          await liveCommitMutation.mutateAsync();
        }}
        okText="Save Sale Results"
        okButtonProps={{
          disabled: reviewIssues.length > 0,
          loading: liveCommitMutation.isPending
        }}
      >
        <Space direction="vertical" size={12} style={{ width: "100%" }}>
          <Typography.Text>
            {auctionCentre} • Sale No. {saleNo} • Sale Date {saleDate || "-"}
          </Typography.Text>
          <Typography.Text>Sold: {review.soldCount}</Typography.Text>
          <Typography.Text>Out: {review.outCount}</Typography.Text>
          {reviewIssues.length ? (
            <Alert
              type="error"
              showIcon
              message="Resolve these row errors before committing."
              description={
                <ul style={{ margin: 0, paddingInlineStart: 18 }}>
                  {reviewIssues.map((issue) => (
                    <li key={issue}>{issue}</li>
                  ))}
                </ul>
              }
            />
          ) : (
            <Alert type="success" showIcon message="All pending lots are complete and ready to save." />
          )}
        </Space>
      </Modal>

      <style jsx global>{`
        .auction-sale-desk .sale-desk-row-active td {
          background: #eef6ff !important;
        }

        .auction-sale-desk input,
        .auction-sale-desk select {
          border: 1px solid #d9d9d9;
          border-radius: 6px;
          padding: 4px 8px;
          background: #fff;
        }

        .auction-sale-desk input:disabled,
        .auction-sale-desk select:disabled {
          background: #f5f5f5;
          color: rgba(0, 0, 0, 0.45);
        }
      `}</style>
    </div>
  );
}
