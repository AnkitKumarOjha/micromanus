import { getSessionUser } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

// Authenticated PDF download. Verifies the requester owns the parent chat
// before streaming the file out of the private storage bucket.
export async function GET(
  _request: Request,
  { params }: { params: { artifactId: string } },
) {
  const user = await getSessionUser();
  if (!user) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const service = createSupabaseServiceClient();

  const { data: artifact } = await service
    .from("artifacts")
    .select("id, chat_id, storage_path, title")
    .eq("id", params.artifactId)
    .maybeSingle();
  if (!artifact) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  // Ownership check via the parent chat.
  const { data: chat } = await service
    .from("chats")
    .select("user_id")
    .eq("id", artifact.chat_id)
    .maybeSingle();
  if (!chat || chat.user_id !== user.id) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: file, error } = await service.storage
    .from("reports")
    .download(artifact.storage_path);
  if (error || !file) {
    return Response.json(
      { error: error?.message ?? "File unavailable" },
      { status: 404 },
    );
  }

  const safeTitle = (artifact.title ?? "report")
    .replace(/[^a-z0-9-_ ]/gi, "")
    .trim()
    .slice(0, 60)
    .replace(/\s+/g, "_") || "report";

  const arrayBuffer = await file.arrayBuffer();
  return new Response(arrayBuffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${safeTitle}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
