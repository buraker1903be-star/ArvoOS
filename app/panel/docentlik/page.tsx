import Link from "next/link";
import type { Metadata } from "next";
import { todayInIstanbul } from "@/lib/istanbul-date";
import {
  UAK_BILGI_NOTU, donemEtiketi, grupSatirlari, hedefGorunumu, kriterSecenekleri, profilEksikleri, puanMetni, yazarMetni,
  type HedefSatiri,
} from "@/lib/docentlik-gorunum";
import { kendiDonemi } from "@/lib/docentlik-islem";
import { PanelModal } from "../components/panel-modal";
import { docentlikOzetim, faaliyetlerim, kriterlerTumu, profilim, yetkilerim } from "./veri";
import { FaaliyetFormu } from "./faaliyet-formu";
import { DocentlikSekmeleri } from "./sekmeler";
import "../crm/crm.css";
import "../crm/kayit-detay/kayit-detay.css";
import "../components/kayit-formu.css";
import "./docentlik.css";

export const metadata: Metadata = { title: "Doçentlik" };

/*
  DOÇENTLİK ÇALIŞMA ALANI (F6 PR6a). PR4'teki yer tutucunun yerine.

  Kapı yerleşimde (layout.tsx: modül kurumda açık + kişide gizli değil);
  her okuma PR5'in veri işlevlerinden (veri.ts → docentlikBaglami) ve
  kullanıcının KENDİ oturumuyla, yani RLS'in izin verdiği kadar. Kurum ve
  sahip kimliği adresten ya da istemciden gelmiyor; oturumdan geliyor.

  SAYILAR TEK YERDEN. Puan, tavan ve hedef durumu docentlikOzetim()'den —
  o da PR #318 çekirdeğinin işlevlerini çağırıyor. Bu sayfa hiçbir puanı
  kendisi toplamıyor; "son faaliyetler" listesindeki puanlar da kaydın
  kendi (tetikleyicinin yazdığı) değeri.

  HAM ≠ SAYILAN. Grup tavanı (azami) aşıldığında fazlası sayılmaz; şerit
  iki sayıyı ayrı ve adıyla gösteriyor, hedefler sayılana göre.

  Düzen panelin kendi parçaları: başlık (talep-bas), özet şeridi
  (kayit-serit), kart (panel-card), tablo (crm-data-table) — AGENTS.md
  "Yeni panel sayfası, kardeş sayfanın iskeletiyle yazılır".
*/
export default async function DocentlikPage() {
  const [ozet, profil, sonlar, kriterler, yetkiler] = await Promise.all([
    docentlikOzetim(),
    profilim(),
    faaliyetlerim(1),
    kriterlerTumu(),
    yetkilerim(),
  ]);
  const hedef = hedefGorunumu(ozet);
  const gruplar = grupSatirlari(ozet.gruplar);
  const eksikler = profilEksikleri(profil);
  const secenekler = kriterSecenekleri(kriterler, profil);
  const kriterAdi = new Map(kriterler.map((k) => [k.id, `${k.code} · ${k.label}`]));
  const son = sonlar.satirlar.slice(0, 5);
  const bugun = todayInIstanbul();
  const tavanFarki = ozet.ham - ozet.toplam;
  const toplamAsgari = hedef.toplam.find((s) => !s.doktoraSonrasi) ?? null;

  return <main className="talep docentlik-sayfa">
    <header className="talep-bas">
      <div className="talep-bas-metin">
        <small className="panel-kicker">AKADEMİK</small>
        <h1>Doçentlik</h1>
        <p>Akademik faaliyetlerinizi girin; puanınız ve hedeflere göre durumunuz kurumunuzun kriterleriyle hesaplanır.</p>
      </div>
      <div className="talep-bas-eylem">
        <PanelModal
          triggerLabel="Yeni faaliyet"
          triggerClassName="panel-primary"
          kicker="DOÇENTLİK"
          title="Yeni faaliyet"
          description="Puanı sistem hesaplar; girdiğiniz bilgiler kurumunuzun kriterine göre değerlendirilir."
          boy="orta"
          basaridaKapan
        >
          <FaaliyetFormu secenekler={secenekler} bugun={bugun} />
        </PanelModal>
      </div>
    </header>

    <DocentlikSekmeleri etkin="ozet" yetkiler={yetkiler} />

    <nav className="kayit-serit talep-serit" aria-label="Puan özeti">
      <dl>
        <div>
          <dt>Sayılan puan</dt>
          <dd>{puanMetni(ozet.toplam)}</dd>
          <small>{tavanFarki > 0 ? `grup tavanları uygulandı` : "tavan uygulanmadı"}</small>
        </div>
        <div>
          <dt>Ham puan</dt>
          <dd>{puanMetni(ozet.ham)}</dd>
          <small>{tavanFarki > 0 ? `${puanMetni(tavanFarki)} puan tavanı aştığı için sayılmıyor` : "faaliyet puanlarının toplamı"}</small>
        </div>
        <div>
          <dt>Toplam asgari hedef</dt>
          <dd className={toplamAsgari ? (toplamAsgari.karsilandi ? "cari-arti" : "talep-uyari") : "talep-bos"}>
            {toplamAsgari ? puanMetni(toplamAsgari.asgari) : "—"}
          </dd>
          <small>{toplamAsgari ? (toplamAsgari.karsilandi ? "karşılandı" : `${puanMetni(toplamAsgari.eksik)} puan eksik`) : "tanımlı değil"}</small>
        </div>
        <div>
          <dt>Doktora sonrası</dt>
          <dd className={ozet.sonraToplam === null ? "talep-bos" : undefined}>{ozet.sonraToplam === null ? "—" : puanMetni(ozet.sonraToplam)}</dd>
          <small>{ozet.sonraToplam === null ? "doktora tarihi girilmedi" : "sayılan puan"}</small>
        </div>
        <div>
          <dt>Eksik hedef</dt>
          <dd className={hedef.eksikToplam ? "talep-uyari" : hedef.hedefYok ? "talep-bos" : "cari-arti"}>{hedef.hedefYok ? "—" : hedef.eksikToplam}</dd>
          <small>{hedef.hedefYok ? "hedef tanımlı değil" : hedef.olculemeyen ? `${hedef.olculemeyen} hedef ölçülemedi` : "asgari şartlar"}</small>
        </div>
      </dl>
    </nav>

    {eksikler.length ? (
      <section className="panel-card docentlik-uyari" aria-labelledby="docentlik-profil-baslik">
        <div>
          <h2 id="docentlik-profil-baslik">Profiliniz eksik</h2>
          <ul>{eksikler.map((e) => <li key={e.alan} className={e.onem === "uyari" ? "docentlik-uyari-satir" : undefined}>{e.metin}</li>)}</ul>
        </div>
        <Link className="panel-secondary" href="/panel/docentlik/profil">Profili tamamla</Link>
      </section>
    ) : null}

    <div className="docentlik-izgara">
      <section className="panel-card docentlik-kart" aria-labelledby="docentlik-hedef-baslik">
        <header className="docentlik-kart-bas">
          <h2 id="docentlik-hedef-baslik">Hedeflere göre durum</h2>
          <p>Asgari hedefler sayılan puana göre ölçülür.</p>
        </header>
        {hedef.hedefYok ? (
          <div className="panel-empty docentlik-bos">
            <b>Hedef tanımlı değil</b>
            <p>Kurumunuz sizin alanınız için asgari puan hedefi girmemiş. Hedef olmadan “eksik” hesaplanmaz; kurum yöneticiniz Kriter ve hedefler ekranından tanımlayabilir.</p>
          </div>
        ) : (
          <>
            <HedefListesi satirlar={hedef.toplam} etiket="Toplam puan hedefleri" />
            {hedef.gruplar.length ? <HedefListesi satirlar={hedef.gruplar} etiket="Grup hedefleri" /> : null}
            {hedef.olculemeyen ? (
              <p className="docentlik-not">
                {hedef.olculemeyen} doktora sonrası hedef, doktora tarihiniz girilmediği için ölçülemedi.{" "}
                <Link href="/panel/docentlik/profil">Doktora tarihini girin</Link>.
              </p>
            ) : null}
          </>
        )}
      </section>

      <section className="panel-card docentlik-kart" aria-labelledby="docentlik-grup-baslik">
        <header className="docentlik-kart-bas">
          <h2 id="docentlik-grup-baslik">Gruplara göre puan</h2>
          <p>Azami (tavan) olan grupta fazlası sayılmaz.</p>
        </header>
        {gruplar.length === 0 ? (
          <div className="panel-empty docentlik-bos">
            <b>Henüz puan yok</b>
            <p>Faaliyet ekledikçe puanınız kriter gruplarına göre burada dağılır.</p>
          </div>
        ) : (
          <div className="crm-table-wrap docentlik-tablo-sarmal">
            <table className="crm-data-table docentlik-tablo">
              <thead>
                <tr>
                  <th scope="col">Grup</th>
                  <th scope="col" className="crm-col-amount">Ham</th>
                  <th scope="col" className="crm-col-amount">Sayılan</th>
                  <th scope="col" className="crm-col-amount">Azami</th>
                </tr>
              </thead>
              <tbody>
                {gruplar.map((g) => (
                  <tr key={g.grup}>
                    <td>
                      <span className="docentlik-grup">
                        <b>{g.grup}</b>
                        <small>{g.adet} faaliyet</small>
                        <progress className="docentlik-cubuk" value={g.oran} max={100} aria-hidden="true" />
                      </span>
                    </td>
                    <td className="crm-col-amount" data-label="Ham">{puanMetni(g.ham)}</td>
                    <td className="crm-col-amount" data-label="Sayılan">
                      {/* Rakam ve notu TEK öğede: telefonda hücre etiketli satıra dönüyor ve iki
                          ayrı çocuk satırın iki ucuna dağılıyordu (390 px ölçümü). */}
                      <span className="docentlik-deger">
                        <span className={g.tavanaTakildi ? "talep-uyari" : undefined}>{puanMetni(g.sayilan)}</span>
                        {g.tavanaTakildi ? <small className="docentlik-alt">tavana takıldı</small> : null}
                      </span>
                    </td>
                    <td className="crm-col-amount" data-label="Azami">{g.azami === null ? <span className="talep-bos">—</span> : puanMetni(g.azami)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>

    <section className="panel-card docentlik-kart" aria-labelledby="docentlik-son-baslik">
      <header className="docentlik-kart-bas docentlik-kart-bas-eylem">
        <div>
          <h2 id="docentlik-son-baslik">Son eklenen faaliyetler</h2>
          <p>{sonlar.toplam ? `Toplam ${sonlar.toplam} faaliyet` : "Henüz faaliyet yok"}</p>
        </div>
        {sonlar.toplam ? <Link className="panel-secondary" href="/panel/docentlik/faaliyetler">Tümünü gör</Link> : null}
      </header>
      {son.length === 0 ? (
        <div className="panel-empty docentlik-bos">
          <b>İlk faaliyetinizi ekleyin</b>
          <p>Makale, proje, ders ya da kurumunuzun tanımladığı diğer faaliyetler. Puanı sistem hesaplar.</p>
        </div>
      ) : (
        <div className="crm-table-wrap docentlik-tablo-sarmal">
          <table className="crm-data-table docentlik-tablo">
            <thead>
              <tr>
                <th scope="col">Faaliyet</th>
                <th scope="col">Dönem</th>
                <th scope="col" className="crm-col-amount">Puan</th>
              </tr>
            </thead>
            <tbody>
              {son.map((f) => (
                <tr key={f.id}>
                  <td>
                    <span className="docentlik-faaliyet">
                      <b>{f.title}</b>
                      <small>{kriterAdi.get(f.criteria_id) ?? "Kriter"} · {yazarMetni(Number(f.yazar_sayisi), Boolean(f.baslica_yazar))}</small>
                    </span>
                  </td>
                  <td data-label="Dönem">{donemEtiketi(kendiDonemi(f.faaliyet_tarihi, profil?.doktora_tarihi ?? null))}</td>
                  <td className="crm-col-amount" data-label="Puan">{puanMetni(f.computed_points)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>

    <p className="docentlik-not docentlik-bilgi" role="note">{UAK_BILGI_NOTU}</p>
  </main>;
}

function HedefListesi({ satirlar, etiket }: { satirlar: HedefSatiri[]; etiket: string }) {
  if (!satirlar.length) return null;
  return (
    <ul className="docentlik-hedefler" aria-label={etiket}>
      {satirlar.map((s) => (
        <li key={s.anahtar}>
          <div className="docentlik-hedef-bas">
            <b>{s.baslik}{s.doktoraSonrasi ? <span className="docentlik-etiket">Doktora sonrası</span> : null}</b>
            <span className={s.karsilandi ? "cari-arti" : "talep-uyari"}>
              {s.karsilandi ? "Karşılandı" : `${puanMetni(s.eksik)} eksik`}
            </span>
          </div>
          {/* Yerel <progress>: genişlik için satır içi stil gerekmiyor ve ekran okuyucu değeri kendisi okuyor. */}
          <progress className={`docentlik-cubuk${s.karsilandi ? " is-tamam" : ""}`} value={s.oran} max={100}
            aria-label={`${s.baslik}: asgari ${puanMetni(s.asgari)}, mevcut ${puanMetni(s.mevcut)}`} />
          <small>Mevcut {puanMetni(s.mevcut)} / asgari {puanMetni(s.asgari)}</small>
        </li>
      ))}
    </ul>
  );
}
