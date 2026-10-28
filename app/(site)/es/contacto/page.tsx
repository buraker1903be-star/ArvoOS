import { ICERIK_ES } from "../../_content/es";
import { Sayfa, sayfaMetadata } from "../../_views/sayfa";

// Kayıt defterinden çizilen sayfa (_content/sayfalar.ts). Elle yazılmadı.
export const metadata = sayfaMetadata("contact", "es", ICERIK_ES);

export default function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <Sayfa id="contact" locale="es" icerik={ICERIK_ES} searchParams={searchParams} />;
}
