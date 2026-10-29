import { notFound } from "next/navigation";
import Link from "next/link";
import { getPanelContextErisimdenBagimsiz as getPanelContext } from "@/lib/panel-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { proformalar, satici } from "@/lib/faturalama-koprusu";
import { kalemTutari, proformaGorunumu, vergiNoTuru } from "@/lib/proforma";
import { productName } from "@/lib/products";
import { todayInIstanbul } from "@/lib/istanbul-date";
import { YazdirDugmesi } from "./yazdir-dugmesi";
import { Kopyala } from "./kopyala";
import { gunFarki } from "@/lib/is-adimlari";
import "./proforma-belge.css";

/*
  KURUMUN PROFORMASI (28.10.2026). ArvoLab'daki yazdırma sayfasının
  ArvoOS'taki ikizi: ArvoOS ve ArvoCal lisansı için kesilen proforma
  kurumun görebileceği hiçbir yerde yoktu. Panel çerçevesi yazdırırken
  zaten gizleniyor (panel.css @media print); bu sayfa yalnızca belgeyi
  çiziyor.

  Yetki: lisans yönetme yetkisi ve proformanın BU kuruma ait olması.
  Tablo istemciye kapalı, okuma servis rolüyle; kurum kimliği sorguda
  bağlı olduğu için başka kurumun kimliğini adrese yazan kişi 404 alır.
  Sınıflar doc- önekli: müşteriye giden belgede ad- öneki reklam
  engelleyicilere takılıyor (AGENTS.md).
*/

const para = (kurus: number, birim: string) => new Intl.NumberFormat("tr-TR", { style: "currency", currency: birim || "TRY" }).format(kurus / 100);
const gun = (g: string) => new Intl.DateTimeFormat("tr-TR", { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${g}T12:00:00Z`));

export default async function KurumProformaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { organization, membership, izin } = await getPanelContext();
  if (!membership || !izin("finance.lisans.yonet")) notFound();
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const admin = createAdminClient();
  if (!admin) throw new Error("Sunucu yapılandırması eksik; proforma okunamadı.");

  const p = (await proformalar(admin, "organization_id", organization.id)).find((x) => x.id === id);
  if (!p) notFound();
  const s = await satici(admin);
  const durum = proformaGorunumu(p.durum, p.gecerlilikTarihi, todayInIstanbul());
  const { data: urunSatiri } = await admin.from("platform_proformalari").select("product").eq("id", id).maybeSingle();
  // hata-tamam: ürün adı yalnızca başlık süsü; okunamazsa yazılmıyor.
  const urun = urunSatiri?.product ? productName(urunSatiri.product) : null;
  const a = p.alici;

  const kalan = gunFarki(todayInIstanbul(), p.gecerlilikTarihi);
  const durumBilgisi = {
    bekliyor: { ton: "warning", baslik: "Ödeme bekleniyor", metin: kalan === 0 ? "Proforma bugün geçerliliğini yitiriyor." : `Geçerlilik ${gun(p.gecerlilikTarihi)} — ${kalan} gün kaldı.` },
    odendi: { ton: "success", baslik: "Ödendi", metin: "Ödemeniz alındı; faturanız Abonelik ve faturalama sayfasındaki Faturalar sekmesinde." },
    iptal: { ton: "neutral", baslik: "İptal edildi", metin: "Bu proforma iptal edildi; ödeme yapmayın." },
    suresi_doldu: { ton: "danger", baslik: "Süresi doldu", metin: "Geçerlilik tarihi geçti. Güncel proforma için bizimle iletişime geçin." },
  }[durum];

  /*
    Görünüm (29.10.2026, kurum sahibinin isteği: panelin geri kalanıyla
    "aynı kalitede"). Üstte durum şeridi (kalan gün), belge kâğıt gibi:
    antet, numaralı kalem tablosu, sağda toplam kutusu, kopyalanabilir
    IBAN'lar. Eskiden geri bağlantısı ve son not sayfanın eski adını
    ("Ödeme ve Lisans") yazıyordu.
  */
  return <div className="doc-proforma-sayfa">
    <div className="doc-eylem">
      <Link className="panel-secondary" href="/panel/billing">← Abonelik ve faturalama</Link>
      <YazdirDugmesi />
    </div>
    <div className="doc-durum-serit" data-tone={durumBilgisi.ton}>
      <b>{durumBilgisi.baslik}</b>
      <span>{durumBilgisi.metin}</span>
      <strong>{para(p.toplam, p.paraBirimi)}</strong>
    </div>

    <article className="doc-proforma" data-durum={durum}>
      <header className="doc-antet">
        <div className="doc-satici">
          <span className="doc-marka" aria-hidden="true">A</span>
          <div>
            <b>{s.unvan}</b>
            {s.adres ? <small>{s.adres}</small> : null}
            {s.vergiDairesi || s.vergiNo ? <small>{[s.vergiDairesi ? `${s.vergiDairesi} V.D.` : null, s.vergiNo ? `VKN ${s.vergiNo}` : null].filter(Boolean).join(" · ")}</small> : null}
            {s.mersisNo ? <small>MERSİS {s.mersisNo}</small> : null}
          </div>
        </div>
        <div className="doc-baslik">
          <h1>Proforma fatura</h1>
          <dl>
            <div><dt>No</dt><dd>{p.no}</dd></div>
            <div><dt>Düzenleme</dt><dd>{gun(p.duzenlemeTarihi)}</dd></div>
            <div><dt>Geçerlilik</dt><dd>{gun(p.gecerlilikTarihi)}</dd></div>
            {urun ? <div><dt>Ürün</dt><dd>{urun}</dd></div> : null}
          </dl>
        </div>
      </header>
      {durum === "odendi" || durum === "iptal" || durum === "suresi_doldu" ? <p className="doc-damga" data-tone={durumBilgisi.ton}>{durumBilgisi.baslik}</p> : null}

      <section className="doc-alici">
        <h2>Sayın</h2>
        {a ? <>
          {a.unvan ? <p><b>{a.unvan}</b></p> : null}
          {a.adSoyad ? <p>{a.unvan ? a.adSoyad : <b>{a.adSoyad}</b>}</p> : null}
          {a.adres ? <p>{a.adres}</p> : null}
          {a.vergiDairesi || a.vergiNo ? <p>{[a.vergiDairesi ? `${a.vergiDairesi} V.D.` : null, a.vergiNo ? `${vergiNoTuru(a.vergiNo)} ${a.vergiNo}` : null].filter(Boolean).join(" · ")}</p> : null}
          {a.eposta ? <p>{a.eposta}</p> : null}
        </> : <p><b>{p.musteriAdi}</b></p>}
      </section>

      <table className="doc-tablo">
        <thead><tr><th className="doc-sira">#</th><th>Açıklama</th><th className="doc-sayi">Miktar</th><th className="doc-sayi">Birim fiyat</th><th className="doc-sayi">Tutar</th></tr></thead>
        <tbody>
          {p.kalemler.map((k, i) => <tr key={i}>
            <td className="doc-sira">{i + 1}</td>
            <td>{k.aciklama}</td>
            <td className="doc-sayi">{k.miktar.toLocaleString("tr-TR")}</td>
            <td className="doc-sayi">{para(k.birim_fiyat, p.paraBirimi)}</td>
            <td className="doc-sayi">{para(kalemTutari(k), p.paraBirimi)}</td>
          </tr>)}
        </tbody>
      </table>

      <div className="doc-alt">
        {s.hesaplar.length ? <section className="doc-hesaplar">
          <h2>Ödeme bilgileri</h2>
          <ul>{s.hesaplar.map((h) => <li key={h.iban}>
            <span><b>{h.banka}</b>{h.hesapSahibi ? <small>{h.hesapSahibi}</small> : null}</span>
            <code>{h.iban.replace(/\s+/g, "").replace(/(.{4})/g, "$1 ").trim()}</code>
            <Kopyala metin={h.iban.replace(/\s+/g, "")} etiket="IBAN'ı kopyala" />
          </li>)}</ul>
          <p className="doc-aciklama">Havale açıklamasına <b>{p.no}</b> yazın. <Kopyala metin={p.no} etiket="Numarayı kopyala" /></p>
        </section> : <div />}
        <dl className="doc-toplam">
          <div><dt>Ara toplam <small>KDV hariç</small></dt><dd>{para(p.araToplam, p.paraBirimi)}</dd></div>
          <div><dt>KDV <small>%{p.kdvOrani.toLocaleString("tr-TR")}</small></dt><dd>{para(p.kdv, p.paraBirimi)}</dd></div>
          <div className="doc-genel"><dt>Genel toplam</dt><dd>{para(p.toplam, p.paraBirimi)}</dd></div>
        </dl>
      </div>

      {p.notlar ? <p className="doc-not">{p.notlar}</p> : null}
      <p className="doc-uyari">Bu belge proforma faturadır; mali değeri yoktur. Ödeme alındıktan sonra faturanız kesilir ve Abonelik ve faturalama sayfasının Faturalar sekmesinde yer alır.</p>
    </article>
  </div>;
}
