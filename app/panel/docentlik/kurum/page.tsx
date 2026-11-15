import Link from "next/link";
import type { Metadata } from "next";
import { gozetimListesi, yetkilerim } from "../veri";
import { DocentlikSekmeleri } from "../sekmeler";
import { YetkiYok } from "../yetki-yok";
import "../../crm/crm.css";
import "../../crm/kayit-detay/kayit-detay.css";
import "../docentlik.css";

export const metadata: Metadata = { title: "Kurum · Doçentlik" };

/*
  KURUM GÖZETİMİ (F6 PR6b) — docentlik.tumunu_gor, SALT OKUNUR.

  Yalnızca kendi kurumunun akademisyenleri: kurum oturumdan, RLS de
  gozetim kuralını uyguluyor (20261114200939). Bu ekranda hiçbir yazma
  düğmesi yok; kişinin faaliyetlerine bakılır, düzenlenmez — sunucu
  işlemleri de faaliyeti sahibine bağlıyor (owner_id = oturum).

  DOKTORA TARİHİ YOK: liste "girildi mi" bilgisini taşıyor
  (docentlik_profil_ozetleri). Tarih kişisel veri; gözetim için gereken
  yalnızca doktora sonrası şartın ölçülebilir olup olmadığı.

  Yetki yoksa veri OKUNMADAN kapalı durum çiziliyor (YetkiYok).
*/
export default async function KurumPage() {
  const yetkiler = await yetkilerim();
  const kisiler = yetkiler.tumunuGor ? await gozetimListesi() : [];
  const faaliyetToplami = kisiler.reduce((t, k) => t + k.faaliyet, 0);
  const tarihsiz = kisiler.filter((k) => !k.doktoraTarihiGirildi).length;

  return <main className="talep docentlik-sayfa">
    <header className="talep-bas">
      <div className="talep-bas-metin">
        <small className="panel-kicker">AKADEMİK</small>
        <h1>Kurum gözetimi</h1>
        <p>Kurumunuzdaki akademisyenlerin faaliyetleri ve puan durumları. Bu ekran salt okunurdur.</p>
      </div>
    </header>

    <DocentlikSekmeleri etkin="kurum" yetkiler={yetkiler} />

    {!yetkiler.tumunuGor ? <YetkiYok bolum="Kurum gözetimi" anahtar="Doçentlik · tümünü görme" /> : (
      <>
        <nav className="kayit-serit talep-serit" aria-label="Kurum özeti">
          <dl>
            <div><dt>Akademisyen</dt><dd>{kisiler.length}</dd><small>profil ya da faaliyeti olan</small></div>
            <div><dt>Faaliyet</dt><dd>{faaliyetToplami}</dd><small>toplam kayıt</small></div>
            <div><dt>Doktora tarihi eksik</dt><dd className={tarihsiz ? "talep-uyari" : undefined}>{tarihsiz}</dd><small>doktora sonrası şart ölçülemiyor</small></div>
          </dl>
        </nav>

        <section className="panel-card docentlik-kart" aria-label={`Akademisyenler, ${kisiler.length} kişi`}>
          {kisiler.length === 0 ? (
            <div className="panel-empty docentlik-bos">
              <b>Henüz akademisyen kaydı yok</b>
              <p>Kurumunuzda Doçentlik profili ya da faaliyeti giren kimse yok.</p>
            </div>
          ) : (
            <div className="crm-table-wrap docentlik-tablo-sarmal">
              <table className="crm-data-table docentlik-tablo">
                <thead>
                  <tr>
                    <th scope="col">Akademisyen</th>
                    <th scope="col">Alan</th>
                    <th scope="col">Doktora tarihi</th>
                    <th scope="col" className="crm-col-amount">Faaliyet</th>
                  </tr>
                </thead>
                <tbody>
                  {kisiler.map((k) => (
                    <tr key={k.kisi}>
                      <td><span className="docentlik-faaliyet"><Link href={`/panel/docentlik/kurum/${k.kisi}`}><b>{k.ad}</b></Link></span></td>
                      <td data-label="Alan">
                        <span className="docentlik-faaliyet">
                          {k.temelAlan ? <span>{k.temelAlan}</span> : <span className="talep-bos">Girilmedi</span>}
                          {k.altAlan ? <small>{k.altAlan}</small> : null}
                        </span>
                      </td>
                      <td data-label="Doktora tarihi">{k.doktoraTarihiGirildi ? "Girildi" : <span className="talep-uyari">Girilmedi</span>}</td>
                      <td className="crm-col-amount" data-label="Faaliyet">{k.faaliyet}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </>
    )}
  </main>;
}
