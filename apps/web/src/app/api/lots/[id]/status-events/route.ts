import { NextRequest } from "next/server";
import { badRequest, ok, serverError } from "@/lib/http";
import { requireRole } from "@/lib/authz";
import { addLotStatusEvent, listLotStatusEvents } from "@/server/repositories/lots-repo";
import { createLotStatusEventSchema } from "@/server/schemas/lot-schemas";
import { syncLotActiveStatuses } from "@/server/services/lot-status-sync";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole(req, ["admin", "operator"]);
    const { id } = await params;
    const rows = await listLotStatusEvents(id);
    return ok({ rows });
  } catch (error) {
    return serverError(error);
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole(req, ["admin", "operator"]);
    const parsed = createLotStatusEventSchema.safeParse(await req.json());
    if (!parsed.success) return badRequest("Invalid payload", parsed.error.issues);

    const { id } = await params;
    const event = await addLotStatusEvent({
      lotId: id,
      status: parsed.data.status,
      source: parsed.data.source,
      effectiveAt: parsed.data.effective_at,
      meta: parsed.data.meta
    });
    const activeStatuses = await syncLotActiveStatuses(id, parsed.data.source);
    return ok({ event, activeStatuses }, 201);
  } catch (error) {
    return serverError(error);
  }
}

