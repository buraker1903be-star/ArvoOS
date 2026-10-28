import { ICERIK_FR } from "../../_content/fr";
import { Sayfa, sayfaMetadata } from "../../_views/sayfa";

// Kayıt defterinden çizilen sayfa (_content/sayfalar.ts). Elle yazılmadı.
export const metadata = sayfaMetadata("distance-sales", "fr", ICERIK_FR);

export default function Page() {
  return <Sayfa id="distance-sales" locale="fr" icerik={ICERIK_FR} />;
}
