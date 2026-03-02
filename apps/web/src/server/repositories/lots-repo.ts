import { getSupabaseAdmin } from "@/lib/supabase";
import {
  AuctionStatus,
  GlobalLotStatus,
  LifecycleStatus,
  LotStatusEventSource,
  PrivateDealStatus
} from "@/lib/types";
import { deriveActiveStatuses, deriveWarnings, rankAuctionStatusForBadge, rankPrivateStatusForBadge } from "@/server/services/flat-status-engine";
import { resolveLifecycleStatus } from "@/server/services/status-engine";

const db = () => getSupabaseAdmin();

const defaultBrokerNames = [
  "Nandkishore Pareek",
  "Associated Brokers",
  "Amitashish Enterprises",
  "Nilesh Shah",
  "Pawan Chawla",
  "Select Commodities",
  "Anand Bafna",
  "Parcon"
] as const;

function deriveFactoryFromMark(mark: string): string | null {
  const normalized = mark.trim().toUpperCase();
  if (normalized === "ABHOYJAN" || normalized === "ABHOYBARII") return "Abhoyjan";
  if (normalized === "FURKATING" || normalized === "FURKATING SELECT" || normalized === "ALL MY TEA") {
    return "Furkating";
  }
  return null;
}

type LotWithRelations = {
  id: string;
  mark: string;
  invoice_number: string;
  grade: string;
  bags: number;
  net_weight_kg: number;
  factory: string | null;
  date_created: string;
  is_cancelled: boolean;
  master_status: string;
  auction_tracks?: Array<{ auction_status: AuctionStatus | null; payment_received_date?: string | null }>;
  private_deals?: Array<{ status: PrivateDealStatus; payment_received_date?: string | null }>;
};

function withComputedLifecycle<T extends LotWithRelations>(lot: T): T & { lifecycle_status: LifecycleStatus } {
  const lifecycle_status = resolveLifecycleStatus({
    isCancelled: Boolean(lot.is_cancelled),
    privateStatuses: (lot.private_deals ?? []).map((d) => d.status),
    auctionStatus: lot.auction_tracks?.[0]?.auction_status ?? null
  });

  return {
    ...lot,
    lifecycle_status
  };
}

function withFlatStatuses<T extends LotWithRelations>(lot: T, activeStatusesFromTable: GlobalLotStatus[] | null) {
  const privateStatuses = (lot.private_deals ?? []).map((d) => d.status);
  const hasPrivatePayment = (lot.private_deals ?? []).some((d) => Boolean(d.payment_received_date));
  const fallback = deriveActiveStatuses({
    isCancelled: Boolean(lot.is_cancelled),
    auctionStatus: lot.auction_tracks?.[0]?.auction_status ?? null,
    privateStatuses,
    hasAuctionPayment: Boolean(lot.auction_tracks?.[0]?.payment_received_date),
    hasPrivatePayment
  });
  const persisted = activeStatusesFromTable?.length ? activeStatusesFromTable : fallback;
  const withoutSamplingSent = persisted.filter((status) => status !== "SAMPLING_SENT");
  const fallbackWithoutSamplingSent = fallback.filter((status) => status !== "SAMPLING_SENT");
  const active_statuses: GlobalLotStatus[] = withoutSamplingSent.length
    ? withoutSamplingSent
    : fallbackWithoutSamplingSent.length
      ? fallbackWithoutSamplingSent
      : ["PENDING"];
  const warnings = deriveWarnings(active_statuses);

  return {
    ...lot,
    active_statuses,
    warnings,
    auction_status_badge: rankAuctionStatusForBadge(lot.auction_tracks?.[0]?.auction_status ?? null),
    private_status_badge: rankPrivateStatusForBadge(privateStatuses)
  };
}

type SamplingSnapshot = {
  is_sampled: boolean;
  last_sampled_on: string | null;
  recent_sampling_parties: string[];
};

function normalizeIsoDate(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1] ?? null;
  return null;
}

function parseSamplingParties(payload: unknown): string[] {
  if (!payload || typeof payload !== "object") return [];
  const parties = (payload as Record<string, unknown>).parties;
  if (!Array.isArray(parties)) return [];
  return Array.from(
    new Set(
      parties
        .map((party) => String(party ?? "").trim())
        .filter(Boolean)
    )
  );
}

async function getSamplingSnapshotByLotIds(lotIds: string[]) {
  const result = new Map<string, SamplingSnapshot>();
  if (!lotIds.length) return result;

  const chunkSize = 200;
  for (let i = 0; i < lotIds.length; i += chunkSize) {
    const chunk = lotIds.slice(i, i + chunkSize);
    const { data, error } = await db()
      .from("lot_actions")
      .select("lot_id,payload,performed_at")
      .eq("action", "SAMPLING")
      .in("lot_id", chunk);
    if (error) throw error;
    for (const row of data ?? []) {
      const lotId = String(row.lot_id);
      const samplingDate =
        normalizeIsoDate((row.payload as Record<string, unknown> | null)?.sampling_date) ??
        normalizeIsoDate(row.performed_at);
      const existing = result.get(lotId) ?? {
        is_sampled: true,
        last_sampled_on: null,
        recent_sampling_parties: []
      };
      if (samplingDate && (!existing.last_sampled_on || samplingDate > existing.last_sampled_on)) {
        existing.last_sampled_on = samplingDate;
      }
      const mergedParties = new Set([...existing.recent_sampling_parties, ...parseSamplingParties(row.payload)]);
      existing.recent_sampling_parties = Array.from(mergedParties).sort((a, b) => a.localeCompare(b));
      result.set(lotId, existing);
    }
  }
  return result;
}

export async function listLots(filters: {
  search?: string;
  mark?: string;
  factory?: string;
  grade?: string;
  masterStatus?: string;
  status?: string;
  sampled?: boolean;
  bagsMin?: number;
  bagsMax?: number;
  weightMin?: number;
  weightMax?: number;
  packingDateFrom?: string;
  packingDateTo?: string;
  page: number;
  pageSize: number;
}) {
  const from = (filters.page - 1) * filters.pageSize;
  const to = from + filters.pageSize - 1;

  const searchClause = filters.search ? `invoice_number.ilike.%${filters.search}%` : null;
  const normalizeStatusFilter = (value: string) => {
    const raw = value.trim();
    const upper = raw.toUpperCase();
    if (upper === "SAMPLED") return "SAMPLING_SENT";
    if (upper === "ARRIVED BUT HELD") return "AWR_PENDING";
    if (upper === "ARRIVED") return "AWR_RECEIVED";
    if (upper === "PRINTED") return "CATALOGUED";
    if (upper === "RESERVE PRICE SET") return "RESERVE_SET";
    if (upper === "OUT LOT") return "OUT";
    if (upper === "REPRINTED") return "REPRINT";
    if (upper === "HELD") return "HOLD";
    if (upper === "WITHDRAWN") return "WITHDRAW";
    if (upper === "SOLD PENDING DISPATCH") return "SOLD_PENDING_DISPATCH";
    return upper;
  };
  const statusFilters = filters.status
    ? filters.status
        .split(",")
        .map((s) => normalizeStatusFilter(s))
        .filter(Boolean)
    : [];
  const needsComputedFiltering = statusFilters.length > 0 || filters.sampled !== undefined;

  let dataQuery = db()
    .from("lots")
    .select("*, auction_tracks(*), private_deals(*, buyers(name))")
    .order("date_created", { ascending: true });

  let countQuery = db().from("lots").select("id", { count: "exact", head: true });

  if (searchClause) {
    dataQuery = dataQuery.or(searchClause);
    countQuery = countQuery.or(searchClause);
  }
  if (filters.grade) {
    dataQuery = dataQuery.eq("grade", filters.grade);
    countQuery = countQuery.eq("grade", filters.grade);
  }
  if (filters.mark) {
    dataQuery = dataQuery.eq("mark", filters.mark);
    countQuery = countQuery.eq("mark", filters.mark);
  }
  if (filters.factory) {
    dataQuery = dataQuery.eq("factory", filters.factory);
    countQuery = countQuery.eq("factory", filters.factory);
  }
  if (filters.bagsMin !== undefined) {
    dataQuery = dataQuery.gte("bags", filters.bagsMin);
    countQuery = countQuery.gte("bags", filters.bagsMin);
  }
  if (filters.bagsMax !== undefined) {
    dataQuery = dataQuery.lte("bags", filters.bagsMax);
    countQuery = countQuery.lte("bags", filters.bagsMax);
  }
  if (filters.weightMin !== undefined) {
    dataQuery = dataQuery.gte("net_weight_kg", filters.weightMin);
    countQuery = countQuery.gte("net_weight_kg", filters.weightMin);
  }
  if (filters.weightMax !== undefined) {
    dataQuery = dataQuery.lte("net_weight_kg", filters.weightMax);
    countQuery = countQuery.lte("net_weight_kg", filters.weightMax);
  }
  if (filters.packingDateFrom) {
    dataQuery = dataQuery.gte("date_created", filters.packingDateFrom);
    countQuery = countQuery.gte("date_created", filters.packingDateFrom);
  }
  if (filters.packingDateTo) {
    dataQuery = dataQuery.lte("date_created", filters.packingDateTo);
    countQuery = countQuery.lte("date_created", filters.packingDateTo);
  }
  if (!needsComputedFiltering) {
    dataQuery = dataQuery.range(from, to);
    const [{ data, error }, { count, error: countError }] = await Promise.all([dataQuery, countQuery]);
    if (error) throw error;
    if (countError) throw countError;
    const lotRows = (data ?? []).map((lot) => ({
      ...lot,
      factory: lot.factory ?? deriveFactoryFromMark(lot.mark)
    }));
    const activeByLot = await getActiveStatusesForLots(lotRows.map((l) => l.id));
    const samplingByLot = await getSamplingSnapshotByLotIds(lotRows.map((l) => String(l.id)));
    const lots = lotRows.map((lot) =>
      ({
        ...withFlatStatuses(withComputedLifecycle(lot), activeByLot.get(lot.id) ?? null),
        ...(samplingByLot.get(String(lot.id)) ?? {
          is_sampled: false,
          last_sampled_on: null,
          recent_sampling_parties: []
        })
      })
    );
    return { lots, total: count ?? 0 };
  }

  // For status/sampled filtering, compute using both persisted active statuses and fallback derived statuses
  // so filtering matches what UI displays.
  const buildStatusBaseQuery = () => {
    let query = db()
      .from("lots")
      .select("*, auction_tracks(*), private_deals(*, buyers(name))")
      .order("date_created", { ascending: true });
    if (searchClause) query = query.or(searchClause);
    if (filters.grade) query = query.eq("grade", filters.grade);
    if (filters.mark) query = query.eq("mark", filters.mark);
    if (filters.factory) query = query.eq("factory", filters.factory);
    if (filters.bagsMin !== undefined) query = query.gte("bags", filters.bagsMin);
    if (filters.bagsMax !== undefined) query = query.lte("bags", filters.bagsMax);
    if (filters.weightMin !== undefined) query = query.gte("net_weight_kg", filters.weightMin);
    if (filters.weightMax !== undefined) query = query.lte("net_weight_kg", filters.weightMax);
    if (filters.packingDateFrom) query = query.gte("date_created", filters.packingDateFrom);
    if (filters.packingDateTo) query = query.lte("date_created", filters.packingDateTo);
    return query;
  };

  const chunkSize = 1000;
  const allData: LotWithRelations[] = [];
  let start = 0;
  while (true) {
    const { data: chunk, error: chunkError } = await buildStatusBaseQuery().range(start, start + chunkSize - 1);
    if (chunkError) throw chunkError;
    if (!chunk?.length) break;
    allData.push(...((chunk ?? []) as LotWithRelations[]));
    if (chunk.length < chunkSize) break;
    start += chunkSize;
  }

  const allLotRows = allData.map((lot) => ({
    ...lot,
    factory: (lot.factory as string | null) ?? deriveFactoryFromMark(String(lot.mark ?? ""))
  }));
  const activeByLot = await getActiveStatusesForLots(allLotRows.map((l) => l.id));
  const samplingByLot = await getSamplingSnapshotByLotIds(allLotRows.map((l) => String(l.id)));
  const enriched = allLotRows.map((lot) =>
    ({
      ...withFlatStatuses(withComputedLifecycle(lot), activeByLot.get(lot.id) ?? null),
      ...(samplingByLot.get(String(lot.id)) ?? {
        is_sampled: false,
        last_sampled_on: null,
        recent_sampling_parties: []
      })
    })
  );
  const filtered = enriched.filter((lot) => {
    if (filters.sampled === true && !lot.is_sampled) return false;
    if (filters.sampled === false && lot.is_sampled) return false;
    if (!statusFilters.length) return true;
    const statuses = lot.active_statuses ?? [];
    return statuses.some((s) => statusFilters.includes(s));
  });
  const paged = filtered.slice(from, to + 1);
  return { lots: paged, total: filtered.length };
}

export async function getLotWithRelations(lotId: string) {
  const { data, error } = await db()
    .from("lots")
    .select("*, auction_tracks(*), private_deals(*), lot_status_events(*), lot_actions(*)")
    .eq("id", lotId)
    .single();

  if (error) throw error;
  const enriched = withComputedLifecycle({
    ...data,
    factory: data.factory ?? deriveFactoryFromMark(data.mark)
  });
  const activeByLot = await getActiveStatusesForLots([lotId]);
  const lotWithFlat = withFlatStatuses(enriched, activeByLot.get(lotId) ?? null);
  const samplingActions = (data.lot_actions ?? []).filter((action: { action: string }) => action.action === "SAMPLING");
  const samplingSnapshot = (
    await getSamplingSnapshotByLotIds([lotId])
  ).get(lotId) ?? {
    is_sampled: samplingActions.length > 0,
    last_sampled_on: null,
    recent_sampling_parties: []
  };
  return {
    ...lotWithFlat,
    ...samplingSnapshot,
    status_events: (data.lot_status_events ?? []).sort((a: { effective_at: string }, b: { effective_at: string }) =>
      b.effective_at.localeCompare(a.effective_at)
    ),
    actions: (data.lot_actions ?? []).sort((a: { performed_at: string }, b: { performed_at: string }) =>
      b.performed_at.localeCompare(a.performed_at)
    )
  };
}

export async function deleteLotById(lotId: string) {
  const { error } = await db().from("lots").delete().eq("id", lotId);
  if (error) throw error;
}

export async function updateMasterStatus(lotId: string, masterStatus: string) {
  const { error } = await db().from("lots").update({ master_status: masterStatus }).eq("id", lotId);
  if (error) throw error;
}

export async function updateAuctionTrack(lotId: string, patch: Record<string, unknown>) {
  const { data, error } = await db()
    .from("auction_tracks")
    .upsert({ lot_id: lotId, ...patch }, { onConflict: "lot_id" })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function createPrivateDeal(payload: Record<string, unknown>) {
  const { data, error } = await db().from("private_deals").insert(payload).select("*").single();
  if (error) throw error;
  return data;
}

export async function patchPrivateDeal(id: string, payload: Record<string, unknown>) {
  const { data, error } = await db().from("private_deals").update(payload).eq("id", id).select("*").single();
  if (error) throw error;
  return data;
}

export async function getPrivateStatusesForLot(lotId: string): Promise<PrivateDealStatus[]> {
  const { data, error } = await db().from("private_deals").select("status").eq("lot_id", lotId);
  if (error) throw error;
  return (data ?? []).map((row) => row.status as PrivateDealStatus);
}

export async function getAuctionStatusForLot(lotId: string): Promise<AuctionStatus | null> {
  const { data, error } = await db().from("auction_tracks").select("auction_status").eq("lot_id", lotId).maybeSingle();
  if (error) throw error;
  return (data?.auction_status as AuctionStatus | null) ?? null;
}

export async function getAuctionTrackForLot(lotId: string) {
  const { data, error } = await db().from("auction_tracks").select("*").eq("lot_id", lotId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function isLotCancelled(lotId: string): Promise<boolean> {
  const { data, error } = await db().from("lots").select("is_cancelled").eq("id", lotId).single();
  if (error) throw error;
  return Boolean(data.is_cancelled);
}

export async function addLotStatusEvent(input: {
  lotId: string;
  status: GlobalLotStatus;
  source: LotStatusEventSource;
  effectiveAt?: string;
  meta?: Record<string, unknown>;
  createdBy?: string | null;
}) {
  const { data, error } = await db()
    .from("lot_status_events")
    .insert({
      lot_id: input.lotId,
      status: input.status,
      source: input.source,
      effective_at: input.effectiveAt ?? new Date().toISOString(),
      meta: input.meta ?? null,
      created_by: input.createdBy ?? null
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function listLotStatusEvents(lotId: string) {
  const { data, error } = await db()
    .from("lot_status_events")
    .select("*")
    .eq("lot_id", lotId)
    .order("effective_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createLotAction(input: {
  lotId: string;
  action: string;
  resultingStatus: GlobalLotStatus;
  payload: Record<string, unknown>;
  warningFlags?: string[];
  performedBy?: string | null;
  performedAt?: string;
}) {
  const { data, error } = await db()
    .from("lot_actions")
    .insert({
      lot_id: input.lotId,
      action: input.action,
      resulting_status: input.resultingStatus,
      payload: input.payload,
      warning_flags: input.warningFlags ?? [],
      performed_by: input.performedBy ?? null,
      performed_at: input.performedAt ?? new Date().toISOString()
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function listLotActions(lotId: string) {
  const { data, error } = await db()
    .from("lot_actions")
    .select("*")
    .eq("lot_id", lotId)
    .order("performed_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function listSamplingActions() {
  const { data, error } = await db()
    .from("lot_actions")
    .select("id,lot_id,action,payload,performed_at,lots(mark,invoice_number,grade)")
    .eq("action", "SAMPLING")
    .order("performed_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getPrivateDealById(id: string) {
  const { data, error } = await db().from("private_deals").select("*").eq("id", id).single();
  if (error) throw error;
  return data;
}

export async function getActiveStatusesForLots(lotIds: string[]) {
  const result = new Map<string, GlobalLotStatus[]>();
  if (!lotIds.length) return result;
  // Avoid oversized `in(...)` query strings for large lot sets.
  if (lotIds.length > 300) {
    const lotIdSet = new Set(lotIds);
    const { data, error } = await db().from("lot_active_statuses").select("lot_id,status");
    if (error) throw error;
    for (const row of data ?? []) {
      if (!lotIdSet.has(row.lot_id)) continue;
      const arr = result.get(row.lot_id) ?? [];
      arr.push(row.status as GlobalLotStatus);
      result.set(row.lot_id, arr);
    }
    return result;
  }

  const chunkSize = 100;
  for (let i = 0; i < lotIds.length; i += chunkSize) {
    const chunk = lotIds.slice(i, i + chunkSize);
    const { data, error } = await db()
      .from("lot_active_statuses")
      .select("lot_id,status")
      .in("lot_id", chunk);
    if (error) throw error;
    for (const row of data ?? []) {
      const arr = result.get(row.lot_id) ?? [];
      arr.push(row.status as GlobalLotStatus);
      result.set(row.lot_id, arr);
    }
  }
  return result;
}

export async function replaceLotActiveStatuses(lotId: string, statuses: GlobalLotStatus[]) {
  const { error: deleteError } = await db().from("lot_active_statuses").delete().eq("lot_id", lotId);
  if (deleteError) throw deleteError;

  const uniqueStatuses = Array.from(new Set(statuses));
  if (!uniqueStatuses.length) return;
  const now = new Date().toISOString();
  const { error: insertError } = await db().from("lot_active_statuses").upsert(
    uniqueStatuses.map((status) => ({
      lot_id: lotId,
      status,
      since_at: now
    })),
    { onConflict: "lot_id,status" }
  );
  if (insertError) throw insertError;
}

export async function createDispatchAdvice(snapshot: Record<string, unknown>) {
  const { data, error } = await db().from("dispatch_advices").insert(snapshot).select("*").single();
  if (error) throw error;
  return data;
}

export async function getBuyerName(buyerId: string): Promise<string> {
  const { data, error } = await db().from("buyers").select("name").eq("id", buyerId).single();
  if (error) throw error;
  return data.name;
}

export async function getDispatchAdvices() {
  const { data, error } = await db().from("dispatch_advices").select("*").order("generated_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getDashboardMetrics() {
  const [
    { data: lots, error: lotsError },
    { data: deals, error: dealsError },
    { data: auctions, error: auctionsError }
  ] = await Promise.all([
    db().from("lots").select("id,is_cancelled,date_created"),
    db().from("private_deals").select("status,due_date,payment_received_date,final_sale_price_inr,lot_id"),
    db().from("auction_tracks").select("lot_id,auction_status")
  ]);
  if (lotsError) throw lotsError;
  if (dealsError) throw dealsError;
  if (auctionsError) throw auctionsError;
  return { lots: lots ?? [], deals: deals ?? [], auctions: auctions ?? [] };
}

export async function upsertLotStructural(
  rows: Array<{
    mark: string;
    invoice_number: string;
    grade: string;
    bags: number;
    net_weight_kg: number;
    factory: string | null;
    date_created: string;
    is_cancelled: boolean;
  }>
) {
  let created = 0;
  let updated = 0;

  for (const row of rows) {
    const { data: existing, error: findError } = await db()
      .from("lots")
      .select("id")
      .eq("mark", row.mark)
      .eq("invoice_number", row.invoice_number)
      .maybeSingle();
    if (findError) throw findError;

    if (!existing) {
      const { data: inserted, error: insertError } = await db().from("lots").insert({
        ...row,
        master_status: "ACTIVE"
      }).select("id").single();
      if (insertError) throw insertError;
      await replaceLotActiveStatuses(inserted.id, [row.is_cancelled ? "CANCELLED" : "PENDING"]);
      await addLotStatusEvent({
        lotId: inserted.id,
        status: row.is_cancelled ? "CANCELLED" : "PENDING",
        source: "IMPORT",
        meta: { imported: true }
      });
      created += 1;
    } else {
      const { error: updateError } = await db()
        .from("lots")
        .update({
          grade: row.grade,
          bags: row.bags,
          net_weight_kg: row.net_weight_kg,
          factory: row.factory,
          date_created: row.date_created,
          is_cancelled: row.is_cancelled
        })
        .eq("id", existing.id);
      if (updateError) throw updateError;
      await replaceLotActiveStatuses(existing.id, [row.is_cancelled ? "CANCELLED" : "PENDING"]);
      await addLotStatusEvent({
        lotId: existing.id,
        status: row.is_cancelled ? "CANCELLED" : "PENDING",
        source: "IMPORT",
        meta: { imported: true, updated: true }
      });
      updated += 1;
    }
  }

  return { created, updated };
}

export async function createSyncRun(payload: Record<string, unknown>) {
  const { data, error } = await db().from("sync_runs").insert(payload).select("*").single();
  if (error) throw error;
  return data;
}

export async function updateSyncRun(id: string, payload: Record<string, unknown>) {
  const { error } = await db().from("sync_runs").update(payload).eq("id", id);
  if (error) throw error;
}

export async function insertSyncErrors(rows: Array<Record<string, unknown>>) {
  if (!rows.length) return;
  const { error } = await db().from("sync_row_errors").insert(rows);
  if (error) throw error;
}

export async function listSyncRuns() {
  const { data, error } = await db().from("sync_runs").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function listLotFilterOptions() {
  const { data, error } = await db().from("lots").select("mark,factory,grade");
  if (error) throw error;

  const marks = new Set<string>();
  const factories = new Set<string>();
  const grades = new Set<string>();

  for (const row of data ?? []) {
    if (row.mark) marks.add(String(row.mark));
    if (row.factory) factories.add(String(row.factory));
    if (row.grade) grades.add(String(row.grade));
  }

  return {
    marks: Array.from(marks).sort((a, b) => a.localeCompare(b)),
    factories: Array.from(factories).sort((a, b) => a.localeCompare(b)),
    grades: Array.from(grades).sort((a, b) => a.localeCompare(b))
  };
}

export async function listPartyOptions() {
  const [{ data: buyers, error: buyersErr }, { data: actions, error: actionsErr }] = await Promise.all([
    db().from("buyers").select("name").order("name", { ascending: true }),
    db().from("lot_actions").select("payload")
  ]);
  if (buyersErr) throw buyersErr;
  if (actionsErr) throw actionsErr;

  const buyerNames = new Set<string>();
  const brokerNames = new Set<string>();

  for (const row of buyers ?? []) {
    const name = String(row.name ?? "").trim();
    if (name) buyerNames.add(name);
  }

  for (const row of actions ?? []) {
    const payload = (row.payload ?? {}) as Record<string, unknown>;
    const broker = String(payload.broker ?? "").trim();
    if (broker) brokerNames.add(broker);
  }
  for (const broker of defaultBrokerNames) {
    brokerNames.add(broker);
  }

  return {
    buyers: Array.from(buyerNames).sort((a, b) => a.localeCompare(b)),
    brokers: Array.from(brokerNames).sort((a, b) => a.localeCompare(b))
  };
}

export async function bulkUpsertAuctionReserve(lotIds: string[], reservePrice: number) {
  const rows = lotIds.map((id) => ({ lot_id: id, reserve_price_inr: reservePrice, auction_status: "RESERVE_SET" }));
  const { error } = await db().from("auction_tracks").upsert(rows, { onConflict: "lot_id" });
  if (error) throw error;
}

export async function bulkUpsertAuctionStatus(lotIds: string[], status: AuctionStatus) {
  const rows = lotIds.map((id) => ({ lot_id: id, auction_status: status }));
  const { error } = await db().from("auction_tracks").upsert(rows, { onConflict: "lot_id" });
  if (error) throw error;
}

export async function recordWithdrawalPromptAction(privateDealId: string, action: "WITHDRAW_NOW" | "REMIND_LATER" | "NO") {
  const { data, error } = await db()
    .from("withdrawal_prompts")
    .insert({ private_deal_id: privateDealId, action })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function repackLot(input: {
  oldLotId: string;
  newLot: {
    mark: string;
    invoice_number: string;
    grade: string;
    bags: number;
    net_weight_kg: number;
    factory: string | null;
    date_created: string;
  };
}) {
  const { data: newLot, error: createError } = await db()
    .from("lots")
    .insert({
      ...input.newLot,
      is_cancelled: false,
      master_status: "ACTIVE",
      repacked_from_lot_id: input.oldLotId
    })
    .select("*")
    .single();
  if (createError) throw createError;
  await replaceLotActiveStatuses(newLot.id, ["PENDING"]);
  await addLotStatusEvent({
    lotId: newLot.id,
    status: "PENDING",
    source: "SYSTEM",
    meta: { repacked_from: input.oldLotId }
  });

  const { error: oldError } = await db()
    .from("lots")
    .update({
      is_cancelled: true,
      repacked_to_lot_id: newLot.id
    })
    .eq("id", input.oldLotId);
  if (oldError) throw oldError;
  await replaceLotActiveStatuses(input.oldLotId, ["CANCELLED"]);
  await addLotStatusEvent({
    lotId: input.oldLotId,
    status: "CANCELLED",
    source: "SYSTEM",
    meta: { repacked_to: newLot.id }
  });

  return newLot;
}
