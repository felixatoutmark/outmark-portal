import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

export default async function Root() {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  if (u.role === "admin") redirect("/admin");
  redirect("/dashboard");
}
