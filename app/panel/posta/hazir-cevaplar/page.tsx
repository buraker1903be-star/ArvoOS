import Link from "next/link";
import { getPanelContext } from "@/lib/panel-context";
import { YER_TUTUCULAR } from "@/lib/posta-sablon";
import { istanbulTarihSaat } from "../bicim";
import { sablonEkle, sablonGuncelle, sablonSil } from "../sablon-actions";
import "../../crm/kayit-detay/kayit-detay.css";
import "../posta.css";

/*
  HAZIR CEVAPLAR.

  Ortak kutuda aynı sorular her gün yeniden yazılıyor ("süre ne kadar",
  "fiyata neler dahil"). Personel ya kendi eski postasını bulup
  kopyalıyor ya da baştan yazıyor; iki kişinin aynı soruya iki farklı
  cevabı gidiyor.

  Metin kurumun: kullanmak için posta.yanitla yetiyor, DÜZENLEMEK
  posta.yonet istiyor — yanlış yazılmış bir hazır cevap herkesin
  ağzından gider.
*/

export const dynamic = "force-dynamic";

type Sablon = { id: string; ad: string; govde: string; olusturan: string | null; updated_at: string };

export default async function HazirCevaplar() {
  const { supabase, membership, izin } = await getPanelContext();
  if (!izin("posta.gor")) throw new Error("Posta modülüne erişiminiz yok.");
  const duzenleyebilir = izin("posta.yonet");

  const { data, error } = await supabase
    .from("mail_templates")
    .select("id,ad,govde,olusturan,updated_at")
    .eq("organization_id", membership.organization_id)
    .order("ad");
  if (error) throw new Error("Hazır cevaplar okunamadı: " + error.message);
  const sablonlar = (data ?? []) as Sablon[];

  return <main className="talep cari">
    <header className="talep-bas">
      <div className="talep-bas-metin">
        <small className="panel-kicker">ORTAK POSTA KUTUSU</small>
        <h1>Hazır cevaplar</h1>
        <p>Sık sorulan sorulara tek ağızdan cevap. Yazarken listeden seçilir, metin kutuya düşer.</p>
      </div>
      <div className="talep-bas-eylem">
        <Link className="panel-secondary" href="/panel/posta">← Posta</Link>
      </div>
    </header>

    <nav className="kayit-serit talep-serit" aria-label="Hazır cevap özeti">
      <dl>
        <div><dt>Hazır cevap</dt><dd>{sablonlar.length}</dd></div>
        <div><dt>Yer tutucu</dt><dd>{YER_TUTUCULAR.length}</dd></div>
        <div><dt>Düzenleyebilen</dt><dd>{duzenleyebilir ? "Siz dahil yöneticiler" : "Yöneticiler"}</dd></div>
      </dl>
    </nav>

    <div className="talep-izgara kayit-iki-izgara">
      <section className="panel-card talep-bilgi" aria-label="Hazır cevaplar">
        <div className="cari-baslik"><h2>Cevaplar</h2><small>ada göre sıralı</small></div>
        {sablonlar.length ? (
          <ul className="posta-sablon-liste">
            {sablonlar.map((sablon) => (
              <li key={sablon.id}>
                {duzenleyebilir ? (
                  /* Düzenleme yerinde: ayrı bir sayfaya gitmek, iki
                     satırlık bir metni değiştirmek için fazlaydı. */
                  <form action={sablonGuncelle} className="posta-sablon-form">
                    <input type="hidden" name="sablon_id" value={sablon.id} />
                    <input name="ad" defaultValue={sablon.ad} required minLength={2} maxLength={80} aria-label="Hazır cevabın adı" />
                    <textarea name="govde" defaultValue={sablon.govde} rows={4} required maxLength={5000} aria-label="Hazır cevabın metni" />
                    <div className="posta-sablon-alt">
                      <small>Güncellendi: {istanbulTarihSaat(sablon.updated_at)}</small>
                      <span>
                        <button className="panel-secondary" type="submit">Kaydet</button>
                        <button className="panel-secondary posta-sil" type="submit" formAction={sablonSil} formNoValidate>Sil</button>
                      </span>
                    </div>
                  </form>
                ) : (
                  <div className="posta-sablon-okuma">
                    <b>{sablon.ad}</b>
                    <p>{sablon.govde}</p>
                  </div>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <div className="crm-empty-state talep-bos-kutu">
            <h2>Henüz hazır cevap yok</h2>
            <p>{duzenleyebilir
              ? "Sağdaki formdan ilk cevabı ekleyin; yazışma ekranındaki listede görünür."
              : "Hazır cevapları kurum sahibi ve yöneticiler ekler."}</p>
          </div>
        )}
      </section>

      <aside className="panel-card talep-musteri" aria-label="Yeni hazır cevap">
        {duzenleyebilir ? (
          <>
            <div className="cari-baslik"><h2>Yeni cevap</h2><small>kurumun ağzından</small></div>
            <form action={sablonEkle} className="posta-sablon-form">
              <input name="ad" required minLength={2} maxLength={80} placeholder="Ad (örn. Fiyat bilgisi)" aria-label="Hazır cevabın adı" />
              <textarea name="govde" rows={6} required maxLength={5000} placeholder={"Sayın {{musteri}},\n\n…\n\n{{ben}} · {{kurum}}"} aria-label="Hazır cevabın metni" />
              <div className="posta-sablon-alt">
                <small>En fazla 5.000 karakter.</small>
                <span><button className="panel-primary" type="submit">Ekle</button></span>
              </div>
            </form>
          </>
        ) : <div className="cari-baslik"><h2>Yer tutucular</h2><small>metinde kullanılabilir</small></div>}

        <dl className="stg-list">
          {YER_TUTUCULAR.map((yer) => (
            <div key={yer.anahtar}>
              <dt><code>{`{{${yer.anahtar}}}`}</code></dt>
              <dd>{yer.aciklama}</dd>
            </div>
          ))}
        </dl>
        <p className="posta-not">
          Yer tutucular gönderim anında doldurulur; değeri bilinmiyorsa metinden düşer
          (&ldquo;Sayın ,&rdquo; kalmaz).
        </p>
      </aside>
    </div>
  </main>;
}
