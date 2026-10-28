import { ICERIK_AR } from "../../_content/ar";
import { Sayfa, sayfaMetadata } from "../../_views/sayfa";

// Kayıt defterinden çizilen sayfa (_content/sayfalar.ts). Elle yazılmadı.
export const metadata = sayfaMetadata("pricing", "ar", ICERIK_AR);

export default function Page() {
  return <Sayfa id="pricing" locale="ar" icerik={ICERIK_AR} />;
}
