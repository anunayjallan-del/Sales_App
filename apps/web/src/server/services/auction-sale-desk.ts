import { resolveCatalogueSaleNo } from "@/lib/auction-catalogue";
import { GlobalLotStatus } from "@/lib/types";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  addLotStatusEvent,
  createLotAction,
  getActiveStatusesForLots,
  replaceLotActiveStatuses
} from "@/server/repositories/lots-repo";
import { deriveWarnings } from "@/server/services/flat-status-engine";
import { applyActionToStatuses, parseActionPayload, splitLotStatusLanes } from "@/server/services/lot-actions";

const saleDeskCandidateStatuses = [
  "CATALOGUED",
  "AWR_RECEIVED",
  "RESERVE_SET",
  "REPRINT",
  "OUT",
  "SOLD_AUCTION_PENDING_DETAILS",
  "SOLD_AUCTION"
] as const;

const editableSaleDeskStatuses = new Set<GlobalLotStatus>(["CATALOGUED", "RESERVE_SET", "REPRINT"]);
const visibleSaleDeskStatuses = new Set<GlobalLotStatus>([
  "CATALOGUED",
  "RESERVE_SET",
  "REPRINT",
  "OUT",
  "SOLD_AUCTION_PENDING_DETAILS",
  "SOLD_AUCTION"
]);

const saleDeskActionNames = [
  "DISPATCH_TO_AUCTION",
  "AWR_RECEIVED",
  "PRINT",
  "SET_RESERVE_PRICE",
  "OUT",
  "REPRINT",
  "SOLD_AUCTION_LIVE",
  "FINALIZE_SOLD_AUCTION",
  "SOLD_AUCTION"
] as const;

export type AuctionSaleDeskResultAction = "OUT" | "SOLD_AUCTION_LIVE" | "FINALIZE_SOLD_AUCTION" | "SOLD_AUCTION";

export type AuctionSaleDeskCommittedResult = {
  action_id: string;
  action: AuctionSaleDeskResultAction;
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

export type AuctionSaleDeskRow = {
  lot_id: string;
  mark: string;
  invoice_number: string;
  grade: string;
  bags: number;
  net_weight_kg: number;
  reserve_price: number | null;
  sale_no: string;
  auction_centre: string;
  auction_lane_status: GlobalLotStatus;
  active_statuses: GlobalLotStatus[];
  committed_result: AuctionSaleDeskCommittedResult | null;
  can_capture_live: boolean;
};

export type AuctionSaleDeskData = {
  auction_centre: string;
  sale_no: string;
  pending_details_supported: boolean;
  rows: AuctionSaleDeskRow[];
};

export type AuctionSaleLiveCommitRow = {
  lot_id: string;
  result: "SOLD" | "OUT";
  buyer_name?: string;
  hammer_price?: number | string | null;
  out_price?: number | string | null;
};

export type ValidatedAuctionSaleLiveCommitRow = {
  lot_id: string;
  result: "SOLD" | "OUT";
  buyer_name?: string;
  hammer_price?: number;
  out_price?: number;
};

export type AuctionSaleLiveCommitValidation =
  | {
      ok: true;
      rows: ValidatedAuctionSaleLiveCommitRow[];
    }
  | {
      ok: false;
      message: string;
      issues: string[];
    };

type SaleDeskActionRow = {
  id: string;
  action: string;
  payload: Record<string, unknown> | null;
  performed_at: string;
  created_at?: string | null;
};

type SaleDeskLotRow = {
  id: string;
  mark: string;
  invoice_number: string;
  grade: string;
  bags: number;
  net_weight_kg: number;
};

function normalizeText(value: unknown): string {
  return String(value ?? "").trim();
}

function parseOptionalNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeStatus(status: string): GlobalLotStatus {
  return (status === "AWR_RECEIVED" ? "CATALOGUED" : status) as GlobalLotStatus;
}

function parseAuctionCentreFromActions(actions: SaleDeskActionRow[]): string {
  const dispatch = actions.find((row) => row.action === "DISPATCH_TO_AUCTION");
  return normalizeText(dispatch?.payload?.auction_centre) || "-";
}

function resolveReservePrice(actions: SaleDeskActionRow[]): number | null {
  const action = actions.find((row) => row.action === "SET_RESERVE_PRICE");
  return parseOptionalNumber(action?.payload?.reserve_price);
}

function getCommittedResultAction(
  auctionLaneStatus: GlobalLotStatus,
  actions: SaleDeskActionRow[]
): SaleDeskActionRow | null {
  if (auctionLaneStatus === "OUT") {
    return actions.find((row) => row.action === "OUT") ?? null;
  }
  if (auctionLaneStatus === "SOLD_AUCTION_PENDING_DETAILS") {
    return actions.find((row) => row.action === "SOLD_AUCTION_LIVE") ?? null;
  }
  if (auctionLaneStatus === "SOLD_AUCTION") {
    return actions.find((row) => row.action === "FINALIZE_SOLD_AUCTION" || row.action === "SOLD_AUCTION") ?? null;
  }
  return null;
}

export function resolveCommittedSaleResult(
  auctionLaneStatus: GlobalLotStatus,
  actions: Array<{
    id: string;
    action: string;
    payload: Record<string, unknown> | null;
    performed_at?: string | null;
    created_at?: string | null;
  }>
): AuctionSaleDeskCommittedResult | null {
  const action = getCommittedResultAction(
    auctionLaneStatus,
    actions.map((row) => ({
      id: String(row.id),
      action: String(row.action),
      payload: row.payload ?? null,
      performed_at: String(row.performed_at ?? row.created_at ?? ""),
      created_at: row.created_at ?? null
    }))
  );
  if (!action) return null;

  return {
    action_id: action.id,
    action: action.action as AuctionSaleDeskResultAction,
    status: auctionLaneStatus as AuctionSaleDeskCommittedResult["status"],
    sale_no: normalizeText(action.payload?.sale_no) || null,
    sale_date: normalizeText(action.payload?.sale_date) || null,
    out_date: normalizeText(action.payload?.out_date) || null,
    buyer_name: normalizeText(action.payload?.buyer_name) || null,
    hammer_price: parseOptionalNumber(action.payload?.hammer_price),
    out_price: parseOptionalNumber(action.payload?.out_price),
    settlement_due_date: normalizeText(action.payload?.settlement_due_date) || null,
    remarks: normalizeText(action.payload?.remarks) || null
  };
}

export function mergeFinalizedSoldAuctionPayload(
  livePayload: Record<string, unknown> | null | undefined,
  finalizePayload: Record<string, unknown> | null | undefined
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...(livePayload ?? {}) };
  const overrides = finalizePayload ?? {};

  for (const key of ["sale_no", "sale_date", "buyer_name", "settlement_due_date"] as const) {
    const value = normalizeText(overrides[key]);
    if (value) merged[key] = value;
  }

  if (typeof overrides.remarks === "string") {
    merged.remarks = overrides.remarks;
  }

  const hammerPrice = parseOptionalNumber(overrides.hammer_price);
  if (hammerPrice !== null) {
    merged.hammer_price = hammerPrice;
  }

  return merged;
}

export function validateAuctionSaleLiveCommit(args: {
  sale_date: string;
  eligible_lot_ids: string[];
  rows: AuctionSaleLiveCommitRow[];
}): AuctionSaleLiveCommitValidation {
  const saleDate = normalizeText(args.sale_date);
  const eligibleLotIds = Array.from(new Set(args.eligible_lot_ids.map((value) => normalizeText(value)).filter(Boolean)));
  const issues: string[] = [];

  if (!saleDate) {
    issues.push("Sale date is required.");
  }
  if (!eligibleLotIds.length) {
    issues.push("No unresolved lots are available for live capture in this sale.");
  }

  const normalizedRows = args.rows.map((row) => ({
    lot_id: normalizeText(row.lot_id),
    result: row.result,
    buyer_name: normalizeText(row.buyer_name),
    hammer_price: parseOptionalNumber(row.hammer_price),
    out_price: parseOptionalNumber(row.out_price)
  }));

  const rowByLotId = new Map<string, ValidatedAuctionSaleLiveCommitRow>();
  const duplicateLotIds = new Set<string>();

  for (const row of normalizedRows) {
    if (!row.lot_id) {
      issues.push("Each staged row must include a lot_id.");
      continue;
    }
    if (rowByLotId.has(row.lot_id)) {
      duplicateLotIds.add(row.lot_id);
      continue;
    }
    if (row.result !== "SOLD" && row.result !== "OUT") {
      issues.push(`Lot ${row.lot_id}: result must be SOLD or OUT.`);
      continue;
    }
    if (row.result === "SOLD") {
      if (!row.buyer_name) {
        issues.push(`Lot ${row.lot_id}: buyer name is required for sold rows.`);
      }
      if (row.hammer_price === null || row.hammer_price <= 0) {
        issues.push(`Lot ${row.lot_id}: hammer price must be greater than 0.`);
      }
    }
    if (row.result === "OUT" && (row.out_price === null || row.out_price < 0)) {
      issues.push(`Lot ${row.lot_id}: out price must be 0 or greater.`);
    }
    rowByLotId.set(row.lot_id, {
      lot_id: row.lot_id,
      result: row.result,
      buyer_name: row.buyer_name || undefined,
      hammer_price: row.hammer_price ?? undefined,
      out_price: row.out_price ?? undefined
    });
  }

  for (const lotId of duplicateLotIds) {
    issues.push(`Lot ${lotId}: duplicate staged row.`);
  }

  const extraLotIds = Array.from(rowByLotId.keys()).filter((lotId) => !eligibleLotIds.includes(lotId));
  for (const lotId of extraLotIds) {
    issues.push(`Lot ${lotId}: is not eligible for live capture in this sale.`);
  }

  const missingLotIds = eligibleLotIds.filter((lotId) => !rowByLotId.has(lotId));
  for (const lotId of missingLotIds) {
    issues.push(`Lot ${lotId}: missing staged result.`);
  }

  if (issues.length) {
    return {
      ok: false,
      message: "Invalid live sale commit payload.",
      issues
    };
  }

  return {
    ok: true,
    rows: eligibleLotIds
      .map((lotId) => rowByLotId.get(lotId))
      .filter((row): row is ValidatedAuctionSaleLiveCommitRow => Boolean(row))
  };
}

async function loadSaleDeskLots(lotIds: string[]) {
  const byId = new Map<string, SaleDeskLotRow>();
  if (!lotIds.length) return byId;

  const chunkSize = 200;
  for (let index = 0; index < lotIds.length; index += chunkSize) {
    const chunk = lotIds.slice(index, index + chunkSize);
    const { data, error } = await getSupabaseAdmin()
      .from("lots")
      .select("id,mark,invoice_number,grade,bags,net_weight_kg")
      .in("id", chunk);
    if (error) throw error;

    for (const row of data ?? []) {
      byId.set(String(row.id), {
        id: String(row.id),
        mark: String(row.mark ?? ""),
        invoice_number: String(row.invoice_number ?? ""),
        grade: String(row.grade ?? ""),
        bags: Number(row.bags ?? 0),
        net_weight_kg: Number(row.net_weight_kg ?? 0)
      });
    }
  }

  return byId;
}

async function loadSaleDeskActions(lotIds: string[]) {
  const actionsByLot = new Map<string, SaleDeskActionRow[]>();
  if (!lotIds.length) return actionsByLot;

  const chunkSize = 200;
  for (let index = 0; index < lotIds.length; index += chunkSize) {
    const chunk = lotIds.slice(index, index + chunkSize);
    const { data, error } = await getSupabaseAdmin()
      .from("lot_actions")
      .select("id,lot_id,action,payload,performed_at,created_at")
      .in("lot_id", chunk)
      .in("action", [...saleDeskActionNames])
      .order("performed_at", { ascending: false })
      .order("created_at", { ascending: false })
      .order("id", { ascending: false });
    if (error) throw error;

    for (const row of data ?? []) {
      const lotId = String(row.lot_id);
      const current = actionsByLot.get(lotId) ?? [];
      current.push({
        id: String(row.id),
        action: String(row.action ?? ""),
        payload: (row.payload as Record<string, unknown> | null) ?? null,
        performed_at: String(row.performed_at ?? row.created_at ?? ""),
        created_at: row.created_at ? String(row.created_at) : null
      });
      actionsByLot.set(lotId, current);
    }
  }

  return actionsByLot;
}

async function loadSaleDeskCandidateActiveRows(): Promise<{
  rows: Array<{ lot_id: string; status: string }>;
  pendingDetailsSupported: boolean;
}> {
  const supabase = getSupabaseAdmin();
  const attempt = await supabase.from("lot_active_statuses").select("lot_id,status").in("status", [...saleDeskCandidateStatuses]);
  if (!attempt.error) {
    return {
      rows: attempt.data ?? [],
      pendingDetailsSupported: true
    };
  }

  const errorMessage = String(attempt.error.message ?? "");
  if (!errorMessage.includes('invalid input value for enum lot_global_status: "SOLD_AUCTION_PENDING_DETAILS"')) {
    throw attempt.error;
  }

  const fallbackStatuses = saleDeskCandidateStatuses.filter((status) => status !== "SOLD_AUCTION_PENDING_DETAILS");
  const fallback = await supabase.from("lot_active_statuses").select("lot_id,status").in("status", fallbackStatuses);
  if (fallback.error) throw fallback.error;

  return {
    rows: fallback.data ?? [],
    pendingDetailsSupported: false
  };
}

export async function getAuctionSaleDesk(input: { auctionCentre: string; saleNo: string }): Promise<AuctionSaleDeskData> {
  const auctionCentre = normalizeText(input.auctionCentre);
  const saleNo = normalizeText(input.saleNo);

  const { rows: candidateRows, pendingDetailsSupported } = await loadSaleDeskCandidateActiveRows();

  const candidateLotIds = Array.from(new Set((candidateRows ?? []).map((row) => String(row.lot_id)).filter(Boolean)));
  if (!candidateLotIds.length) {
    return { auction_centre: auctionCentre, sale_no: saleNo, pending_details_supported: pendingDetailsSupported, rows: [] };
  }

  const [activeStatusesByLot, lotsById, actionsByLot] = await Promise.all([
    getActiveStatusesForLots(candidateLotIds),
    loadSaleDeskLots(candidateLotIds),
    loadSaleDeskActions(candidateLotIds)
  ]);

  const rows = candidateLotIds
    .map((lotId) => {
      const lot = lotsById.get(lotId);
      if (!lot) return null;

      const activeStatuses = (activeStatusesByLot.get(lotId) ?? ["PENDING"]).map((status) =>
        normalizeStatus(String(status))
      ) as GlobalLotStatus[];
      const lanes = splitLotStatusLanes(activeStatuses);
      if (lanes.terminal || lanes.private || !lanes.auction || !visibleSaleDeskStatuses.has(lanes.auction)) {
        return null;
      }

      const actions = actionsByLot.get(lotId) ?? [];
      const resolvedSaleNo = resolveCatalogueSaleNo(actions);
      const resolvedAuctionCentre = parseAuctionCentreFromActions(actions);
      if (resolvedSaleNo !== saleNo || resolvedAuctionCentre !== auctionCentre) {
        return null;
      }

      return {
        lot_id: lot.id,
        mark: lot.mark,
        invoice_number: lot.invoice_number,
        grade: lot.grade,
        bags: lot.bags,
        net_weight_kg: lot.net_weight_kg,
        reserve_price: resolveReservePrice(actions),
        sale_no: resolvedSaleNo,
        auction_centre: resolvedAuctionCentre,
        auction_lane_status: lanes.auction,
        active_statuses: activeStatuses,
        committed_result: resolveCommittedSaleResult(lanes.auction, actions),
        can_capture_live: editableSaleDeskStatuses.has(lanes.auction)
      } satisfies AuctionSaleDeskRow;
    })
    .filter((row): row is AuctionSaleDeskRow => Boolean(row))
    .sort(
      (left, right) =>
        left.invoice_number.localeCompare(right.invoice_number, undefined, {
          numeric: true,
          sensitivity: "base"
        }) ||
        left.mark.localeCompare(right.mark) ||
        left.lot_id.localeCompare(right.lot_id)
    );

  return {
    auction_centre: auctionCentre,
    sale_no: saleNo,
    pending_details_supported: pendingDetailsSupported,
    rows
  };
}

export async function commitAuctionSaleLive(input: {
  auctionCentre: string;
  saleNo: string;
  saleDate: string;
  rows: AuctionSaleLiveCommitRow[];
}):
  Promise<
    | { ok: true; appliedLotIds: string[] }
    | { ok: false; status: 400; message: string; issues: string[] }
    | { ok: false; status: 500; message: string; appliedLotIds: string[]; failedLotId: string | null }
  > {
  const desk = await getAuctionSaleDesk({
    auctionCentre: input.auctionCentre,
    saleNo: input.saleNo
  });

  const eligibleLotIds = desk.rows.filter((row) => row.can_capture_live).map((row) => row.lot_id);
  const validation = validateAuctionSaleLiveCommit({
    sale_date: input.saleDate,
    eligible_lot_ids: eligibleLotIds,
    rows: input.rows
  });
  if (!validation.ok) {
    return {
      ok: false,
      status: 400,
      message: validation.message,
      issues: validation.issues
    };
  }

  if (!desk.pending_details_supported && validation.rows.some((row) => row.result === "SOLD")) {
    return {
      ok: false,
      status: 400,
      message: "Live sold capture is unavailable because the SOLD_AUCTION_PENDING_DETAILS migration has not been applied.",
      issues: ["Run `supabase/migrations/0008_sold_auction_pending_details.sql` against the connected database, then retry."]
    };
  }

  const activeStatusesByLot = await getActiveStatusesForLots(eligibleLotIds);
  const appliedLotIds: string[] = [];
  let failedLotId: string | null = null;

  try {
    for (const row of validation.rows) {
      const action = row.result === "SOLD" ? "SOLD_AUCTION_LIVE" : "OUT";
      const payload =
        row.result === "SOLD"
          ? {
              sale_no: desk.sale_no,
              sale_date: normalizeText(input.saleDate),
              buyer_name: row.buyer_name,
              hammer_price: row.hammer_price
            }
          : {
              sale_no: desk.sale_no,
              out_date: normalizeText(input.saleDate),
              out_price: row.out_price
            };

      const parsedPayload = parseActionPayload(action, payload);
      if (!parsedPayload.success) {
        return {
          ok: false,
          status: 400,
          message: "Invalid live sale commit payload.",
          issues: parsedPayload.error.issues.map((issue) => issue.message)
        };
      }

      const currentStatuses = (activeStatusesByLot.get(row.lot_id) ?? ["PENDING"]) as GlobalLotStatus[];
      const transition = applyActionToStatuses(action, currentStatuses);
      const nextStatuses = transition.nextStatuses;

      await replaceLotActiveStatuses(row.lot_id, nextStatuses);

      const previousSet = new Set(currentStatuses);
      const nextSet = new Set(nextStatuses);
      const payloadWithAudit = parsedPayload.data as Record<string, unknown>;

      for (const status of nextStatuses) {
        if (previousSet.has(status)) continue;
        await addLotStatusEvent({
          lotId: row.lot_id,
          status,
          source: "MANUAL",
          meta: { action, ...payloadWithAudit }
        });
      }

      for (const status of currentStatuses) {
        if (nextSet.has(status)) continue;
        await addLotStatusEvent({
          lotId: row.lot_id,
          status,
          source: "MANUAL",
          meta: { action, removed: true, ...payloadWithAudit }
        });
      }

      await createLotAction({
        lotId: row.lot_id,
        action,
        resultingStatus: transition.resultingStatus,
        payload: payloadWithAudit,
        warningFlags: deriveWarnings(nextStatuses)
      });

      appliedLotIds.push(row.lot_id);
    }

    return { ok: true, appliedLotIds };
  } catch (error) {
    failedLotId = appliedLotIds.length < validation.rows.length ? validation.rows[appliedLotIds.length]?.lot_id ?? null : null;
    return {
      ok: false,
      status: 500,
      message:
        error instanceof Error
          ? error.message
          : typeof error === "object" && error !== null && "message" in error && typeof error.message === "string"
            ? error.message
            : "Internal server error",
      appliedLotIds,
      failedLotId
    };
  }
}
