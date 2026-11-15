import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { sayfaNumarasi } from "@/lib/liste-sayfalama";
import { gozetimListesi, yetkilerim } from "../veri";
import { DocentlikSekmeleri } from "../sekmeler";
import { YetkiYok } from "../yetki-yok";
import "../../crm/crm.css";
import "../../crm/kayit-detay/kayit-detay.css";
import "../docentlik.css";

export const metadata: Metadata = { title: "Kurum · Doçentlik" };

/*
  KURUM GÖZETİMİ (F6 PR6b; PR8'de sunucuda sayfalı) — docentlik.tumunu_gor, SALT OKUNUR.

  Yalnızca kendi kurumunun akademisyenleri: kurum oturumdan, veritabanı
  işlevleri de tumunu_gor + modül kapısını kendisi soruyor. Bu ekranda hiçbir
  yazma düğmesi yok; sunucu işlemleri de faaliyeti sahibine bağlıyor.

  SAYFALI. Eskiden 1102 kişi tek sayfada çiziliyordu (PR7, gerçek Next.js).
  Liste veritabanında sayfalanıyor; şerit sayıları ÖZET işlevinden (sayfa
  satırlarından toplanmıyor). Sayfa bağlantıları sorgu değişkeniyle (?sayfa=)
  — sunucu bileşeni, istemci bileşeni yok.

  DOKTORA TARİHİ YOK: yalnızca "girildi mi". Yetki yoksa veri OKUNMADAN
  kapalı durum (YetkiYok).
*/
export default async function KurumPage({ searchParams }: { searchParams: Promise<{ sayfa?: string }> }) {
  const { sayfa: ham } = await searchParams;
  const sayfa = sayfaNumarasi(ham);
  const yetkiler = await yetkilerim();
  const veri = yetkiler.tumunuGor ? await gozetimListesi(sayfa) : null;
  if (veri?.aralikDisi) redirect("/panel/docentlik/kurum");
  const sonSayfa = veri ? Math.max(1, Math.ceil(veri.toplam / veri.sayfaBoyu)) : 1;
  const ilkSira = veri ? (sayfa - 1) * veri.sayfaBoyu + 1 : 0;

  return <main className="talep docentlik-sayfa">
    <header className="talep-bas">
      <div className="talep-bas-metin">
        <small className="panel-kicker">AKADEMİK</small>
        <h1>Kurum gözetimi</h1>
        <p>Kurumunuzdaki akademisyenlerin faaliyetleri ve puan durumları. Bu ekran salt okunurdur.</p>
      </div>
    </header>

    <DocentlikSekmeleri etkin="kurum" yetkiler={yetkiler} />

    {!veri ? <YetkiYok bolum="Kurum gözetimi" anahtar="Doçentlik · tümünü görme" /> : (
      <>
        <nav className="kayit-serit talep-serit" aria-label="Kurum özeti">
          <dl>
            <div><dt>Akademisyen</dt><dd>{veri.ozet.kisi}</dd><small>profil ya da faaliyeti olan</small></div>
            <div><dt>Faaliyet</dt><dd>{veri.ozet.faaliyet}</dd><small>toplam kayıt</small></div>
            <div><dt>Doktora tarihi eksik</dt><dd className={veri.ozet.tarihsiz ? "talep-uyari" : undefined}>{veri.ozet.tarihsiz}</dd><small>doktora sonrası şart ölçülemiyor</small></div>
          </dl>
        </nav>

        <section className="panel-card docentlik-kart" aria-label={`Akademisyenler, toplam ${veri.toplam} kişi`}>
          {veri.satirlar.length === 0 ? (
            <div className="panel-empty docentlik-bos">
              <b>Henüz akademisyen kaydı yok</b>
              <p>Kurumunuzda Doçentlik profili ya da faaliyeti giren kimse yok.</p>
            </div>
          ) : (
            <>
              <header className="docentlik-kart-bas">
                <p>{ilkSira}–{ilkSira + veri.satirlar.length - 1} / {veri.toplam} akademisyen · en çok faaliyeti olan önde</p>
              </header>
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
                    {veri.satirlar.map((k) => (
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
            </>
          )}
          {sonSayfa > 1 ? (
            <nav className="docentlik-sayfalama" aria-label="Sayfalar">
              {sayfa > 1 ? <Link className="panel-secondary" href={`/panel/docentlik/kurum?sayfa=${sayfa - 1}`}>Önceki</Link> : <span />}
              <span>Sayfa {sayfa} / {sonSayfa}</span>
              {sayfa < sonSayfa ? <Link className="panel-secondary" href={`/panel/docentlik/kurum?sayfa=${sayfa + 1}`}>Sonraki</Link> : <span />}
            </nav>
          ) : null}
        </section>
      </>
    )}
  </main>;
}
