import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getPanelContext } from "@/lib/panel-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { kimlikMi } from "@/lib/kimlik";
import { proformaGetir, satici } from "@/lib/faturalama-koprusu";
import { eslesmeSirasi, PROFORMA_DURUM_ADI, proformaGorunumu } from "@/lib/proforma";
import { gunFarki } from "@/lib/is-adimlari";
import { productName } from "@/lib/products";
import { todayInIstanbul } from "@/lib/istanbul-date";
import { ProformaBelgesi } from "../../../../billing/proforma/proforma-belgesi";
import { YazdirDugmesi } from "../../../../billing/proforma/yazdir-dugmesi";
import { KKart, KNot } from "../../../konsol-ui";
import { para, tarih, tarihSaat } from "../../../bicim";
import { proformaEsle, proformaGonder, proformaIptal } from "../../actions";
import { epostaAyarli } from "@/lib/eposta-gonder";
import { ikincil } from "../../../konsol-oku";
import "../../../platform.css";
import "../../../../components/kayit-formu.css";
import "../../../../hr/hr.css";
import "../../../../crm/kayit-detay/kayit-detay.css";
import "../../../finans.css";
import "./proforma-kayit.css";

export const metadata: Metadata = { title: "Proforma", robots: { index: false, follow: false } };

/*
  KURUCU KONSOLU — PROFORMA BELGESİ (29.10.2026). Konsol proformayı
  yalnızca liste satırı olarak gösteriyordu: kurucu müşteriye giden
  belgenin kendisini göremiyor, yazdırıp e-postayla gönderemiyordu.
  Belge müşterinin sayfasıyla AYNI bileşen (ProformaBelgesi) — kurucunun
  gördüğü, müşterinin gördüğüdür. İptal edilen de açılır (müşteri tarafı
  iptali göstermiyor).

  KAYIT SAYFASI GİBİ (aynı gün, ikinci geçiş: "panel kalitesinde").
  Belge sayfanın tamamıydı; eşleştirme ve iptal yalnızca Proformalar
  listesinin penceresindeydi, yani belgeye bakan kurucu işi yapmak için
  listeye geri dönüyordu. Artık müşteri kartı gibi: başlık, sayı şeridi,
  solda kâğıt, sağda işlemler (ödemeyle eşleştir, iptal) ve müşterinin
  belgeyi nerede gördüğü. İşlemler listedekiyle AYNI sunucu işlemleri.

  Yetki: yalnızca platform kurucusu; okuma servis rolüyle (tablo
  istemciye kapalı).
*/
export default async function KonsolProformaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!kimlikMi(id)) notFound();
  const { isPlatformOwner } = await getPanelContext();
  if (!isPlatformOwner) notFound();
  const admin = createAdminClient();
  if (!admin) throw new Error("Sunucu yapılandırması eksik; proforma okunamadı.");
  const [p, s, kimlikSonucu, gonderimSonucu] = await Promise.all([
    proformaGetir(admin, id),
    satici(admin),
    // Abone proformasının abone kimliği eşleştirme adayları için (proformaGetir onu taşımıyor).
    admin.from("platform_proformalari").select("subscriber_id").eq("id", id).maybeSingle(),
    /* Gönderim kaydı (20261029160309) ayrı okunuyor ve okunamazsa sayfa
       düşmüyor: migration canlıya uygulanmadan belge yine açılmalı. */
    admin.from("platform_proformalari").select("otomatik,donem_sonu,gonderildi_at,gonderilen,bildirildi_at,gonderim_hatasi").eq("id", id).maybeSingle(),
  ]);
  if (!p) notFound();
  if (kimlikSonucu.error) throw new Error("Proforma okunamadı: " + kimlikSonucu.error.message);
  const aboneId = (kimlikSonucu.data as { subscriber_id: string | null } | null)?.subscriber_id ?? null;
  const gonderim = ikincil(gonderimSonucu as { data: { otomatik: boolean; donem_sonu: string | null; gonderildi_at: string | null; gonderilen: string[] | null; bildirildi_at: string | null; gonderim_hatasi: string | null } | null; error: { message: string } | null }, "Proforma gönderim kaydı");
  const g = gonderim.veri;

  const bugun = todayInIstanbul();
  const durum = proformaGorunumu(p.durum, p.gecerlilikTarihi, bugun);
  const urun = productName(p.urun);
  const kalan = gunFarki(bugun, p.gecerlilikTarihi);
  // Müşteri belgeyi nerede görüyor: ArvoLab proformasını ArvoLab'da, diğerlerini ArvoOS panelinde.
  const nerede = p.urun === "arvolab" ? "ArvoLab'daki Abonelik ve kredi sayfasında" : "ArvoOS panelindeki Abonelik ve faturalama sayfasında";
  const DURUM_TONU = { bekliyor: "info", odendi: "success", iptal: "neutral", suresi_doldu: "warning" } as const;

  /*
    Eşleştirme adayları: listedeki kuralın aynısı. Aynı müşterinin henüz
    bir proformaya bağlanmamış ödemeleri, tutarı tutan başta. Yalnızca
    bekleyen proformada okunuyor.
  */
  let adaylar: { id: string; tutar: number; tarih: string | null; tutarTutuyor: boolean }[] = [];
  if (p.durum === "bekliyor") {
    const bos = { data: [] as Record<string, unknown>[], error: null };
    const [odemeYaniti, bagliYaniti] = await Promise.all([
      p.organizationId
        ? admin.from("organization_payment_requests").select("id,product,amount,reviewed_at")
            .eq("organization_id", p.organizationId).eq("status", "approved")
            .order("reviewed_at", { ascending: false }).limit(200)
        : aboneId
          ? admin.from("subscriber_payments").select("id,amount,paid_at").eq("subscriber_id", aboneId).order("paid_at", { ascending: false }).limit(200)
          : bos,
      // Zaten bir proformaya bağlanmış ödemeler seçenekten düşer (bir ödeme bir proforma).
      admin.from("platform_proformalari").select("payment_request_id,subscriber_payment_id").eq("durum", "odendi"),
    ]);
    const hata = odemeYaniti.error ?? bagliYaniti.error;
    if (hata) throw new Error("Eşleştirme seçenekleri okunamadı: " + hata.message);
    const bagli = new Set(((bagliYaniti.data ?? []) as { payment_request_id: string | null; subscriber_payment_id: string | null }[])
      .flatMap((e) => [e.payment_request_id, e.subscriber_payment_id].filter((x): x is string => Boolean(x))));
    const odemeler = ((odemeYaniti.data ?? []) as { id: string; product?: string | null; amount: number; reviewed_at?: string | null; paid_at?: string | null }[])
      .filter((o) => !bagli.has(o.id))
      // Kurum ödemesinde ürün de tutmalı: proforma ArvoOS, ArvoCal ve ArvoLab için ayrı kesiliyor.
      .filter((o) => !p.organizationId || (o.product ?? "arvoos") === p.urun)
      .map((o) => ({ id: o.id, tutar: Number(o.amount), tarih: o.reviewed_at ?? o.paid_at ?? null }));
    adaylar = eslesmeSirasi(p.toplam, odemeler);
  }

  return <main className="plt talep cari ekip finans-sayfa proforma-kayit">
    <header className="talep-bas">
      <div className="talep-bas-metin">
        <small className="panel-kicker"><Link href="/panel/platform/tahsilat?kanal=proforma">FİNANS · PROFORMALAR</Link></small>
        <h1>{p.no}</h1>
        <p className="ek-alt">{[p.alici?.unvan || p.musteriAdi, urun, p.alici?.eposta].filter(Boolean).join(" · ")}</p>
      </div>
      <div className="talep-bas-eylem">
        <YazdirDugmesi />
        <details className="os-menu talep-menu">
          <summary className="panel-secondary" aria-label="Diğer işlemler">⋯</summary>
          <div className="os-menu-list" role="menu">
            {p.organizationId ? <Link className="os-menu-item" role="menuitem" href={`/panel/platform/musteriler/${p.organizationId}?pencere=odemeler`}>Müşteri kartı</Link> : null}
            <Link className="os-menu-item" role="menuitem" href="/panel/platform/tahsilat?kanal=proforma">Proformalar</Link>
            <Link className="os-menu-item" role="menuitem" href="/panel/platform/tahsilat?kanal=banka">Banka hesapları</Link>
          </div>
        </details>
      </div>
    </header>

    <nav className="kayit-serit talep-serit" aria-label="Proforma özeti">
      <dl>
        <div><dt>Durum</dt><dd><span className="status-pill" data-tone={DURUM_TONU[durum]}>{PROFORMA_DURUM_ADI[durum]}</span></dd></div>
        <div><dt>Genel toplam</dt><dd className={durum === "odendi" ? "cari-arti" : undefined}>{para(p.toplam, p.paraBirimi)}</dd><small>KDV %{p.kdvOrani.toLocaleString("tr-TR")} dahil</small></div>
        <div><dt>Düzenleme</dt><dd>{tarih(`${p.duzenlemeTarihi}T12:00:00Z`)}</dd></div>
        <div>
          <dt>Son geçerlilik</dt>
          <dd className={durum === "suresi_doldu" ? "talep-uyari" : undefined}>{tarih(`${p.gecerlilikTarihi}T12:00:00Z`)}</dd>
          <small>{durum === "bekliyor" ? (kalan === 0 ? "bugün son gün" : `${kalan} gün kaldı`) : durum === "suresi_doldu" ? "süresi geçti" : "—"}</small>
        </div>
        <div><dt>Kalem</dt><dd>{p.kalemler.length}</dd><small>{p.kalemler.map((k) => k.aciklama).slice(0, 2).join(", ") || "—"}</small></div>
      </dl>
    </nav>

    <div className="talep-izgara personel-iki ekip-izgara">
      <div className="proforma-kagit">
        <ProformaBelgesi p={p} s={s} urun={urun} durum={durum} bugun={bugun} geri={{ href: "/panel/platform/tahsilat?kanal=proforma", etiket: "Proformalar" }} yalnizBelge />
      </div>

      <div className="liste-sag proforma-sag">
        {p.durum === "bekliyor" ? (
          <KKart baslik="Ödemeyle eşleştir" aciklama="Müşterinin bu proforma için yaptığı ödemeyi seçin; tutarı tutanlar başta. Ödeme makbuzunda proforma numarası görünür.">
            {adaylar.length ? (
              <form className="panel-form kayit-formu" action={proformaEsle}>
                <input type="hidden" name="id" value={p.id} />
                <label className="wide"><span>Ödeme<b className="req" aria-hidden="true">*</b></span>
                  <select name="odeme_id" required defaultValue={adaylar[0]?.tutarTutuyor ? adaylar[0].id : ""}>
                    <option value="" disabled>Seçin</option>
                    {adaylar.map((o) => (
                      <option key={o.id} value={o.id}>{tarih(o.tarih)} · {para(o.tutar, p.paraBirimi)}{o.tutarTutuyor ? " · tutar tutuyor" : ""}</option>
                    ))}
                  </select>
                </label>
                <div className="wide panel-form-actions kayit-formu-eylem"><p>Bir ödeme yalnızca bir proformayı kapatır.</p><button className="panel-primary" type="submit">Eşleştir</button></div>
              </form>
            ) : (
              <KNot>Bu müşterinin henüz eşlenmemiş bir ödemesi yok. {p.organizationId ? "Kurumun havalesi önce Ödeme onaylarından onaylanmalı." : "Abonenin kart ödemesi geldiğinde burada çıkar."}</KNot>
            )}
          </KKart>
        ) : null}

        {/* Müşteriye gönderim (otomatik iş ya da bu düğme; lib/otomatik-proforma-isi). */}
        <KKart baslik="Müşteriye gönderim" aciklama={aboneId ? "E-posta ve ArvoLab bildirimi aboneye gider." : "E-posta ve panel bildirimi kurumun Kurum Sahiplerine gider."}>
          {gonderim.okunamadi ? (
            <KNot ton="uyari">Gönderim kaydı okunamadı; otomatik proforma migration&apos;ı (20261029160309) canlıya uygulanmamış olabilir.</KNot>
          ) : <>
            {g?.otomatik ? <KNot>Otomatik düzenlendi{g.donem_sonu ? ` · ${tarih(`${g.donem_sonu}T12:00:00Z`)} tarihinde dolan dönem için` : ""}.</KNot> : null}
            <dl className="talep-liste">
              <div><dt>E-posta</dt><dd>{g?.gonderildi_at ? <>{tarihSaat(g.gonderildi_at)}<small className="ek-alt"> · {(g.gonderilen ?? []).join(", ")}</small></> : <em>Gönderilmedi</em>}</dd></div>
              <div><dt>Bildirim</dt><dd>{g?.bildirildi_at ? tarihSaat(g.bildirildi_at) : <em>Gönderilmedi</em>}</dd></div>
            </dl>
            {g?.gonderim_hatasi && !(g.gonderildi_at && g.bildirildi_at) ? <KNot ton="tehlike"><b>Son deneme:</b> {g.gonderim_hatasi}</KNot> : null}
            {!epostaAyarli() ? <KNot ton="uyari">E-posta gönderimi ayarlı değil (RESEND_API_KEY). Bildirim gider; e-posta anahtar tanımlanınca gönderilebilir.</KNot> : null}
            {p.durum === "bekliyor" ? (
              <form action={proformaGonder}>
                <input type="hidden" name="id" value={p.id} />
                <button className="panel-secondary" type="submit">{g?.gonderildi_at || g?.bildirildi_at ? "Yeniden gönder" : "Müşteriye gönder"}</button>
              </form>
            ) : null}
          </>}
        </KKart>

        <KKart baslik="Müşteri ne görüyor">
          <p className="ek-not">Müşteri bu belgeyi {nerede} görüyor{durum === "iptal" ? "; iptal edilen proforma müşteride listelenmiyor" : ""}.</p>
          {s.hesaplar.some((h) => !h.hesapSahibi) ? <KNot ton="uyari">Bir banka hesabında hesap sahibi adı yok; belgede yalnızca banka adı görünüyor. <Link href="/panel/platform/tahsilat?kanal=banka">Banka hesapları</Link></KNot> : null}
        </KKart>

        {p.durum === "bekliyor" ? (
          <KKart baslik="Proformayı iptal et" aciklama="Müşteri ödemeyecekse; numara korunur, belge müşteride listelenmez.">
            <form action={proformaIptal}>
              <input type="hidden" name="id" value={p.id} />
              <button className="panel-secondary proforma-iptal" type="submit">Proformayı iptal et</button>
            </form>
          </KKart>
        ) : null}
      </div>
    </div>
  </main>;
}
