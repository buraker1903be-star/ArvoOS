import type { Metadata } from "next";
import { getPanelContextErisimdenBagimsiz } from "@/lib/panel-context";
import { kullanimSozlesmesi, SOZLESME_SURUMU } from "@/lib/sozlesme/kullanim-sozlesmesi";
import { ONAY_SECIMI, type SozlesmeOnayi } from "@/lib/sozlesme/onay-durumu";
import { cihazOzeti, konumYazisi } from "@/lib/sozlesme/delil";
import { istanbulDateTime } from "@/lib/istanbul-date";
import "../crm/kayit-detay/kayit-detay.css";
import "../hr/hr.css";
import "./sozlesmelerim.css";

export const metadata: Metadata = { title: "Sözleşmelerim", robots: { index: false, follow: false } };

/*
  SÖZLEŞMELERİM (29.10.2026). Kullanıcı onayladığı sözleşmeyi ve onay
  kaydını (zaman, sürüm, özet, IP, yaklaşık konum, cihaz) her zaman
  görebilmeli: kayıt onun aleyhine delil olarak kullanılabilecekse içeriğini
  bilmek hakkı. ArvoLab'da Ayarlar'ın bir bölümü; ArvoOS'ta Ayarlar kurumun
  ayarı (yetkiye bağlı), bu ise kişinin kendisine ait — o yüzden hesap
  menüsünde ayrı sayfa, yetki istemiyor.

  Erişim kapısından bağımsız: lisansı askıdaki kurumun kullanıcısı da
  kendi onayını okuyabilmeli. Okuma kullanıcının oturumuyla, RLS yalnızca
  kendi satırlarını veriyor.
*/
export default async function SozlesmelerimPage() {
  const { supabase, userId } = await getPanelContextErisimdenBagimsiz();
  const { data, error } = await supabase.from("sozlesme_onaylari").select(ONAY_SECIMI)
    .eq("user_id", userId).order("onaylandi", { ascending: false });
  if (error) console.error("[sözleşme] onaylar okunamadı", error.message);
  const onaylar = (data ?? []) as SozlesmeOnayi[];
  const metin = kullanimSozlesmesi();

  return <main className="panel-page sozlesmelerim">
    <header className="talep-bas">
      <div className="talep-bas-metin">
        <small className="panel-kicker">HESABIM</small>
        <h1>Sözleşmelerim</h1>
        <p className="ek-alt">Onayladığınız sözleşmeler ve onay kayıtları. Kayıt değiştirilemez; bir kopyası onay anında e-postanıza gönderildi.</p>
      </div>
    </header>

    <section className="panel-card so-kart" aria-label="Onay kayıtları">
      <h2>Onay kayıtları</h2>
      {error ? <p className="so-bos">Onay kayıtları şu anda okunamıyor; “onay yok” demek değil. Sayfayı yenileyin.</p>
        : onaylar.length ? (
          <ul className="so-onaylar">
            {onaylar.map((o) => (
              <li key={o.id}>
                <b>{metin.baslik} · Sürüm {o.surum}{o.surum === SOZLESME_SURUMU ? " (yürürlükte)" : ""}</b>
                <dl>
                  <dt>Onay zamanı</dt><dd>{istanbulDateTime(o.onaylandi)} (Türkiye saati)</dd>
                  {o.kurum_adi ? <><dt>Kurum</dt><dd>{o.kurum_adi}</dd></> : null}
                  <dt>IP adresi</dt><dd>{o.ip ?? "—"}</dd>
                  <dt>Yaklaşık konum</dt><dd>{konumYazisi(o) ?? "—"}</dd>
                  <dt>Cihaz</dt><dd title={o.kullanici_araci ?? undefined}>{cihazOzeti(o.kullanici_araci) ?? "—"}</dd>
                  {o.adres ? <><dt>Panel adresi</dt><dd>{o.adres}</dd></> : null}
                  <dt>Metin özeti</dt><dd className="so-ozet">{o.metin_ozeti}</dd>
                </dl>
              </li>
            ))}
          </ul>
        ) : <p className="so-bos">Henüz onay kaydınız yok.</p>}
    </section>

    <section className="panel-card so-kart" aria-label="Yürürlükteki metin">
      <h2>{metin.baslik} · Sürüm {SOZLESME_SURUMU}</h2>
      <p className="so-giris">{metin.giris}</p>
      {metin.bolumler.map((b) => (
        <section key={b.baslik}>
          <h3>{b.baslik}</h3>
          {b.paragraflar.map((p) => <p key={p.slice(0, 48)}>{p}</p>)}
        </section>
      ))}
    </section>
  </main>;
}
