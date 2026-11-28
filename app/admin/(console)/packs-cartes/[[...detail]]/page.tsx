import { notFound } from "next/navigation";
import { PowerPackAdmin } from "@/components/admin/PowerPackImporter";
import { BUILTIN_POWER_ART_IDS, isAssetPackForScope, isImportedPowerPackId } from "@/domain/assetPacks";

export const metadata = { title: "Packs de cartes Pouvoir" };

export default async function PowerPacksPage({ params }: { params: Promise<{ detail?: string[] }> }) {
  const { detail = [] } = await params;
  const [packId, cardId] = detail;
  if (detail.length > 2
    || (packId && !isImportedPowerPackId(packId) && !isAssetPackForScope(packId, "powers", []))
    || (cardId && !BUILTIN_POWER_ART_IDS.some((id) => id === cardId))) notFound();
  return <PowerPackAdmin key={detail.join("/")} packId={packId} cardId={cardId} />;
}
