import { ICERIK_FR } from "../../_content/fr";
import { Sayfa, sayfaMetadata } from "../../_views/sayfa";

// Kayıt defterinden çizilen sayfa (_content/sayfalar.ts). Elle yazılmadı.
export const metadata = sayfaMetadata("refund", "fr", ICERIK_FR);

export default function Page() {
  return <Sayfa id="refund" locale="fr" icerik={ICERIK_FR} />;
}
