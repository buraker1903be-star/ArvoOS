import { ICERIK_DE } from "../../_content/de";
import { Sayfa, sayfaMetadata } from "../../_views/sayfa";

// Kayıt defterinden çizilen sayfa (_content/sayfalar.ts). Elle yazılmadı.
export const metadata = sayfaMetadata("contact", "de", ICERIK_DE);

export default function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <Sayfa id="contact" locale="de" icerik={ICERIK_DE} searchParams={searchParams} />;
}
