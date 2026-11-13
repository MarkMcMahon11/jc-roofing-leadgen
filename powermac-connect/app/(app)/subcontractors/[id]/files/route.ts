import { handleUpload } from "../../../properties/_lib/uploads";

// Document uploads for a subcontractor (insurance, CIS, accreditations, RAMS), up to 9 MB.
export async function POST(request: Request, ctx: RouteContext<"/subcontractors/[id]/files">) {
  const { id } = await ctx.params;
  return handleUpload(request, { kind: "subcontractor", id });
}
