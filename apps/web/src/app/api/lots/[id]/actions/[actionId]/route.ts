import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/authz";
import {
  addLotStatusEvent,
  deleteLotActionById,
  getActiveStatusesForLots,
  getLatestLotAction,
  getLotActionById,
  listLotActions,
  replaceLotActiveStatuses
} from "@/server/repositories/lots-repo";
import { normalizeCurrentStatus, replayStatusesFromActions } from "@/server/services/lot-actions";
import { GlobalLotStatus } from "@/lib/types";
import { getSupabaseAdmin } from "@/lib/supabase";

type RouteParams = { id: string; actionId: string };

export async function DELETE(req: NextRequest, { params }: { params: Promise<RouteParams> }) {
  try {
    await requireRole(req, ["admin", "operator"]);
    const { id: lotId, actionId } = await params;

    const action = await getLotActionById(lotId, actionId);
    if (!action) {
      return NextResponse.json({ error: "Action not found for this lot." }, { status: 404 });
    }

    const latest = await getLatestLotAction(lotId);
    if (!latest || latest.id !== actionId) {
      return NextResponse.json({ error: "Only the latest action can be deleted." }, { status: 409 });
    }

    const currentMap = await getActiveStatusesForLots([lotId]);
    const previousStatuses = currentMap.get(lotId) ?? ["PENDING"];

    await deleteLotActionById(lotId, actionId);

    const remainingActions = await listLotActions(lotId);
    const activeStatuses = replayStatusesFromActions(remainingActions);
    const rolledBackToStatus = normalizeCurrentStatus(activeStatuses) as GlobalLotStatus;

    await replaceLotActiveStatuses(lotId, activeStatuses);
    const prevSet = new Set(previousStatuses);
    const nextSet = new Set(activeStatuses);
    for (const status of activeStatuses) {
      if (prevSet.has(status)) continue;
      await addLotStatusEvent({
        lotId,
        status,
        source: "SYSTEM",
        meta: {
          rollback_from_deleted_action_id: actionId,
          deleted_action: action.action,
          deleted_resulting_status: action.resulting_status
        }
      });
    }
    for (const status of previousStatuses) {
      if (nextSet.has(status)) continue;
      await addLotStatusEvent({
        lotId,
        status: status as GlobalLotStatus,
        source: "SYSTEM",
        meta: {
          rollback_from_deleted_action_id: actionId,
          deleted_action: action.action,
          deleted_resulting_status: action.resulting_status,
          removed: true
        }
      });
    }

    await getSupabaseAdmin()
      .from("lots")
      .update({ is_cancelled: activeStatuses.includes("CANCELLED") })
      .eq("id", lotId);

    return NextResponse.json({ deleted: true, rolledBackToStatus, activeStatuses }, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : typeof error === "object" && error !== null && "message" in error && typeof error.message === "string"
          ? error.message
          : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
