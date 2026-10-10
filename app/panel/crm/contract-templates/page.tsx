import Link from "next/link";
import { getPanelContext } from "@/lib/panel-context";
import { akademikMerkezTemplate, arvoOSGeneralTemplate } from "@/lib/contract-templates";
import { LEGAL_TEXT_VERSION } from "@/app/_components/legal/format";
import "../crm.css";
import "../kayit-detay/kayit-detay.css";

/*
  SÖZLEŞME ŞABLONLARI (10.10.2026): panelin kayıt detayı kalıbında.

  Eskiden panel-pagehead + crm-metrics kutuları ve her şablon için bir
  crm-record kartı vardı; iki sistem şablonu için üç ayrı tasarım dili
  demekti.

  SAYILAR SORGUDAN: sayfa kurumun BÜTÜN sözleşmelerini çekip
  JavaScript'te sayıyordu (sınırsız sorgu, yalnızca dört rakam için).
  Artık her sayım kendi head sorgusunda.

  Şablonlar panelden düzenlenmiyor: metin kodda (lib/contract-templates)
  ve imzalanan sözleşme onaylandığı sürümle korunuyor. Sayfa bu yüzden
  bir liste değil, bir künye.
*/

export default async function SozlesmeSablonlari() {
  const { supabase, membership, modules } = await getPanelContext();
  if (!modules.some((modul) => modul.code === "crm")) throw new Error("CRM modülüne erişiminiz yok.");

  const sablonlar = [arvoOSGeneralTemplate, akademikMerkezTemplate];

  const say = (filtre?: (q: ReturnType<typeof temel>) => ReturnType<typeof temel>) => {
    const q = temel();
    return filtre ? filtre(q) : q;
  };
  function temel() {
    return supabase.from("crm_contracts").select("id", { count: "exact", head: true })
      .eq("organization_id", membership.organization_id);
  }

  const [{ count: sablonlu }, { count: imzali }, ...sablonSayimlari] = await Promise.all([
    say((q) => q.not("contract_template_key", "is", null)),
    say((q) => q.eq("status", "signed")),
    ...sablonlar.flatMap((sablon) => [
      say((q) => q.eq("contract_template_key", sablon.key)),
      say((q) => q.eq("contract_template_key", sablon.key).eq("status", "signed")),
    ]),
  ]);

  /* Sayımlar şablon sırasıyla ikişerli geldi: [kullanım, imzalı]. */
  const sayim = sablonlar.map((sablon, sira) => ({
    sablon,
    kullanim: sablonSayimlari[sira * 2]?.count ?? 0,
    imzali: sablonSayimlari[sira * 2 + 1]?.count ?? 0,
  }));

  return <main className="talep cari">
    <header className="talep-bas">
      <div className="talep-bas-metin">
        <small className="panel-kicker">CRM · SÖZLEŞME ŞABLONLARI</small>
        <h1>Sözleşme şablonları</h1>
        <p>Müşteriye giden sözleşme metinleri, sürümleri ve kullanım durumları.</p>
      </div>
      <div className="talep-bas-eylem">
        <Link className="panel-secondary" href="/panel/crm/contracts">← Sözleşmeler</Link>
      </div>
    </header>

    <nav className="kayit-serit talep-serit" aria-label="Şablon özeti">
      <dl>
        <div><dt>Sistem şablonu</dt><dd>{sablonlar.length}</dd></div>
        <div><dt>Şablonlu sözleşme</dt><dd>{sablonlu ?? 0}</dd></div>
        <div><dt>İmzalı</dt><dd>{imzali ?? 0}</dd></div>
        <div><dt>Yasal metin sürümü</dt><dd>v{LEGAL_TEXT_VERSION}</dd></div>
      </dl>
    </nav>

    <div className="talep-izgara kayit-iki-izgara">
      <section className="panel-card talep-bilgi" aria-label="Şablonlar">
        <div className="cari-baslik"><h2>Şablonlar</h2><small>kurumun çalışma alanına göre seçilir</small></div>
        <ol className="kayit-zaman">
          {sayim.map(({ sablon, kullanim, imzali: sablonImzali }) => {
            const akademik = sablon.key === "akademikmerkez_academic";
            return (
              <li key={sablon.key} data-durum="complete">
                <i aria-hidden="true">{akademik ? "AM" : "OS"}</i>
                <div>
                  <h3>{sablon.name}</h3>
                  <p>{akademik
                    ? "AkademikMerkez çalışma alanında akademik danışmanlık, etik, veri, yayın ve revizyon hükümleriyle otomatik kullanılır."
                    : "ArvoOS üzerindeki diğer kurumlarda genel hizmet, yazılım, danışmanlık, teslim ve fikri hak hükümleriyle kullanılır."}</p>
                  <small>
                    {sablon.key} · v{sablon.version} · {sablon.clauses.length} ana madde ·{" "}
                    {kullanim} sözleşmede kullanıldı, {sablonImzali} imzalı
                  </small>
                </div>
                <span className="status-pill" data-tone="success">Aktif</span>
              </li>
            );
          })}
        </ol>
      </section>

      <aside className="panel-card talep-musteri" aria-label="Yasal çerçeve">
        <div className="cari-baslik"><h2>Yasal iskelet</h2><small>v{LEGAL_TEXT_VERSION}</small></div>
        <p className="cari-not">
          Müşteriye giden her sözleşme; taraflar, tanımlar, konu ve kapsam, süre ve teslim, hak ve
          yükümlülükler, ayrıntılı ücret ve ödeme koşulları (KDV dökümü, ödeme planı, ödeme yöntemleri,
          fatura, temerrüt), cayma hakkı, gizlilik, kişisel verilerin korunması, fikri mülkiyet, mücbir
          sebep, fesih, sorumluluk, tebligat, delil ve elektronik onay, uyuşmazlık çözümü ve yürürlük
          maddelerinden oluşur. Tüketici müşterilerde Ön Bilgilendirme Formu ek olarak eklenir.
          Şablona özgü maddeler &ldquo;Hizmete Özgü Özel Hükümler&rdquo; maddesinde korunur.
        </p>
        <div className="cari-baslik"><h2>Sürüm politikası</h2><small>imzalanan değişmez</small></div>
        <p className="cari-not">
          Metin değişiklikleri yeni bir sürüm olarak yayımlanır. İmzalanmış sözleşmeler, onaylandıkları
          şablon anahtarı ve sürüm numarasıyla korunur; sonradan değişen metin onlara uygulanmaz.
        </p>
      </aside>
    </div>
  </main>;
}
