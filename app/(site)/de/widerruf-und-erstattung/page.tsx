import { ICERIK_DE } from "../../_content/de";
import { Sayfa, sayfaMetadata } from "../../_views/sayfa";

// Kayıt defterinden çizilen sayfa (_content/sayfalar.ts). Elle yazılmadı.
export const metadata = sayfaMetadata("refund", "de", ICERIK_DE);

export default function Page() {
  return <Sayfa id="refund" locale="de" icerik={ICERIK_DE} />;
}
