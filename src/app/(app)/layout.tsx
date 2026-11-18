import { requireUser } from "@/lib/auth";
import { Sidebar, BottomNav } from "@/components/nav";
import { ServiceWorker } from "@/components/service-worker";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  await requireUser();
  return (
    <div className="flex min-h-dvh">
      <Sidebar />
      <div className="min-w-0 flex-1 pb-20 md:pb-0">{children}</div>
      <BottomNav />
      <ServiceWorker />
    </div>
  );
}
