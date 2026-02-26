import { NextRequest } from "next/server";
import { getDispatchAdvices } from "@/server/repositories/lots-repo";
import { requireRole } from "@/lib/authz";
import { ok, serverError } from "@/lib/http";

function toCsv(rows: Array<Record<string, unknown>>) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(",")];
  for (const row of rows) {
    const line = headers
      .map((h) => {
        const raw = String(row[h] ?? "");
        return `"${raw.replaceAll('"', '""')}"`;
      })
      .join(",");
    lines.push(line);
  }
  return lines.join("\n");
}

export async function GET(req: NextRequest) {
  try {
    await requireRole(req, ["admin", "operator"]);
    const rows = await getDispatchAdvices();
    const format = req.nextUrl.searchParams.get("format");

    if (format === "csv") {
      return new Response(toCsv(rows), {
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename=dispatch-advices-${new Date().toISOString().slice(0, 10)}.csv`
        }
      });
    }

    return ok({ rows });
  } catch (error) {
    return serverError(error);
  }
}
