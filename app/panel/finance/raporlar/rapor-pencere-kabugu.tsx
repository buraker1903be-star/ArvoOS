"use client";

import { useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useOdakTuzagi } from "../../components/odak-tuzagi";

/*
  RAPOR PENCERESİNİN KLAVYE VE ODAK DAVRANIŞI.

  Pencere ADRESTEN açılıyor (`?rapor=satis`), yani içeriğini SUNUCU
  çiziyor: sorgular sunucuda kalıyor ve RLS kendiliğinden uyguluyor,
  geri tuşu önceki rapora dönüyor, filtreler adreste olduğu için
  raporlar arası geçişte taşınıyor. Bu depodaki `?pencere=` kalıbının
  aynısı (cari hesap, iş maliyeti).

  Burada veri yok; yalnızca PanelDrawer'ın üç davranışı:
   - pencere `.panel-root`'a PORTAL ile basılıyor. Düğmenin ya da
     sayfanın üst öğelerinden biri transform/filter/backdrop-filter
     taşıyınca `position:fixed` ona hapsoluyor ve pencere görünmez
     oluyor (panel-drawer.tsx'teki gerekçe). Üstelik odak tuzağı inert'i
     `.panel-root`'un DOĞRUDAN çocuklarına koyuyor: sayfanın içinde
     çizilen bir pencere kendisi inert olurdu,
   - Esc kapatma adresine GİDER. Yerel bir "kapalı" durumu tutmak,
     adres hâlâ `?rapor=`de dururken pencereyi yok etmek olurdu: geri
     tuşu bir şey yapmaz, yenileme pencereyi geri getirirdi,
   - odak pencerede hapsolur (components/odak-tuzagi; ARIA tek başına
     odağı tutmuyor, canlıda ölçülmüştü) ve arka plan kaydırması kilitlenir.

  Sunucu çizdiği için pencere ilk karede AÇIK geliyor; PanelDrawer'ın
  "kapalıdan açığa" geçişi burada yok.
*/
const abonelikYok = () => () => undefined;

export function RaporPencereKabugu({
  kapatmaAdresi,
  basliklendiren,
  children,
}: {
  kapatmaAdresi: string;
  /** Pencereyi adlandıran başlığın id'si (aria-labelledby). */
  basliklendiren: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const pencereRef = useRef<HTMLElement>(null);
  const istemcide = useSyncExternalStore(abonelikYok, () => true, () => false);
  const hedef = istemcide ? (document.querySelector(".panel-root") ?? document.body) : null;

  /* `panel-drawer-root` dışarıda bırakılıyor: raporun içindeki
     kartlar PanelDrawer kullanıyor ve onlar portalla aynı köke
     basılıyor. İnert yapılsalardı kart penceresi açıldığı anda ölü
     gelirdi (odak-tuzagi.ts'teki gerekçe). */
  useOdakTuzagi(true, pencereRef, "rapor-pencere-root", ["panel-drawer-root"]);

  useEffect(() => {
    const kapat = (olay: KeyboardEvent) => {
      if (olay.key === "Escape") router.push(kapatmaAdresi);
    };
    document.addEventListener("keydown", kapat);
    /*
      KİLİT SATIR İÇİ BİÇİMLE DEĞİL SINIFLA (2026-10-24).

      Raporun içindeki kartlar `PanelDrawer` kullanıyor ve o
      `body.style.overflow`'u açılışta "hidden", KAPANIŞTA "" yapıyor.
      Rapor penceresi de satır içi biçim kullanınca, içteki kart
      penceresi kapandığı anda raporun kilidi de kalkıyordu: rapor
      hâlâ açıkken arkadaki sayfa kaydırılabiliyordu.

      Sınıf satır içi biçimin ALTINDA kalıyor; içteki pencere
      açılırken kendi satır içi değeri geçiyor, kapanırken "" yazıp
      çekiliyor ve sınıf yeniden yürürlüğe giriyor. İki katman
      birbirini bozmadan yığılıyor.
    */
    document.body.classList.add("rapor-kilit");
    return () => {
      document.removeEventListener("keydown", kapat);
      document.body.classList.remove("rapor-kilit");
    };
  }, [router, kapatmaAdresi]);

  const pencere = (
    <div className="rapor-pencere-root">
      {/* Kapatma yüzeyi de bir GEZİNME: düğme değil bağlantı olsa daha
          doğru olurdu ama ekranı kaplayan bir <a> okuyucuda "bağlantı"
          diye okunuyor. İşlevi aynı, adı doğru. */}
      <button
        className="rapor-pencere-perde"
        type="button"
        aria-label="Raporu kapat"
        onClick={() => router.push(kapatmaAdresi)}
      />
      {/* tabIndex -1: açılışta odak buraya alınır, ilk Tab pencerenin
          kendi ilk kontrolüne geçer. */}
      <section
        ref={pencereRef}
        tabIndex={-1}
        className="rapor-pencere rpt-tonlar"
        role="dialog"
        aria-modal="true"
        aria-labelledby={basliklendiren}
      >
        {children}
      </section>
    </div>
  );

  return hedef ? createPortal(pencere, hedef) : null;
}
