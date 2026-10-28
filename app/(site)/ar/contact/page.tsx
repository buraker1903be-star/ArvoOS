import { ICERIK_AR } from "../../_content/ar";
import { Sayfa, sayfaMetadata } from "../../_views/sayfa";

// Kayıt defterinden çizilen sayfa (_content/sayfalar.ts). Elle yazılmadı.
export const metadata = sayfaMetadata("contact", "ar", ICERIK_AR);

export default function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <Sayfa id="contact" locale="ar" icerik={ICERIK_AR} searchParams={searchParams} />;
}
