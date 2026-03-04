import { NextRequest } from "next/server";
import { requireRole } from "@/lib/authz";
import { badRequest, ok, serverError } from "@/lib/http";
import { getSupabaseAdmin } from "@/lib/supabase";

type LotRow = {
  id: string;
  mark: string;
  invoice_number: string;
  grade: string;
  bags: number;
  net_weight_kg: number;
  date_created: string;
};

type ActionRow = {
  lot_id: string;
  action: string;
  payload: Record<string, unknown> | null;
  performed_at: string;
};

function normalizeText(value: unknown): string {
  return String(value ?? "").trim();
}

function parseSaleNo(payload: Record<string, unknown> | null): string {
  return normalizeText(payload?.sale_no) || "-";
}

function parseAuctionCentre(payload: Record<string, unknown> | null): string {
  return normalizeText(payload?.auction_centre) || "-";
}

export async function GET(req: NextRequest) {
  try {
    await requireRole(req, ["admin", "operator"]);
    const status = req.nextUrl.searchParams.get("status")?.trim().toUpperCase() || "CATALOGUED";
    if (!status) return badRequest("Status is required");

    const supabase = getSupabaseAdmin();
    const { data: activeRows, error: activeError } = await supabase
      .from("lot_active_statuses")
      .select("lot_id")
      .eq("status", status);
    if (activeError) throw activeError;

    const lotIds = Array.from(new Set((activeRows ?? []).map((row) => String(row.lot_id)).filter(Boolean)));
    if (!lotIds.length) return ok({ rows: [] });

    const lotsById = new Map<string, LotRow>();
    const chunkSize = 200;
    for (let i = 0; i < lotIds.length; i += chunkSize) {
      const chunk = lotIds.slice(i, i + chunkSize);
      const { data: lotChunk, error: lotError } = await supabase
        .from("lots")
        .select("id,mark,invoice_number,grade,bags,net_weight_kg,date_created")
        .in("id", chunk);
      if (lotError) throw lotError;
      for (const row of lotChunk ?? []) {
        lotsById.set(String(row.id), {
          id: String(row.id),
          mark: String(row.mark ?? ""),
          invoice_number: String(row.invoice_number ?? ""),
          grade: String(row.grade ?? ""),
          bags: Number(row.bags ?? 0),
          net_weight_kg: Number(row.net_weight_kg ?? 0),
          date_created: String(row.date_created ?? "")
        });
      }
    }

    const actionsByLot = new Map<string, ActionRow[]>();
    for (let i = 0; i < lotIds.length; i += chunkSize) {
      const chunk = lotIds.slice(i, i + chunkSize);
      const { data: actionChunk, error: actionError } = await supabase
        .from("lot_actions")
        .select("lot_id,action,payload,performed_at")
        .in("lot_id", chunk)
        .in("action", ["DISPATCH_TO_AUCTION", "PRINT", "SET_RESERVE_PRICE", "SOLD_AUCTION", "OUT"])
        .order("performed_at", { ascending: false });
      if (actionError) throw actionError;
      for (const row of actionChunk ?? []) {
        const lotId = String(row.lot_id);
        const list = actionsByLot.get(lotId) ?? [];
        list.push({
          lot_id: lotId,
          action: String(row.action ?? ""),
          payload: (row.payload as Record<string, unknown> | null) ?? null,
          performed_at: String(row.performed_at ?? "")
        });
        actionsByLot.set(lotId, list);
      }
    }

    const rows = lotIds
      .map((lotId) => {
        const lot = lotsById.get(lotId);
        if (!lot) return null;
        const actions = actionsByLot.get(lotId) ?? [];
        const dispatch = actions.find((row) => row.action === "DISPATCH_TO_AUCTION");
        const saleAction =
          actions.find((row) => row.action === "PRINT") ??
          actions.find((row) => row.action === "SET_RESERVE_PRICE") ??
          actions.find((row) => row.action === "OUT") ??
          actions.find((row) => row.action === "SOLD_AUCTION");

        return {
          ...lot,
          status,
          auction_centre: parseAuctionCentre(dispatch?.payload ?? null),
          sale_no: parseSaleNo(saleAction?.payload ?? null)
        };
      })
      .filter((row): row is NonNullable<typeof row> => Boolean(row))
      .sort((a, b) => a.date_created.localeCompare(b.date_created) || a.mark.localeCompare(b.mark) || a.invoice_number.localeCompare(b.invoice_number));

    return ok({ rows });
  } catch (error) {
    return serverError(error);
  }
}
