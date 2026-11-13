import { handleUpload } from "../../_lib/uploads";

// Document and photo uploads for a property (multipart/form-data, up to 9 MB).
export async function POST(request: Request, ctx: RouteContext<"/properties/[id]/files">) {
  const { id } = await ctx.params;
  return handleUpload(request, { kind: "property", id });
}
