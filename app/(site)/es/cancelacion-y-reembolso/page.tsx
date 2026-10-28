import { ICERIK_ES } from "../../_content/es";
import { Sayfa, sayfaMetadata } from "../../_views/sayfa";

// Kayıt defterinden çizilen sayfa (_content/sayfalar.ts). Elle yazılmadı.
export const metadata = sayfaMetadata("refund", "es", ICERIK_ES);

export default function Page() {
  return <Sayfa id="refund" locale="es" icerik={ICERIK_ES} />;
}
