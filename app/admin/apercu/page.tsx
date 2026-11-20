import { EventPreviewHost } from "@/components/admin/EventPreviewHost";

export const metadata = { title: "Aperçu événement", robots: { index: false } };

export default function EventPreviewPage() {
  return <EventPreviewHost />;
}
