import type { Metadata } from "next";
import { Bulunamadi } from "@/app/_components/bulunamadi";

export const metadata: Metadata = {
  title: "Bağlantı geçersiz",
  robots: { index: false, follow: false },
};

// Belge yüklenemediğinde (yanlış anahtar, kaldırılmış kayıt) sayfa
// notFound() çağırıyor. Burada kurumu bilmiyoruz — anahtar çözülmedi —
// bu yüzden ne logo ne de kurum adı var; metin de kimsenin adına
// konuşmuyor, yalnızca ne yapılacağını söylüyor.
export default function BelgeBulunamadi() {
  return (
    <Bulunamadi
      ust="BAĞLANTI GEÇERSİZ"
      baslik="Bu belge görüntülenemiyor"
      aciklama="Bağlantının süresi dolmuş, yenilenmiş ya da belge kaldırılmış olabilir. Güncel sözleşme bağlantısını size gönderen kurumdan isteyebilirsiniz."
    />
  );
}
