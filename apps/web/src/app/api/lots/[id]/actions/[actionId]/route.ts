import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/authz";
import {
  addLotStatusEvent,
  deleteLotActionById,
  getLatestLifecycleAction,
  getLatestLotAction,
  getLotActionById,
  replaceLotActiveStatuses
} from "@/server/repositories/lots-repo";
import { actionNames, isLifecycleAction, type LotActionName } from "@/server/services/lot-actions";
import { GlobalLotStatus } from "@/lib/types";
import { getSupabaseAdmin } from "@/lib/supabase";

type RouteParams = { id: string; actionId: string };

const lifecycleActionNames = actionNames.filter((name) => isLifecycleAction(name as string)) as LotActionName[];

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

    await deleteLotActionById(lotId, actionId);

    let rolledBackToStatus: GlobalLotStatus | undefined;
    if (isLifecycleAction(String(action.action))) {
      const latestLifecycle = await getLatestLifecycleAction(lotId, lifecycleActionNames);
      rolledBackToStatus = (latestLifecycle?.resulting_status as GlobalLotStatus | null) ?? "PENDING";

      await replaceLotActiveStatuses(lotId, [rolledBackToStatus]);
      await addLotStatusEvent({
        lotId,
        status: rolledBackToStatus,
        source: "SYSTEM",
        meta: {
          rollback_from_deleted_action_id: actionId,
          deleted_action: action.action,
          deleted_resulting_status: action.resulting_status
        }
      });

      if (String(action.action) === "CANCELLED" || rolledBackToStatus === "CANCELLED") {
        await getSupabaseAdmin().from("lots").update({ is_cancelled: rolledBackToStatus === "CANCELLED" }).eq("id", lotId);
      }
    }

    return NextResponse.json({ deleted: true, rolledBackToStatus }, { status: 200 });
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
