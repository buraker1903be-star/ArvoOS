import { unstable_cache } from "next/cache";
import { getArvolabBridgeHealth } from "@/lib/arvolab";
import { getArcBridgeHealth } from "@/lib/arc-bridge";
import { getRandevuBridgeHealth } from "@/lib/randevu-bridge";

/*
  ÜÇ KÖPRÜNÜN SAĞLIĞI, 60 SANİYE ÖNBELLEKTE (02.11.2026, hızlandırma).

  Konsol ana sayfası, Ürünler ve Ayarlar her açılışta üç ayrı Supabase
  projesine (ArvoLab, ArvoARC, ArvoCal) gidip köprünün ayakta olup
  olmadığını soruyordu; canlıda Ürünler'in yavaş açılışının (p75 ~560 ms)
  sebebi buydu. Köprü durumu dakikalar içinde değişen bir şey değil ve
  bu üç ekran yalnızca "ayakta mı" diye bakıyor.

  SİSTEM SAĞLIĞI BİLEREK CANLI okuyor (getArvolabBridgeHealth vb.
  doğrudan): orası teşhis ekranı ve "Yenile" düğmesi gerçekten yenilemeli.
  Kopya okumaları (…Kopyalari) önbelleğe girmiyor: Map döndürüyorlar ve
  önbellek JSON'a çevirip boş nesne bırakırdı.
*/
export const kopruSagliklari = unstable_cache(
  async () => {
    const [arvolab, arc, randevu] = await Promise.all([getArvolabBridgeHealth(), getArcBridgeHealth(), getRandevuBridgeHealth()]);
    return { arvolab, arc, randevu };
  },
  ["kopru-sagliklari"],
  { revalidate: 60 },
);
