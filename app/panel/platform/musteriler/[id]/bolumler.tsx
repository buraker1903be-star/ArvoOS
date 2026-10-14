import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { productName } from "@/lib/products";
import { PLANS } from "@/lib/site/pricing";
import { planTutari, type Fiyatlar } from "@/lib/site/fiyat-kaynagi";
import { YAYIN_KODU, paketListeFiyatiKurus } from "@/lib/paket-ucreti";
import { havaleDenetimleri, type HavaleBildirimi } from "@/lib/beklenen-odeme";
import { KBos, KKart, KListe, KNot, KOge } from "../../konsol-ui";
import { PAKET_ADI, para, tarih, tarihSaat } from "../../bicim";
import { KararFormu } from "../../payments/karar-formu";
import { reviewBankTransferPayment } from "../../payments/actions";

/*
  Müşteri detayının pencere bölümleri (14.10.2026). Her biri yalnızca
  kendi penceresi açıkken çiziliyor (page.tsx → ?pencere=). Lisanslar ve
  Kullanıcılar burada değil: onlar konsoldaki asıl bileşenleri
  (LisansBolumu, KiraciUyeleri) olduğu gibi kullanıyor.
*/

export const ODEME_DURUMU: Record<string, { ad: string; ton: string }> = {
  pending: { ad: "Onay bekliyor", ton: "warning" },
  approved: { ad: "Onaylandı", ton: "success" },
  rejected: { ad: "Reddedildi", ton: "danger" },
  canceled: { ad: "İptal", ton: "neutral" },
};
const ODEME_YOLU: Record<string, string> = { bank_transfer: "Havale", paytr: "Kart (PayTR)", garanti: "Kart (Garanti)" };

export type Odeme = {
  id: string; organization_id: string; amount: number; currency: string | null; status: string; product: string | null;
  plan_code: string | null; created_at: string; reviewed_at: string | null; payment_method: string | null;
  receipt_path: string | null; reference_no: string | null; customer_note: string | null; review_note: string | null;
};

export type UrunSatiri = {
  kod: string; ad: string; status: string; planCode: string | null; ucret: number | null;
  donem: string | null; deneme: string | null;
};

const ACIK = new Set(["active", "trialing", "past_due"]);
const ODEYEN = new Set(["active", "past_due"]);

// ---------------------------------------------------------------- Güncel fiyat
/*
  Müşterinin ödediği ile YAYIMLANMIŞ liste fiyatı yan yana. Sapma hata
  değil (pazarlıkla değişmiş tutar olabilir, lib/paket-ucreti
  ucretSapmasi); ekran yalnızca farkı gösteriyor, kararı kurucu verir.
  Fiyatın kendisi Ücret ve Paketler'de değişir.
*/
export function GuncelFiyat({ urunler, fiyatlar, grup }: { urunler: UrunSatiri[]; fiyatlar: Fiyatlar; grup: boolean }) {
  const listeFiyati = (u: UrunSatiri): number | null => {
    if (u.kod === "arvoos") return paketListeFiyatiKurus(u.planCode, fiyatlar);
    const plan = PLANS.find((p) => p.code === u.planCode);
    return plan ? planTutari(plan, fiyatlar) : null;
  };
  /*
    Basamak adı SİTEDEKİ addan: veritabanı kodu (enterprise) konsolda
    "Kurumsal" yazıyor ama sitede "Özel kurum" (teklif usulü) — liste
    fiyatıyla yan yana iki ayrı ad okumak kafa karıştırıyordu.
  */
  const yayinKodu = (u: UrunSatiri) => (u.kod === "arvoos" ? YAYIN_KODU[u.planCode ?? ""] : u.planCode) ?? null;
  const basamakAdi = (u: UrunSatiri) => {
    const plan = PLANS.find((p) => p.code === yayinKodu(u));
    if (plan) return `${plan.ad.tr} basamağı`;
    return u.planCode ? `${PAKET_ADI[u.planCode] ?? u.planCode} paket (listede karşılığı yok)` : "Basamak seçilmedi";
  };
  const kullandigi = urunler.filter((u) => u.status !== "inactive");

  return <>
    <KKart baslik="Ödediği ve liste fiyatı" aciklama="Yayımlanmış fiyat listesine göre" sag={<Link className="panel-secondary" href="/panel/platform/fiyatlar">Fiyat listesi</Link>}>
      {kullandigi.length ? (
        <KListe>
          {kullandigi.map((u) => {
            const liste = listeFiyati(u);
            const mevcut = u.ucret ? Number(u.ucret) : null;
            const fark = liste && mevcut ? Math.round(((mevcut - liste) / liste) * 100) : null;
            const durum = !mevcut ? { etiket: "Ücret yok", ton: "warning" }
              : liste === null ? { etiket: "Teklif usulü", ton: "info" }
              : fark === 0 ? { etiket: "Liste fiyatı", ton: "success" }
              : { etiket: `${fark! > 0 ? "+" : ""}%${fark} listeden`, ton: fark! < 0 ? "warning" : "info" };
            return (
              <KOge
                key={u.kod}
                simge={u.ad}
                baslik={u.ad}
                alt={`${basamakAdi(u)} · liste ${liste === null ? "teklif" : para(liste)}`}
                durum={durum}
                deger={mevcut ? para(mevcut) : "—"}
                degerAlt={mevcut ? (grup ? "grup içi / ay" : "ödediği / ay") : undefined}
              />
            );
          })}
        </KListe>
      ) : <KBos baslik="Kullandığı ürün yok" />}
    </KKart>
    <KKart baslik="Yayımlanmış basamaklar" aciklama="Kullandığı ürünlerin güncel liste fiyatları">
      <KListe>
        {kullandigi.flatMap((u) => PLANS.filter((p) => p.product === u.kod).map((p) => {
          const tutar = planTutari(p, fiyatlar);
          const secili = yayinKodu(u) === p.code;
          return (
            <KOge
              key={p.code}
              baslik={`${u.ad} · ${p.ad.tr}`}
              alt={p.kisiBasi ? "kişi başı" : "kurum başı"}
              durum={secili ? { etiket: "Kullandığı", ton: "success" } : null}
              deger={tutar === null ? "Teklif" : para(tutar)}
              degerAlt={tutar === null ? undefined : "aylık"}
            />
          );
        }))}
      </KListe>
    </KKart>
  </>;
}

// ---------------------------------------------------------------- Cari hesap
/*
  Cari hesap: müşterinin bizimle para ilişkisinin özeti ve hareketleri.

  Bugün TAHAKKUK (borç) kaydı yok: platform müşteriye fatura kesmiyor,
  dönem ödendiğinde lisans uzuyor. O yüzden hareketler ödemeler; "borç"
  satırı yerine açık ürünlerin dönem tutarı ve gecikmesi yazılıyor.
  Faturalama (Paraşüt) bağlanınca borç satırları buraya eklenecek —
  uydurma bir bakiye yazmaktansa olanı söylüyoruz.

  Ödemeler bu kurumla sınırlı ve bilerek sınırsız okunuyor: toplam
  hepsinden (check:rakamlar).
*/
export function CariHesap({ urunler, odemeler, grup }: { urunler: UrunSatiri[]; odemeler: Odeme[]; grup: boolean }) {
  const onaylanan = odemeler.filter((o) => o.status === "approved");
  const toplam = onaylanan.reduce((t, o) => t + Number(o.amount), 0);
  const bekleyen = odemeler.filter((o) => o.status === "pending");
  const bekleyenTutar = bekleyen.reduce((t, o) => t + Number(o.amount), 0);
  const aylik = urunler.filter((u) => ODEYEN.has(u.status)).reduce((t, u) => t + Number(u.ucret ?? 0), 0);
  const geciken = urunler.filter((u) => u.status === "past_due");
  const gecikenTutar = geciken.reduce((t, u) => t + Number(u.ucret ?? 0), 0);
  const yenilemeler = urunler.filter((u) => ACIK.has(u.status))
    .map((u) => ({ u, t: u.status === "trialing" ? u.deneme : u.donem }))
    .filter((x): x is { u: UrunSatiri; t: string } => Boolean(x.t))
    .sort((a, b) => a.t.localeCompare(b.t));

  /* Hareketler eskiden yeniye, yürüyen toplamla: cari kartının alışılmış
     okunuşu. Listede en yeni üstte. */
  const eskidenYeniye = [...onaylanan].reverse();
  const hareketler = eskidenYeniye
    .map((o, i) => ({ o, yuruyen: eskidenYeniye.slice(0, i + 1).reduce((t, x) => t + Number(x.amount), 0) }))
    .reverse();

  return <>
    <nav className="kayit-serit talep-serit" aria-label="Cari özeti">
      <dl>
        <div><dt>Toplam tahsilat</dt><dd className="cari-arti">{para(toplam)}</dd><small>{onaylanan.length} ödeme</small></div>
        <div><dt>{grup ? "Grup içi değer" : "Aylık tutar"}</dt><dd>{aylik ? para(aylik) : "—"}</dd><small>ödeyen ürünler</small></div>
        <div>
          <dt>Gecikmiş</dt>
          <dd className={geciken.length ? "talep-uyari" : "talep-bos"}>{geciken.length ? para(gecikenTutar) : "Yok"}</dd>
          <small>{geciken.length ? geciken.map((u) => u.ad).join(", ") : "dönemler ödenmiş"}</small>
        </div>
        <div>
          <dt>Onay bekleyen</dt>
          <dd className={bekleyen.length ? "talep-uyari" : "talep-bos"}>{bekleyen.length ? para(bekleyenTutar) : "Yok"}</dd>
          <small>{bekleyen.length} bildirim</small>
        </div>
      </dl>
    </nav>
    {grup ? <KNot>Grup markası: tutarlar müşteri gelirine girmez, &quot;grup içi değer&quot; olarak izlenir.</KNot> : null}

    {yenilemeler.length ? (
      <KKart baslik="Yaklaşan dönemler" aciklama="Açık ürünlerin dönem sonu ya da deneme bitişi">
        <KListe>
          {yenilemeler.map(({ u, t }) => (
            <KOge
              key={u.kod}
              baslik={u.ad}
              alt={u.status === "trialing" ? "deneme bitişi" : "dönem sonu"}
              durum={u.status === "past_due" ? { etiket: "Gecikti", ton: "danger" } : null}
              deger={tarih(t)}
              degerAlt={u.ucret ? para(Number(u.ucret)) : "ücret yok"}
            />
          ))}
        </KListe>
      </KKart>
    ) : null}

    <KKart baslik="Hareketler" aciklama="Onaylanan ödemeler, yürüyen toplamla">
      {hareketler.length ? (
        <KListe>
          {hareketler.map(({ o, yuruyen: y }) => (
            <KOge
              key={o.id}
              baslik={o.product ? productName(o.product) : "Abonelik ödemesi"}
              alt={[tarih(o.reviewed_at ?? o.created_at), ODEME_YOLU[o.payment_method ?? ""] ?? o.payment_method].filter(Boolean).join(" · ")}
              deger={`+${para(Number(o.amount), o.currency ?? "TRY")}`}
              degerAlt={`toplam ${para(y)}`}
            />
          ))}
        </KListe>
      ) : <KBos baslik="Henüz tahsilat yok" />}
      <p className="panel-muted">Borç (tahakkuk) satırları faturalama bağlandığında eklenecek; bugün platform fatura kesmiyor, ödenen dönem lisansı uzatıyor.</p>
    </KKart>
  </>;
}

// ---------------------------------------------------------------- Ödemeler
/*
  Bu kurumun ödeme bildirimleri. Bekleyen dekont burada KARARA bağlanıyor
  (Ödemeler sayfasındaki KararFormu ve onay işleminin aynısı): kurucu
  müşteriye bakarken dekontu görmek için ayrı bir sayfaya gitmesin.
  İmzalı dekont bağlantısı yalnızca bekleyenler için üretiliyor.
*/
export async function OdemeBolumu({ supabase, odemeler, kurumAdi }: { supabase: SupabaseClient; odemeler: Odeme[]; kurumAdi: string }) {
  const bekleyenler = odemeler.filter((o) => o.status === "pending");
  const sonuclananlar = odemeler.filter((o) => o.status !== "pending");
  const [dekontlar, denetimler] = await Promise.all([
    Promise.all(bekleyenler.map(async (o) => {
      const { data } = o.receipt_path
        ? await supabase.storage.from("payment-receipts").createSignedUrl(o.receipt_path, 900)
        : { data: null };
      return [o.id, data?.signedUrl ?? null] as const;
    })),
    havaleDenetimleri(supabase, bekleyenler as unknown as HavaleBildirimi[]),
  ]);
  const dekont = new Map(dekontlar);

  return <>
    {bekleyenler.map((o) => {
      const tutar = para(Number(o.amount), o.currency ?? "TRY");
      const denetim = denetimler.get(o.id);
      return (
        <KKart key={o.id} baslik={`${productName(o.product ?? "arvoos")} · ${tutar}`} aciklama="Tutarın hesaba geçtiğini doğrulayın; onay lisansı açar ve dönemi uzatır."
          sag={<span className="status-pill" data-tone="warning">Onay bekliyor</span>}>
          <dl className="talep-liste talep-liste--iki">
            <div><dt>Paket</dt><dd>{o.plan_code ? PAKET_ADI[o.plan_code] ?? o.plan_code : <em>Belirtilmedi</em>}</dd></div>
            <div><dt>Beklenen</dt><dd>{denetim?.beklenen ? para(denetim.beklenen, o.currency ?? "TRY") : <em>ücret girilmemiş</em>}</dd></div>
            <div><dt>Ödeme yolu</dt><dd>{ODEME_YOLU[o.payment_method ?? ""] ?? o.payment_method}</dd></div>
            <div><dt>Referans</dt><dd className={o.reference_no ? "plt-mono" : undefined}>{o.reference_no ?? <em>Belirtilmedi</em>}</dd></div>
            <div><dt>Bildirim</dt><dd>{tarihSaat(o.created_at)}</dd></div>
            <div><dt>Dekont</dt><dd>{o.payment_method === "paytr"
              ? "Kartla ödendi; otomatik onaylandı"
              : dekont.get(o.id)
              ? <a className="plt-receipt" href={dekont.get(o.id)!} target="_blank" rel="noreferrer">Dekontu görüntüle ↗</a>
              : <em>Eklenmemiş</em>}</dd></div>
          </dl>
          {o.customer_note ? <div className="talep-not"><p className="plt-quote">“{o.customer_note}”</p></div> : null}
          {denetim?.farklar.length ? (
            <KNot ton="tehlike"><b>Beklenenle uyuşmuyor.</b>{denetim.farklar.map((f) => <span key={f}><br />{f}</span>)}</KNot>
          ) : null}
          <div className="talep-not">
            <KararFormu paymentId={o.id} kurumAdi={kurumAdi} tutar={tutar} farklar={denetim?.farklar ?? []} kaydet={reviewBankTransferPayment} />
          </div>
        </KKart>
      );
    })}

    <KKart baslik={bekleyenler.length ? "Sonuçlananlar" : "Ödeme bildirimleri"} sag={<span className="status-pill">{sonuclananlar.length} kayıt</span>}>
      {sonuclananlar.length ? (
        <KListe>
          {sonuclananlar.map((o) => {
            const durum = ODEME_DURUMU[o.status] ?? { ad: o.status, ton: "neutral" };
            return (
              <KOge
                key={o.id}
                baslik={o.product ? productName(o.product) : "Abonelik ödemesi"}
                alt={[tarihSaat(o.reviewed_at ?? o.created_at), ODEME_YOLU[o.payment_method ?? ""] ?? o.payment_method, o.review_note].filter(Boolean).join(" · ")}
                durum={{ etiket: durum.ad, ton: durum.ton }}
                deger={para(Number(o.amount), o.currency ?? "TRY")}
              />
            );
          })}
        </KListe>
      ) : <KBos baslik={bekleyenler.length ? "Sonuçlanmış bildirim yok" : "Ödeme bildirimi yok"} />}
    </KKart>
  </>;
}

// ---------------------------------------------------------------- Faturalar
/* Platform faturası bugün YOK (Tahsilat → Faturalar'daki açıklamanın
   aynısı). Çalışmayan özelliği çalışıyormuş gibi göstermiyoruz. */
export function Faturalar() {
  return (
    <KKart baslik="Faturalar">
      <KBos
        baslik="Platform faturası henüz kesilmiyor"
        aciklama="Onaylanan her ödeme lisansı açıyor ama Arvo adına fatura oluşturmuyor; faturalar elle kesiliyor. Paraşüt entegrasyonu (e-fatura / e-arşiv) bağlanınca bu müşteriye kesilen faturalar burada listelenecek."
      />
    </KKart>
  );
}
