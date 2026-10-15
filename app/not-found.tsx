import type { Metadata } from "next";
import { Bulunamadi } from "./_components/bulunamadi";

export const metadata: Metadata = {
  title: "Sayfa bulunamadı | Arvo",
  robots: { index: false, follow: false },
};

export default function SayfaBulunamadi() {
  return (
    <Bulunamadi
      ust="404"
      baslik="Bu sayfa bulunamadı"
      aciklama="Adres yanlış yazılmış ya da sayfa kaldırılmış olabilir. Bir sözleşme veya teklif bağlantısını açmaya çalışıyorsanız, güncel bağlantıyı size gönderen kurumdan isteyebilirsiniz."
      eylem={{ href: "/", etiket: "Arvo ana sayfası" }}
    />
  );
}
