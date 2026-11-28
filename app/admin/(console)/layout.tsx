import type { ReactNode } from "react";
import { AdminConsole } from "@/components/admin/AdminConsole";

export const metadata = { robots: { index: false } };

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AdminConsole>{children}</AdminConsole>;
}
