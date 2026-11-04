import { requireUserPage } from "@/server/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireUserPage();
  return children;
}
