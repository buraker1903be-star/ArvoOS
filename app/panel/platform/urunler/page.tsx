import { kopruSagliklari } from "@/lib/kopru-sagliklari";
import { konsolAlaniniAc } from "../konsol-alani";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";
import { sayfaliSonuc } from "@/lib/rapor-okuma";
import { zorunlu } from "../konsol-oku";
import { para, sayi } from "../bicim";
import { ModulMatrisi } from "./modul-matrisi";
import { UrunSekmeleri } from "./urun-sekmeleri";
import { UrunListesi, type UrunListeSatiri } from "./urun-listesi";
import { ARC_APP, PRODUCT_APPS } from "@/lib/site/routes";
import { donem as donemiCoz, donemKodu } from "@/lib/konsol/donem";
import { urunPerformansi, type Okuma, type UrunSagligi } from "@/lib/konsol/urun-performansi";
import { DonemSecici } from "../../konsol-donem-secici";
import "../platform.css";
import "../../hr/hr.css";
import "../../crm/crm.css";
import "../../crm/kayit-detay/kayit-detay.css";
import "../finans.css";

/*
  ÜRÜNLER (14.10.2026, kurum sahibinin tarifi).

  "Ürün yaşıyor mu" sorusu: hangi ürünün kaç müşterisi, kaç kullanıcısı
  var, köprüsü ayakta mı. Ürün adından ürünün kendi sayfasına
  (urunler/[urun]) gidiliyor.

  Fiyatlandırma 14.10.2026'ya kadar burada ikinci sekmeydi; konsol sekiz
  ana menüye geçince "Ücret ve Paketler" kendi sayfası oldu
  (/panel/platform/fiyatlar). 27.11.2026'da ürün fiyatları oradan da
  ürünün kendi "Fiyat basamakları" sekmesine indi; Fiyatlar ekranında
  ürünler arası karşılaştırma ile ürüne ait OLMAYAN ek hizmet
  fiyatları kaldı.

  Ürün başına sayılar bugüne kadar hiçbir ekranda YAN YANA değildi:
  modül matrisi hangi modülün hangi kiracıda açık olduğunu gösteriyordu
  ama "ArvoLab kaç kişiye satıldı" sorusunun yanıtı yoktu.

  ArvoOS'un kiracısı = çekirdek lisansı açık kurum; ötekilerinki
  organization_product_licenses satırı. İkisini aynı sütunda saymak
  için kural tek: lisansı AÇIK olan kurum o ürünün kiracısıdır.

  SÜTUNUN ADI "KİRACI", "MÜŞTERİ" DEĞİL (14.10.2026). Grup markaları
  ürünü gerçekten kullanıyor, dolayısıyla bu sayıya girmeleri doğru —
  ama "müşteri" sözcüğü konsolun geri kalanında onları DIŞARIDA bırakan
  bir küme anlatıyor (lib/kurum-turu). Aynı kelimenin iki ekranda iki
  kümeyi göstermesi, ana ekranda 2 yazarken burada 3 yazmasıydı. Sayı
  değişmedi, kelime kümesine uyduruldu.
*/

type Kiraci = {
  id: string; kind: string | null; license_status: string | null; grup_markasi?: boolean | null;
};

export default async function UrunlerPage({ searchParams }: {
  searchParams: Promise<{ bolum?: string; gorunum?: string; suzgec?: string; donem?: string }>;
}) {
  const { supabase, isPlatformOwner, konsolKapsami } = await getPanelContext();
  if (!isPlatformOwner) notFound();
  konsolAlaniniAc(konsolKapsami, "urunler");

  const { bolum, gorunum, suzgec, donem } = await searchParams;
  /*
    ESKİ ?bolum=fiyat ARTIK LİSTEYE DÜŞÜYOR (27.11.2026). Fiyatlandırma
    14.10.2026'da kendi sayfasına taşınmıştı ve bu bağlantı oraya
    gidiyordu; 27.11.2026'da ürün fiyatları ürünün kendi sekmesine
    indi. Listenin "fiyat" diye bir bölümü yok, o yüzden bağlantı
    listenin kendisine düşüyor — oradan ürün seçilip sekmesine
    giriliyor.
  */
  if (bolum === "fiyat") redirect("/panel/platform/urunler");
  /* Modül matrisi 02.11.2026'dan beri bu sayfanın sekmesi; sorguları
     ayrı, özetinkiler boşuna çalışmasın diye erken dönüyor. */
  if (gorunum === "moduller") return <ModulMatrisi suzgec={suzgec} />;

  /* Dönem adreste: Tahsilat sütununun kapsamı paylaşılabilir olmalı ve
     ürün detayındaki seçiciyle aynı kodu kullanmalı (lib/konsol/donem). */
  const secilenDonem = donemiCoz(donemKodu(donem));

  /* Köprü sağlığı 60 sn önbellekte (lib/kopru-sagliklari); Sistem sağlığı canlı okuyor. */
  const kopruSagligi = kopruSagliklari();
  const [kiraciSonucu, urunLisansSonucu, aboneSonucu, kurumOdemeSonucu, aboneOdemeSonucu, arvolab, arc, randevu] = await Promise.all([
    /* HEPSİ SAYFALI. Müşteri ve ödeme sayısıyla büyüyorlar ve PostgREST
       1.000 satırda kesip söylemiyor: aktif müşteri ve tahsilat tavana
       çarpıldığı gün sessizce eksilirdi (lib/rapor-okuma). */
    sayfaliSonuc<Kiraci>("kiracılar", (bas, son) =>
      supabase.from("platform_kiraci_liste").select("id,kind,license_status,grup_markasi")
        .order("id").range(bas, son)),
    sayfaliSonuc<{ organization_id: string; product: string; status: string }>("ürün lisansları", (bas, son) =>
      supabase.from("organization_product_licenses").select("organization_id,product,status")
        .order("organization_id").range(bas, son)),
    /* Aboneler dönemle sınırlanamaz: "aktif müşteri" BUGÜNKÜ durumdur,
       dönüşüm grubu created_at'e göre bellekte süzülüyor. */
    sayfaliSonuc<{ id: string; product: string; status: string; trial_ends_at: string | null; created_at: string }>("bireysel aboneler", (bas, son) =>
      supabase.from("product_subscribers").select("id,product,status,trial_ends_at,created_at")
        .order("id").range(bas, son)),
    sayfaliSonuc<{ organization_id: string; product: string | null; amount: number | null; reviewed_at: string | null }>("dönem kurum ödemeleri", (bas, son) =>
      supabase.from("organization_payment_requests").select("organization_id,product,amount,reviewed_at")
        .eq("status", "approved").gte("reviewed_at", secilenDonem.baslangic).lt("reviewed_at", secilenDonem.bitis)
        .order("reviewed_at").range(bas, son)),
    sayfaliSonuc<{ subscriber_id: string; amount: number | null; paid_at: string | null }>("dönem abone ödemeleri", (bas, son) =>
      supabase.from("subscriber_payments").select("subscriber_id,amount,paid_at")
        .gte("paid_at", secilenDonem.baslangic).lt("paid_at", secilenDonem.bitis)
        .order("paid_at").range(bas, son)),
    kopruSagligi.then((k) => k.arvolab),
    kopruSagligi.then((k) => k.arc),
    kopruSagligi.then((k) => k.randevu),
  ]);
  /*
    Sayfanın ASIL verisi: okunamazsa sayfa hata veriyor. Eskiden `?? []`
    ile boş diziye düşüyordu ve ekran "kayıt yok" diyordu — "iş yok" ile
    "okuyamadım" aynı şey değil (konsol-oku.ts).
  */
  const kiraciSatirlari = zorunlu(kiraciSonucu, "Kiracılar");
  const urunLisanslari = zorunlu(urunLisansSonucu, "Ürün lisansları");

  const kiracilar = ((kiraciSatirlari ?? []) as unknown as Kiraci[]).filter((k) => k.kind !== "internal");
  const musteriMi = new Set(kiracilar.map((k) => k.id));
  /* Tahsilata yalnızca MÜŞTERİ kurumlar girer: iç ekip ve grup markası
     ödemesi gelir değil (Ana Sayfa'daki tabloyla aynı küme). */
  const musteriKurumKumesi = new Set(kiracilar.filter((k) => !k.grup_markasi).map((k) => k.id));

  /* Ödeme ve abone okumaları DÜŞEBİLİR: düşen okuma "sıfır" değil,
     "okunamadı" diye gösteriliyor (lib/konsol/urun-performansi). */
  const okumaOlarak = <T,>(sonuc: { data: T[] | null; error: { message: string } | null }): Okuma<T[]> =>
    sonuc.error || !sonuc.data ? { hata: true } : { veri: sonuc.data };

  const performans = urunPerformansi({
    donem: secilenDonem,
    cekirdek: { veri: kiracilar.map((k) => ({ organization_id: k.id, license_status: k.license_status })) },
    urunLisanslari: {
      veri: ((urunLisanslari ?? []) as { organization_id: string; product: string; status: string }[])
        .filter((satir) => musteriMi.has(satir.organization_id)),
    },
    aboneler: okumaOlarak(aboneSonucu),
    aboneOdemeleri: okumaOlarak(aboneOdemeSonucu),
    kurumOdemeleri: okumaOlarak(kurumOdemeSonucu),
    musteriKurumlar: { veri: musteriKurumKumesi },
  });

  /*
    SAĞLIK ROZETİ köprü yoklamasından, ölçümden değil. ArvoOS'un köprüsü
    yok — konsolun kendisi; onu "Bağlı değil" göstermek yanlış olurdu.
    Etiketler Ana Sayfa'daki Durum sütunuyla AYNI sözlükten: aynı durumu
    iki ekranda iki kelimeyle yazmak bu depoda bir kez yaşandı.
  */
  const urunSagligi = (kod: string): UrunSagligi => {
    if (kod === "arvoos") return { durum: "saglikli", etiket: "Sağlıklı", ton: "success" };
    const kopru = kod === "arvolab"
      ? { kopuk: Boolean(arvolab?.broken), eksik: Boolean(arvolab?.permanent), not: arvolab?.broken ? "ArvoOS'a ulaşamıyor" : undefined }
      : kod === "arc"
      ? { kopuk: !arc.ok, eksik: arc.missing.length > 0, not: arc.error ?? undefined }
      : { kopuk: !randevu.ok, eksik: randevu.missing.length > 0, not: randevu.error ?? undefined };
    if (kopru.kopuk && kopru.eksik) return { durum: "bagli_degil", etiket: "Bağlı değil", ton: "neutral", not: "Köprü anahtarı tanımlı değil." };
    if (kopru.kopuk) return { durum: "sorunlu", etiket: "Dikkat gerektiriyor", ton: "danger", not: kopru.not ?? "Köprü yanıt vermiyor." };
    return { durum: "saglikli", etiket: "Sağlıklı", ton: "success" };
  };

  /* ArvoARC'ın adresi PRODUCT_APPS'te değil (lib/site/routes: oraya
     konulsaydı hukuki metinlere ve llms.txt'ye de girerdi). */
  const adresi = (kod: string) =>
    kod === "arc" ? ARC_APP : (PRODUCT_APPS as Record<string, { url: string; host: string } | undefined>)[kod];

  const satirlar: UrunListeSatiri[] = performans.map((p) => ({
    ...p,
    saglik: urunSagligi(p.kod),
    adres: adresi(p.kod),
  }));

  /*
    TEK KOMPAKT TABLO (27.11.2026, onaylı mockup). Ekranda üç yüzey
    vardı: dört kutuluk özet şeridi, yedi sütunlu tablo ve sağda ikinci
    bir "Köprüler" sütunu. Üçü de aynı şeyi söylüyordu; köprü artık
    ürün adının yanındaki rozet, sayılar da Ana Sayfa'yla aynı
    çekirdekten geliyor. Kaybolan yol yok: modül matrisi sekmede,
    fiyat listesi sol menüde (Fiyatlar), öteki ekranlar "⋯" menüsünde.
  */
  return <main className="plt urun-liste-sayfa">
    <UrunSekmeleri aktif="ozet" ek={
      <details className="os-menu talep-menu">
        <summary className="panel-secondary" aria-label="Diğer ekranlar">⋯</summary>
        <div className="os-menu-list" role="menu">
          {/* EK HİZMETLER bir ürün değil (lib/site/pricing · ADD_ONS):
              taşınacağı bir ürün detayı yok. Yan menüdeki bağımsız
              Fiyatlar girişi kalktığı için erişimi buraya, yani yine
              Ürünler bağlamına alındı. Ürün fiyatları artık ürünün
              kendi "Fiyat basamakları" bölümünde. */}
          <Link className="os-menu-item" role="menuitem" href="/panel/platform/fiyatlar?urun=ek">Ek hizmet fiyatları</Link>
          {/* Ürünler arası fiyat karşılaştırması: çıplak /fiyatlar adresi
              27.11.2026'da bu listeye yönlendirildi, görünümün kapısı
              buraya kondu. */}
          <Link className="os-menu-item" role="menuitem" href="/panel/platform/fiyatlar?gorunum=karsilastirma">Fiyat karşılaştırma</Link>
          <Link className="os-menu-item" role="menuitem" href="/panel/platform/subscribers">Bireysel abone planları</Link>
          <Link className="os-menu-item" role="menuitem" href="/panel/platform/saglik">Sistem sağlığı</Link>
        </div>
      </details>
    } />
    <UrunListesi
      satirlar={satirlar}
      donem={secilenDonem}
      para={para}
      sayi={sayi}
      secici={<DonemSecici secili={secilenDonem.kod} taban="/panel/platform/urunler" />}
    />
  </main>;
}
