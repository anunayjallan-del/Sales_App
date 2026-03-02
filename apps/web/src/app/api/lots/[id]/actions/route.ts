import { NextRequest } from "next/server";
import { badRequest, ok, serverError } from "@/lib/http";
import { requireRole } from "@/lib/authz";
import {
  addLotStatusEvent,
  createLotAction,
  getActiveStatusesForLots,
  getLatestDispatchToAuctionAction,
  getLotWithRelations,
  listLotActions,
  replaceLotActiveStatuses
} from "@/server/repositories/lots-repo";
import { createLotActionSchema } from "@/server/schemas/lot-schemas";
import {
  actionLabel,
  actionRules,
  isActionAllowedFrom,
  normalizeCurrentStatus,
  parseActionPayload
} from "@/server/services/lot-actions";
import { deriveWarnings } from "@/server/services/flat-status-engine";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole(req, ["admin", "operator"]);
    const { id } = await params;
    const rows = await listLotActions(id);
    return ok({ rows });
  } catch (error) {
    return serverError(error);
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole(req, ["admin", "operator"]);
    const parsed = createLotActionSchema.safeParse(await req.json());
    if (!parsed.success) return badRequest("Invalid payload", parsed.error.issues);

    const { id } = await params;
    const lot = await getLotWithRelations(id);
    const activeMap = await getActiveStatusesForLots([id]);
    const activeStatuses = activeMap.get(id) ?? (lot.active_statuses ?? ["PENDING"]);
    const currentStatus = normalizeCurrentStatus(activeStatuses);

    if (!isActionAllowedFrom(parsed.data.action, currentStatus)) {
      return badRequest(`Action ${actionLabel(parsed.data.action)} is not allowed from status ${currentStatus}.`);
    }

    const actionPayload = parseActionPayload(parsed.data.action, parsed.data.data);
    if (!actionPayload.success) return badRequest("Missing/invalid action fields", actionPayload.error.issues);

    const rule = actionRules[parsed.data.action];
    const nextStatus = rule.resultingStatus;

    // Reinvoice special handling: old lot cancelled + new lot pending with new invoice.
    if (parsed.data.action === "REINVOICED") {
      const payload = actionPayload.data as { new_lot_number: string; reinvoice_date: string; remarks?: string };
      const { data: newLot, error: createError } = await getSupabaseAdmin()
        .from("lots")
        .insert({
          mark: lot.mark,
          invoice_number: payload.new_lot_number,
          grade: lot.grade,
          bags: lot.bags,
          net_weight_kg: lot.net_weight_kg,
          factory: lot.factory,
          date_created: payload.reinvoice_date,
          is_cancelled: false,
          repacked_from_lot_id: id
        })
        .select("*")
        .single();
      if (createError) throw createError;

      await replaceLotActiveStatuses(id, ["CANCELLED"]);
      await addLotStatusEvent({
        lotId: id,
        status: "CANCELLED",
        source: "MANUAL",
        meta: { reinvoiced_to: newLot.id, ...payload }
      });
      await replaceLotActiveStatuses(newLot.id, ["PENDING"]);
      await addLotStatusEvent({
        lotId: newLot.id,
        status: "PENDING",
        source: "MANUAL",
        meta: { reinvoiced_from: id, ...payload }
      });

      const warnings = deriveWarnings(["CANCELLED"]);
      const actionRow = await createLotAction({
        lotId: id,
        action: parsed.data.action,
        resultingStatus: "PENDING",
        payload: actionPayload.data,
        warningFlags: warnings
      });
      return ok({ action: actionRow, activeStatuses: ["CANCELLED"], warnings, reinvoicedLot: newLot }, 201);
    }

    if (parsed.data.action === "CANCELLED") {
      await getSupabaseAdmin().from("lots").update({ is_cancelled: true }).eq("id", id);
    }
    if (parsed.data.action === "PAYMENT_RECEIVED") {
      await getSupabaseAdmin()
        .from("lots")
        .update({ is_cancelled: false })
        .eq("id", id);
    }

    const isLifecycleTransition = !rule.eventOnly && Boolean(nextStatus);
    if (isLifecycleTransition && nextStatus) {
      await replaceLotActiveStatuses(id, [nextStatus]);
      await addLotStatusEvent({
        lotId: id,
        status: nextStatus,
        source: "MANUAL",
        meta: { action: parsed.data.action, ...actionPayload.data }
      });
    }
    const resultingStatusForAudit = isLifecycleTransition && nextStatus ? nextStatus : currentStatus;
    const resultingStatuses = isLifecycleTransition && nextStatus ? [nextStatus] : activeStatuses;
    const warnings = deriveWarnings(resultingStatuses);
    if (parsed.data.action === "AUCTION_DISPATCHED") {
      const latestPrepared = await getLatestDispatchToAuctionAction(id);
      if (!latestPrepared) {
        warnings.push("DISPATCH_ADVICE_MISSING");
      }
    }
    const actionRow = await createLotAction({
      lotId: id,
      action: parsed.data.action,
      resultingStatus: resultingStatusForAudit,
      payload: actionPayload.data,
      warningFlags: warnings
    });

    return ok({ action: actionRow, activeStatuses: resultingStatuses, warnings }, 201);
  } catch (error) {
    return serverError(error);
  }
}
