import { getPanelContext } from "@/lib/panel-context";
import { istanbulDateTime } from "@/lib/istanbul-date";
import { GenelBakis } from "../../os/genel-bakis";
import { KopyalaDugmesi } from "../../accounts/kopyala-dugmesi";
import { siteleriOku } from "../veri";
import { siteEkle } from "../actions";
import { SiteSilDugmesi } from "./site-sil";

/*
  ANALİTİK · KURULUM. Site bize ait olmayabilir: kodu KURUM kendisi
  ekliyor (kurum sahibinin notu, 22.10.2026). Bu yüzden ekran yalnızca
  kodu vermiyor, yaygın altyapılarda nereye yapıştırılacağını da
  anlatıyor. Kod sitenin <head> bölümüne bir kez eklenir; her sayfada
  çalışır.

  "Doğrulandı" kanıtı veritabanında: ilk olay geldiğinde ilk_olay_at
  yazılıyor (analitik_olay_yaz). Ekran tahmin yürütmüyor.
*/

/* Kodun adresi panelin kendi alan adı: kurumun özel alan adı olsa da takip ucu tek. */
const KOD_ADRESI = "https://app.arvo-os.com/k.js";
const kod = (anahtar: string) => `<script defer src="${KOD_ADRESI}" data-site="${anahtar}"></script>`;

const ALTYAPILAR: { ad: string; adimlar: string[] }[] = [
  { ad: "WordPress", adimlar: [
    "Yönetim paneli → Eklentiler → Yeni ekle → “WPCode” eklentisini kurup etkinleştirin.",
    "Code Snippets → Header & Footer → “Header” kutusuna kodu yapıştırın → Kaydet.",
  ] },
  { ad: "Wix", adimlar: [
    "Site panosu → Ayarlar → Gelişmiş → Özel Kod → “+ Özel Kod Ekle”.",
    "Kodu yapıştırın, “Tüm sayfalar” ve konum olarak “Head” seçin → Uygula. (Premium paket gerekir.)",
  ] },
  { ad: "Shopify", adimlar: [
    "Online Mağaza → Temalar → Kodu düzenle → layout/theme.liquid.",
    "Kodu </head> satırının hemen üstüne yapıştırın → Kaydet.",
  ] },
  { ad: "ikas", adimlar: [
    "Ayarlar → Mağaza Ayarları → “Özel Kod” (Head kodu) bölümüne kodu yapıştırın → Kaydet.",
  ] },
  { ad: "Ticimax / T-Soft / IdeaSoft", adimlar: [
    "Yönetim paneli → Tasarım ya da Ayarlar altında “Head içi kod / Ek kodlar” bölümüne kodu yapıştırın.",
    "Bölümü bulamazsanız altyapı firmanızın desteğinden “head’e script eklemek” isteyin.",
  ] },
  { ad: "Google Tag Manager", adimlar: [
    "Etiketler → Yeni → Etiket türü “Özel HTML” → kodu yapıştırın.",
    "Tetikleyici “All Pages (Tüm sayfalar)” → Kaydet → Gönder (yayınla).",
  ] },
  { ad: "Kendi yazılımınız / ajansınız", adimlar: [
    "Kodu sitenin ortak şablonunda (layout) </head> etiketinin üstüne ekleyin; her sayfada bir kez yüklenmesi yeterli.",
    "Tek sayfalı uygulamalarda (React, Vue) sayfa geçişleri kendiliğinden sayılır.",
  ] },
];

export default async function AnalitikKurulum() {
  const { izin } = await getPanelContext();
  const { siteler } = await siteleriOku();
  const yonetebilir = izin("analitik.yonet");

  return (
    <GenelBakis gizliBaslik="Analitik · Kurulum">
      <section className="an-kurulum">
        {siteler.map((site) => (
          <article className="dash-card an-site" key={site.id}>
            <header className="an-site-bas">
              <div>
                <h2>{site.ad}</h2>
                <p>{site.alan_adi} ve alt alan adları</p>
              </div>
              {site.ilk_olay_at
                ? <span className="status-pill" data-tone="success">Doğrulandı · son veri {istanbulDateTime(site.son_olay_at, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                : <span className="status-pill" data-tone="warning">Veri bekleniyor</span>}
            </header>
            {yonetebilir ? (
              <>
                <p className="an-adim"><b>1.</b> Bu kodu sitenizin <code>&lt;head&gt;</code> bölümüne yapıştırın:</p>
                <div className="an-kod">
                  <code>{kod(site.anahtar)}</code>
                  <KopyalaDugmesi metin={kod(site.anahtar)} etiket="Kodu kopyala" />
                </div>
                <p className="an-adim"><b>2.</b> Sitenizi bir kez açın. Birkaç saniye içinde durum “Doğrulandı” olur.</p>
                <p className="an-adim"><b>3.</b> Instagram, Facebook ya da reklamlarda paylaştığınız bağlantıya kaynak ekleyin; kampanyalar ayrı ayrı görünür:<br />
                  <code>https://{site.alan_adi}/?utm_source=instagram&amp;utm_campaign=ekim-indirimi</code></p>
                <p className="an-not">Kod çerez kullanmaz ve kişisel veri toplamaz (IP adresi saklanmaz); bu yüzden çerez onay penceresi gerektirmez. Form alanlarının içeriği okunmaz, yalnızca “form gönderildi” sayılır.</p>
                <div className="an-site-alt"><SiteSilDugmesi siteId={site.id} ad={site.ad} alanAdi={site.alan_adi} /></div>
              </>
            ) : <p className="an-not">Takip kodunu kurum sahibi ya da yönetici görebilir.</p>}
          </article>
        ))}

        {yonetebilir ? (
          <article className="dash-card an-site">
            <header className="an-site-bas"><div><h2>{siteler.length ? "Başka bir site ekle" : "Sitenizi ekleyin"}</h2><p>Her site için ayrı bir kod verilir.</p></div></header>
            <form action={siteEkle} className="panel-form an-site-formu">
              <label>Site adı<input name="ad" required minLength={2} maxLength={80} placeholder="AkademikMerkez" /></label>
              <label>Alan adı<input name="alan_adi" required placeholder="akademikmerkez.com" inputMode="url" autoComplete="off" /></label>
              <div className="panel-form-actions"><button className="panel-primary">Siteyi ekle</button></div>
            </form>
          </article>
        ) : null}

        {yonetebilir ? (
          <article className="dash-card an-rehber">
            <header className="dash-card-head"><div><h2>Kod nereye yapıştırılır?</h2><p>Sitenizin altyapısını seçin</p></div></header>
            {ALTYAPILAR.map((altyapi) => (
              <details key={altyapi.ad}>
                <summary>{altyapi.ad}</summary>
                <ol>{altyapi.adimlar.map((adim) => <li key={adim}>{adim}</li>)}</ol>
              </details>
            ))}
          </article>
        ) : null}
      </section>
    </GenelBakis>
  );
}
