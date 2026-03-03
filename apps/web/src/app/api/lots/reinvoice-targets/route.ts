import { NextRequest } from "next/server";
import { badRequest, ok, serverError } from "@/lib/http";
import { requireRole } from "@/lib/authz";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getActiveStatusesForLots } from "@/server/repositories/lots-repo";
import { GlobalLotStatus } from "@/lib/types";

type ReinvoiceTargetRow = {
  id: string;
  mark: string;
  invoice_number: string;
  grade: string;
  bags: number;
  net_weight_kg: number;
  date_created: string;
  repacked_from_lot_id: string | null;
  is_cancelled: boolean;
};

export async function GET(req: NextRequest) {
  try {
    await requireRole(req, ["admin", "operator"]);
    const search = String(req.nextUrl.searchParams.get("search") ?? "").trim();
    const requestedLimit = Number(req.nextUrl.searchParams.get("limit") ?? "100");
    const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 200) : 100;

    let query = getSupabaseAdmin()
      .from("lots")
      .select("id,mark,invoice_number,grade,bags,net_weight_kg,date_created,repacked_from_lot_id,is_cancelled")
      .eq("is_cancelled", false)
      .order("date_created", { ascending: false })
      .limit(limit * 4);

    if (search) {
      const escaped = search.replaceAll(",", "\\,");
      query = query.or(`invoice_number.ilike.%${escaped}%,mark.ilike.%${escaped}%`);
    }

    const { data, error } = await query;
    if (error) throw error;

    const rows = (data ?? []) as ReinvoiceTargetRow[];
    const activeByLot = await getActiveStatusesForLots(rows.map((row) => row.id));
    const pendingRows = rows
      .filter((row) => {
        const statuses = (activeByLot.get(row.id) ?? ["PENDING"]) as GlobalLotStatus[];
        return statuses.length === 1 && statuses[0] === "PENDING";
      })
      .slice(0, limit);

    return ok({ rows: pendingRows });
  } catch (error) {
    if (error instanceof Error && error.message.toLowerCase().includes("invalid input syntax")) {
      return badRequest("Invalid search query.");
    }
    return serverError(error);
  }
}
