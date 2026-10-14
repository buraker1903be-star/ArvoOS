import type { SupabaseClient } from "@supabase/supabase-js";
import { productName } from "@/lib/products";
import { havaleDenetimleri, type HavaleBildirimi } from "@/lib/beklenen-odeme";
import { KBos, KKart, KListe, KNot, KOge } from "../../konsol-ui";
import { ODEME_DURUMU, PAKET_ADI, para, tarih, tarihSaat } from "../../bicim";
import { KararFormu } from "../../payments/karar-formu";
import { reviewBankTransferPayment } from "../../payments/actions";

/*
  Müşteri detayının Ödemeler penceresi (14.10.2026). Yalnızca penceresi
  açıkken çiziliyor (page.tsx → ?pencere=). Lisanslar, Kullanıcılar ve
  Kurum Ayarları burada değil: onlar konsoldaki asıl bileşenleri
  (LisansBolumu, KiraciUyeleri, KiraciDosyasi) olduğu gibi kullanıyor.
*/

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

// ---------------------------------------------------------------- Ödemeler
/*
  ÖDEMELER = CARİ HESAP + ÖDEMELER + FATURALAR (14.10.2026, "pencereleri
  birleştir, daha hızlı olsun").

  Üç ayrı pencereydi ve ikisi AYNI ödemeleri listeliyordu: Cari Hesap
  onaylananları yürüyen toplamla, Ödemeler bütün bildirimleri durumuyla.
  Faturalar penceresi tek bir "henüz yok" cümlesiydi. Şimdi tek pencere:
  üstte cari özeti, onay bekleyen dekontlar (karar burada verilir —
  Ödemeler sayfasındaki KararFormu ve onay işleminin aynısı), altında TEK
  hareket listesi: onaylanan satır yürüyen toplamla, öteki durumlar
  rozetiyle. Faturalar bir satırlık not.

  TAHAKKUK (borç) kaydı bugün yok: platform fatura kesmiyor, ödenen dönem
  lisansı uzatıyor. "Borç" yerine açık ürünlerin dönem tutarı ve gecikmesi
  yazılıyor — uydurma bir bakiye yazmaktansa olanı söylüyoruz.

  Ödemeler bu kurumla sınırlı ve bilerek sınırsız okunuyor: toplam
  hepsinden (check:rakamlar). İmzalı dekont bağlantısı yalnızca
  bekleyenler için üretiliyor.
*/
export async function OdemeBolumu({ supabase, odemeler, kurumAdi, urunler, grup }: {
  supabase: SupabaseClient; odemeler: Odeme[]; kurumAdi: string; urunler: UrunSatiri[]; grup: boolean;
}) {
  const bekleyenler = odemeler.filter((o) => o.status === "pending");
  const onaylanan = odemeler.filter((o) => o.status === "approved");
  const toplam = onaylanan.reduce((t, o) => t + Number(o.amount), 0);
  const bekleyenTutar = bekleyenler.reduce((t, o) => t + Number(o.amount), 0);
  const aylik = urunler.filter((u) => ODEYEN.has(u.status)).reduce((t, u) => t + Number(u.ucret ?? 0), 0);
  const geciken = urunler.filter((u) => u.status === "past_due");
  const gecikenTutar = geciken.reduce((t, u) => t + Number(u.ucret ?? 0), 0);
  const yenileme = urunler.filter((u) => ACIK.has(u.status))
    .map((u) => ({ u, t: u.status === "trialing" ? u.deneme : u.donem }))
    .filter((x): x is { u: UrunSatiri; t: string } => Boolean(x.t))
    .sort((a, b) => a.t.localeCompare(b.t))[0] ?? null;

  /* Yürüyen toplam eskiden yeniye (cari kartının okunuşu); liste en yeni üstte. */
  const eskidenYeniye = [...onaylanan].reverse();
  const yuruyen = new Map(eskidenYeniye.map((o, i) => [o.id, eskidenYeniye.slice(0, i + 1).reduce((t, x) => t + Number(x.amount), 0)]));
  const hareketler = odemeler.filter((o) => o.status !== "pending");

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
    <nav className="kayit-serit talep-serit" aria-label="Cari özeti">
      <dl>
        <div><dt>Toplam tahsilat</dt><dd className="cari-arti">{para(toplam)}</dd><small>{onaylanan.length} ödeme</small></div>
        <div><dt>{grup ? "Grup içi değer" : "Aylık tutar"}</dt><dd>{aylik ? para(aylik) : "—"}</dd><small>ödeyen ürünler</small></div>
        <div>
          <dt>Sonraki dönem</dt>
          <dd className={yenileme ? undefined : "talep-bos"}>{yenileme ? tarih(yenileme.t) : "—"}</dd>
          <small>{yenileme ? `${yenileme.u.ad}${yenileme.u.status === "trialing" ? " · deneme" : ""}` : "açık dönem yok"}</small>
        </div>
        <div>
          <dt>Gecikmiş</dt>
          <dd className={geciken.length ? "talep-uyari" : "talep-bos"}>{geciken.length ? para(gecikenTutar) : "Yok"}</dd>
          <small>{geciken.length ? geciken.map((u) => u.ad).join(", ") : "dönemler ödenmiş"}</small>
        </div>
        <div>
          <dt>Onay bekleyen</dt>
          <dd className={bekleyenler.length ? "talep-uyari" : "talep-bos"}>{bekleyenler.length ? para(bekleyenTutar) : "Yok"}</dd>
          <small>{bekleyenler.length} bildirim</small>
        </div>
      </dl>
    </nav>
    {grup ? <KNot>Grup markası: tutarlar müşteri gelirine girmez, &quot;grup içi değer&quot; olarak izlenir.</KNot> : null}

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

    <KKart baslik="Hareketler" sag={<span className="status-pill">{hareketler.length} kayıt</span>}>
      {hareketler.length ? (
        <KListe>
          {hareketler.map((o) => {
            const onayli = o.status === "approved";
            const durum = ODEME_DURUMU[o.status] ?? { ad: o.status, ton: "neutral" };
            return (
              <KOge
                key={o.id}
                baslik={o.product ? productName(o.product) : "Abonelik ödemesi"}
                alt={[tarih(o.reviewed_at ?? o.created_at), ODEME_YOLU[o.payment_method ?? ""] ?? o.payment_method, o.review_note].filter(Boolean).join(" · ")}
                durum={onayli ? null : { etiket: durum.ad, ton: durum.ton }}
                deger={onayli ? `+${para(Number(o.amount), o.currency ?? "TRY")}` : para(Number(o.amount), o.currency ?? "TRY")}
                degerAlt={onayli ? `toplam ${para(yuruyen.get(o.id) ?? 0)}` : undefined}
              />
            );
          })}
        </KListe>
      ) : <KBos baslik="Henüz ödeme yok" />}
    </KKart>
    {/* Platform faturası bugün YOK (Tahsilat → Faturalar'daki açıklamanın
        aynısı); çalışmayan özelliği çalışıyormuş gibi göstermiyoruz. */}
    <KNot>Faturalar: platform henüz fatura kesmiyor, faturalar elle kesiliyor. Paraşüt (e-fatura / e-arşiv) bağlanınca bu müşteriye kesilenler burada listelenecek.</KNot>
  </>;
}
