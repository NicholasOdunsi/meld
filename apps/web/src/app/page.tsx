import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient(new Headers());
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/sign-in");
  }

  const { data: membership, error } = await supabase
    .from("memberships")
    .select("workspace_id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .order("workspace_id", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!membership) {
    redirect("/onboarding");
  }

  redirect(`/${membership.workspace_id}`);
}
