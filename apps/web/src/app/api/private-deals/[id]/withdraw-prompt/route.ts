import { NextRequest } from "next/server";
import { z } from "zod";
import { badRequest, ok, serverError } from "@/lib/http";
import { requireRole } from "@/lib/authz";
import { recordWithdrawalPromptAction } from "@/server/repositories/lots-repo";

const schema = z.object({
  action: z.enum(["WITHDRAW_NOW", "REMIND_LATER", "NO"]),
  lot_id: z.string().uuid()
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole(req, ["admin", "operator"]);
    const body = schema.safeParse(await req.json());
    if (!body.success) return badRequest("Invalid payload", body.error.issues);

    const { id } = await params;
    const result = await recordWithdrawalPromptAction(id, body.data.action);

    return ok(
      {
        result,
        note:
          body.data.action === "WITHDRAW_NOW"
            ? "Withdrawal intent recorded. Apply the explicit WITHDRAW action on the lot to change lifecycle status."
            : undefined
      },
      201
    );
  } catch (error) {
    return serverError(error);
  }
}
