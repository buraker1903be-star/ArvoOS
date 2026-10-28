import { ICERIK_FR } from "../../_content/fr";
import { Sayfa, sayfaMetadata } from "../../_views/sayfa";

// Kayıt defterinden çizilen sayfa (_content/sayfalar.ts). Elle yazılmadı.
export const metadata = sayfaMetadata("contact", "fr", ICERIK_FR);

export default function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <Sayfa id="contact" locale="fr" icerik={ICERIK_FR} searchParams={searchParams} />;
}
