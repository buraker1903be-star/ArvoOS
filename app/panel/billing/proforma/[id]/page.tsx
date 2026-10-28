import { notFound } from "next/navigation";
import Link from "next/link";
import { getPanelContextErisimdenBagimsiz as getPanelContext } from "@/lib/panel-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { proformalar, satici } from "@/lib/faturalama-koprusu";
import { kalemTutari, proformaGorunumu, vergiNoTuru } from "@/lib/proforma";
import { productName } from "@/lib/products";
import { todayInIstanbul } from "@/lib/istanbul-date";
import { YazdirDugmesi } from "./yazdir-dugmesi";
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

  return <div className="doc-proforma-sayfa">
    <div className="doc-eylem">
      <Link className="panel-secondary" href="/panel/billing">Ödeme ve Lisans&apos;a dön</Link>
      <YazdirDugmesi />
    </div>
    <article className="doc-proforma">
      <header>
        <h1>Proforma fatura{urun ? ` · ${urun}` : ""}</h1>
        <p>{p.no} · Düzenleme {gun(p.duzenlemeTarihi)} · Geçerlilik {gun(p.gecerlilikTarihi)}</p>
        {durum === "odendi" ? <p className="doc-durum">Ödendi</p> : durum === "suresi_doldu" ? <p className="doc-durum">Süresi doldu — güncel proforma için bizimle iletişime geçin.</p> : null}
      </header>

      <div className="doc-taraflar">
        <section>
          <h2>Düzenleyen</h2>
          <p><b>{s.unvan}</b></p>
          {s.adres ? <p>{s.adres}</p> : null}
          {s.vergiDairesi || s.vergiNo ? <p>{[s.vergiDairesi ? `${s.vergiDairesi} V.D.` : null, s.vergiNo ? `VKN ${s.vergiNo}` : null].filter(Boolean).join(" · ")}</p> : null}
          {s.mersisNo ? <p>MERSİS {s.mersisNo}</p> : null}
        </section>
        <section>
          <h2>Sayın</h2>
          {a ? <>
            {a.unvan ? <p><b>{a.unvan}</b></p> : null}
            {a.adSoyad ? <p>{a.unvan ? a.adSoyad : <b>{a.adSoyad}</b>}</p> : null}
            {a.adres ? <p>{a.adres}</p> : null}
            {a.vergiDairesi || a.vergiNo ? <p>{[a.vergiDairesi ? `${a.vergiDairesi} V.D.` : null, a.vergiNo ? `${vergiNoTuru(a.vergiNo)} ${a.vergiNo}` : null].filter(Boolean).join(" · ")}</p> : null}
            {a.eposta ? <p>{a.eposta}</p> : null}
          </> : <p><b>{p.musteriAdi}</b></p>}
        </section>
      </div>

      <table className="doc-tablo">
        <thead><tr><th>Açıklama</th><th className="doc-sayi">Miktar</th><th className="doc-sayi">Birim fiyat</th><th className="doc-sayi">Tutar</th></tr></thead>
        <tbody>
          {p.kalemler.map((k, i) => <tr key={i}>
            <td>{k.aciklama}</td>
            <td className="doc-sayi">{k.miktar.toLocaleString("tr-TR")}</td>
            <td className="doc-sayi">{para(k.birim_fiyat, p.paraBirimi)}</td>
            <td className="doc-sayi">{para(kalemTutari(k), p.paraBirimi)}</td>
          </tr>)}
        </tbody>
        <tfoot>
          <tr><th colSpan={3}>Ara toplam (KDV hariç)</th><td className="doc-sayi">{para(p.araToplam, p.paraBirimi)}</td></tr>
          <tr><th colSpan={3}>KDV (%{p.kdvOrani.toLocaleString("tr-TR")})</th><td className="doc-sayi">{para(p.kdv, p.paraBirimi)}</td></tr>
          <tr className="doc-genel"><th colSpan={3}>Genel toplam</th><td className="doc-sayi">{para(p.toplam, p.paraBirimi)}</td></tr>
        </tfoot>
      </table>

      {s.hesaplar.length ? <section className="doc-hesaplar">
        <h2>Ödeme bilgileri</h2>
        <dl>{s.hesaplar.map((h) => <div key={h.iban}><dt>{h.banka}</dt><dd>{h.iban}{h.hesapSahibi ? ` · ${h.hesapSahibi}` : ""}</dd></div>)}</dl>
        <p>Havale açıklamasına <b>{p.no}</b> yazınız.</p>
      </section> : null}

      {p.notlar ? <p className="doc-not">{p.notlar}</p> : null}
      <p className="doc-uyari">Bu belge proforma faturadır; mali değeri yoktur. Ödeme alındıktan sonra faturanız kesilir ve Ödeme ve Lisans sayfasındaki &quot;Proformalar ve faturalar&quot; bölümünde yer alır.</p>
    </article>
  </div>;
}
