import { notFound } from "next/navigation";
import { AdminSectionContent } from "@/components/admin/AdminConsole";
import { ADMIN_NAV, ADMIN_SECTIONS } from "@/components/admin/adminRoutes";

const sections = ADMIN_NAV.filter((key) => key !== "dashboard" && key !== "packs");
const sectionFromSlug = (slug: string) => sections.find((key) => ADMIN_SECTIONS[key].slug === slug);

type Props = { params: Promise<{ section: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return sections.map((key) => ({ section: ADMIN_SECTIONS[key].slug }));
}

export async function generateMetadata({ params }: Props) {
  const { section } = await params;
  const key = sectionFromSlug(section);
  if (!key) notFound();
  return { title: `${ADMIN_SECTIONS[key].label} · Régie du Ter` };
}

export default async function SectionPage({ params }: Props) {
  const { section } = await params;
  const key = sectionFromSlug(section);
  if (!key) notFound();
  return <AdminSectionContent section={key} />;
}
