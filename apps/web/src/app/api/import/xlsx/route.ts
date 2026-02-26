import { NextRequest } from "next/server";
import { badRequest, ok, serverError } from "@/lib/http";
import { requireRole } from "@/lib/authz";
import {
  createSyncRun,
  insertSyncErrors,
  updateSyncRun,
  upsertLotStructural
} from "@/server/repositories/lots-repo";
import { mapRowsToLotStructural, parseXlsxLots } from "@/server/services/xlsx-import";

export async function POST(req: NextRequest) {
  try {
    await requireRole(req, ["admin", "operator"]);
    const formData = await req.formData();
    const file = formData.get("file");
    const mode = String(formData.get("mode") ?? "commit");
    if (!(file instanceof File)) return badRequest("Missing file");

    const run = await createSyncRun({
      filename: file.name,
      status: "PROCESSING",
      total_rows: 0,
      created_count: 0,
      updated_count: 0,
      error_count: 0
    });

    const { validRows, errors } = parseXlsxLots(await file.arrayBuffer());
    const mapped = mapRowsToLotStructural(validRows);

    if (errors.length) {
      await insertSyncErrors(
        errors.map((e) => ({ sync_run_id: run.id, row_number: e.row_number, message: e.message }))
      );
    }

    if (mode === "dry-run") {
      await updateSyncRun(run.id, {
        status: "COMPLETED",
        total_rows: validRows.length + errors.length,
        error_count: errors.length
      });
      return ok({
        runId: run.id,
        mode,
        preview: mapped.slice(0, 50),
        counts: {
          total: validRows.length + errors.length,
          valid: validRows.length,
          errors: errors.length
        }
      });
    }

    const result = await upsertLotStructural(mapped);

    await updateSyncRun(run.id, {
      status: "COMPLETED",
      total_rows: validRows.length + errors.length,
      created_count: result.created,
      updated_count: result.updated,
      error_count: errors.length
    });

    return ok({
      runId: run.id,
      counts: {
        total: validRows.length + errors.length,
        created: result.created,
        updated: result.updated,
        errors: errors.length
      }
    });
  } catch (error) {
    return serverError(error);
  }
}
