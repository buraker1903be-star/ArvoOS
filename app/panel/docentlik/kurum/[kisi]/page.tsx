import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { sayfaNumarasi } from "@/lib/liste-sayfalama";
import { uuidMu } from "@/lib/docentlik-islem";
import { UAK_BILGI_NOTU, gunMetni, grupSatirlari, hedefGorunumu, puanMetni, yazarMetni } from "@/lib/docentlik-gorunum";
import { kisiAdi, kisiOzeti, kriterlerTumu, kurumFaaliyetleri, yetkilerim } from "../../veri";
import { FaaliyetBelgesiGoruntule } from "../../belge";
import { DocentlikSekmeleri } from "../../sekmeler";
import { YetkiYok } from "../../yetki-yok";
import "../../../crm/crm.css";
import "../../../crm/kayit-detay/kayit-detay.css";
import "../../docentlik.css";

export const metadata: Metadata = { title: "Akademisyen · Doçentlik" };

/*
  GÖZETİMDE TEK AKADEMİSYEN (F6 PR6b) — docentlik.tumunu_gor, SALT OKUNUR.

  Kişi kimliği adresten geliyor ama YETKİ adresten gelmiyor: kurum
  oturumdan, okumalar kullanıcının kendi oturumuyla — RLS başka kurumun
  kişisini göstermez (kişi kurumda değilse liste boş, özet sıfır). Bozuk
  kimlik 404.

  Puan ve hedef kisiOzeti'nden (PR5 → PR #318 çekirdeği); dönem
  docentlik_faaliyet_donemleri'nden geliyor, doktora tarihi HİÇ okunmuyor.
  Belge yalnızca görüntülenir (kısa ömürlü imzalı adres, depo politikası
  gözetime okuma izni veriyor); ekleme, değiştirme, silme yok.
*/
export default async function KurumKisiPage({ params, searchParams }: { params: Promise<{ kisi: string }>; searchParams: Promise<{ sayfa?: string }> }) {
  const [{ kisi }, { sayfa: ham }] = await Promise.all([params, searchParams]);
  if (!uuidMu(kisi)) notFound();
  const yetkiler = await yetkilerim();
  if (!yetkiler.tumunuGor) {
    return <main className="talep docentlik-sayfa">
      <DocentlikSekmeleri etkin="kurum" yetkiler={yetkiler} />
      <YetkiYok bolum="Kurum gözetimi" anahtar="Doçentlik · tümünü görme" />
    </main>;
  }
  const sayfa = sayfaNumarasi(ham);
  const [ad, ozet, liste, kriterler] = await Promise.all([kisiAdi(kisi), kisiOzeti(kisi), kurumFaaliyetleri(sayfa, kisi), kriterlerTumu()]);
  if (liste.aralikDisi) redirect(`/panel/docentlik/kurum/${kisi}`);
  const hedef = hedefGorunumu(ozet);
  const gruplar = grupSatirlari(ozet.gruplar);
  const kriterAdi = new Map(kriterler.map((k) => [k.id, `${k.code} · ${k.label}`]));
  const sonSayfa = Math.max(1, Math.ceil(liste.toplam / liste.sayfaBoyu));

  return <main className="talep docentlik-sayfa">
    <header className="talep-bas">
      <div className="talep-bas-metin">
        <small className="panel-kicker"><Link href="/panel/docentlik/kurum">KURUM</Link></small>
        <h1>{ad}</h1>
        <p>Salt okunur görünüm: faaliyetler ve puan durumu. Düzenleme yalnızca akademisyenin kendisine açık.</p>
      </div>
    </header>

    <DocentlikSekmeleri etkin="kurum" yetkiler={yetkiler} />

    <nav className="kayit-serit talep-serit" aria-label="Puan özeti">
      <dl>
        <div><dt>Sayılan puan</dt><dd>{puanMetni(ozet.toplam)}</dd><small>grup tavanları uygulanmış</small></div>
        <div><dt>Ham puan</dt><dd>{puanMetni(ozet.ham)}</dd><small>faaliyet puanlarının toplamı</small></div>
        <div>
          <dt>Doktora sonrası</dt>
          <dd className={ozet.sonraToplam === null ? "talep-bos" : undefined}>{ozet.sonraToplam === null ? "—" : puanMetni(ozet.sonraToplam)}</dd>
          <small>{ozet.sonraToplam === null ? "doktora tarihi girilmemiş" : "sayılan puan"}</small>
        </div>
        <div>
          <dt>Eksik hedef</dt>
          <dd className={hedef.eksikToplam ? "talep-uyari" : hedef.hedefYok ? "talep-bos" : "cari-arti"}>{hedef.hedefYok ? "—" : hedef.eksikToplam}</dd>
          <small>{hedef.hedefYok ? "hedef tanımlı değil" : hedef.olculemeyen ? `${hedef.olculemeyen} hedef ölçülemedi` : "asgari şartlar"}</small>
        </div>
      </dl>
    </nav>

    {gruplar.length ? (
      <section className="panel-card docentlik-kart" aria-labelledby="kisi-grup-baslik">
        <header className="docentlik-kart-bas"><h2 id="kisi-grup-baslik">Gruplara göre puan</h2></header>
        <div className="crm-table-wrap docentlik-tablo-sarmal">
          <table className="crm-data-table docentlik-tablo">
            <thead><tr><th scope="col">Grup</th><th scope="col" className="crm-col-amount">Ham</th><th scope="col" className="crm-col-amount">Sayılan</th><th scope="col" className="crm-col-amount">Azami</th></tr></thead>
            <tbody>
              {gruplar.map((g) => (
                <tr key={g.grup}>
                  <td><span className="docentlik-grup"><b>{g.grup}</b><small>{g.adet} faaliyet</small></span></td>
                  <td className="crm-col-amount" data-label="Ham">{puanMetni(g.ham)}</td>
                  <td className="crm-col-amount" data-label="Sayılan"><span className={g.tavanaTakildi ? "talep-uyari" : undefined}>{puanMetni(g.sayilan)}</span></td>
                  <td className="crm-col-amount" data-label="Azami">{g.azami === null ? <span className="talep-bos">—</span> : puanMetni(g.azami)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    ) : null}

    <section className="panel-card docentlik-kart" aria-label={`Faaliyetler, ${liste.toplam} kayıt`}>
      <header className="docentlik-kart-bas"><h2>Faaliyetler</h2><p>{liste.toplam ? `Toplam ${liste.toplam} faaliyet` : "Henüz faaliyet yok"}</p></header>
      {liste.satirlar.length === 0 ? (
        <div className="panel-empty docentlik-bos"><b>Faaliyet yok</b><p>Bu akademisyen henüz faaliyet girmemiş ya da kurumunuzda değil.</p></div>
      ) : (
        <div className="crm-table-wrap docentlik-tablo-sarmal">
          <table className="crm-data-table docentlik-tablo">
            <thead><tr><th scope="col">Faaliyet</th><th scope="col">Tarih</th><th scope="col" className="crm-col-amount">Puan</th><th scope="col">Belge</th></tr></thead>
            <tbody>
              {liste.satirlar.map((f) => (
                <tr key={f.id}>
                  <td>
                    <span className="docentlik-faaliyet">
                      <b>{f.title}</b>
                      <small>{kriterAdi.get(f.criteria_id) ?? "Kriter"} · {yazarMetni(Number(f.yazar_sayisi), Boolean(f.baslica_yazar))}</small>
                    </span>
                  </td>
                  <td data-label="Tarih">{f.faaliyet_tarihi ? gunMetni(f.faaliyet_tarihi) : <span className="talep-bos">Tarih yok</span>}</td>
                  <td className="crm-col-amount" data-label="Puan"><b>{puanMetni(f.computed_points)}</b></td>
                  <td className="docentlik-eylem-hucre" data-label="Belge">
                    {f.belge_yolu ? <FaaliyetBelgesiGoruntule faaliyetId={f.id} baslik={f.title} /> : <span className="talep-bos">Yok</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {sonSayfa > 1 ? (
        <nav className="docentlik-sayfalama" aria-label="Sayfalar">
          {sayfa > 1 ? <Link className="panel-secondary" href={`/panel/docentlik/kurum/${kisi}?sayfa=${sayfa - 1}`}>Önceki</Link> : <span />}
          <span>Sayfa {sayfa} / {sonSayfa}</span>
          {sayfa < sonSayfa ? <Link className="panel-secondary" href={`/panel/docentlik/kurum/${kisi}?sayfa=${sayfa + 1}`}>Sonraki</Link> : <span />}
        </nav>
      ) : null}
    </section>

    <p className="docentlik-not docentlik-bilgi" role="note">{UAK_BILGI_NOTU}</p>
  </main>;
}
