import { ICERIK_AR } from "../../../../_content/ar";
import { Sayfa, sayfaMetadata } from "../../../../_views/sayfa";

// Kayıt defterinden çizilen sayfa (_content/sayfalar.ts). Elle yazılmadı.
export const metadata = sayfaMetadata("arvoos-solutions", "ar", ICERIK_AR);

export default function Page() {
  return <Sayfa id="arvoos-solutions" locale="ar" icerik={ICERIK_AR} />;
}
