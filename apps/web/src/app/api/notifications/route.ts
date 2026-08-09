import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { NOTIFICATION_PAGE_SIZE } from "@deployx/shared";

/**
 * GET /api/notifications
 * Paginated notifications for the current user.
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const unreadOnly = searchParams.get("unread_only") === "true";
  const limit = Math.min(
    Number(searchParams.get("limit")) || NOTIFICATION_PAGE_SIZE,
    100,
  );
  const offset = Math.max(Number(searchParams.get("offset")) || 0, 0);

  let query = supabase
    .from("notifications")
    .select("*")
    .or(`user_id.eq.${user.id},user_id.is.null`)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (unreadOnly) {
    query = query.eq("is_read", false);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json(
      { error: "Failed to fetch notifications" },
      { status: 500 },
    );
  }

  // Count unread
  const { count } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .or(`user_id.eq.${user.id},user_id.is.null`)
    .eq("is_read", false);

  return NextResponse.json({
    notifications: data ?? [],
    unread_count: count ?? 0,
  });
}
