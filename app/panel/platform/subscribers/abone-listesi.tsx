"use client";

import { TarihSecici } from "@/app/panel/components/tarih-secici";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { MobilSatir } from "../../crm/table-cells";
import { basHarfleri } from "../bicim";
// Ortak kayıt formu düzeni (alan görünümü, zorunlu alan işareti).
import "../../components/kayit-formu.css";
// Düzenleme penceresi (.plt-pencere) ve gizli düğme (.plt-gizli) konsolun stilinde.
import "../platform.css";

const ADRES = "/panel/platform/subscribers";

/*
  Bireysel abone listesi.

  Eskiden her abone, içinde açık bir düzenleme formu olan tam boy bir
  karttı ve iki yüz taneye kadar çiziliyordu. Tek bir aboneyi bulmanın
  yolu tarayıcının sayfa içi aramasıydı; ekranda hiçbir süzgeç yoktu.
  "Denemesi bitmek üzere olanlar kim" sorusunun yanıtı hiçbir yerde
  yazmıyordu.

  Liste artık satır; düzenleme satıra tıklayınca açılan pencerede — lisans
  sayfasındaki ürün kartlarıyla aynı düzen. Arama Türkçe duyarsız: "İrem"
  yazarken "irem" de bulunsun.
*/

export type Abone = {
  id: string;
  urun: string;
  urunAdi: string;
  ad: string | null;
  eposta: string;
  durum: string;
  durumAdi: string;
  tone: string;
  erisimAcik: boolean;
  denemeSonu: string;
  donemSonu: string;
  denemeSonuAdi: string;
  donemSonuAdi: string;
  askiNedeni: string;
  kayit: string;
};

const SUZGECLER = [
  { kod: "hepsi", ad: "Hepsi" },
  { kod: "odeyen", ad: "Ödeyen" },
  { kod: "deneme", ad: "Denemede" },
  { kod: "kapali", ad: "Erişimi kapalı" },
] as const;

const DURUMLAR = [
  { kod: "trialing", ad: "Deneme" },
  { kod: "active", ad: "Aktif" },
  { kod: "past_due", ad: "Ödeme gecikmiş" },
  { kod: "suspended", ad: "Askıda" },
  { kod: "canceled", ad: "İptal" },
] as const;

/** Türkçe duyarsız karşılaştırma: "İş" ile "is" eşleşsin. */
const sadelestir = (value: string) =>
  value.replace(/İ/g, "i").replace(/I/g, "ı").toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i").replace(/ş/g, "s").replace(/ğ/g, "g")
    .replace(/ü/g, "u").replace(/ö/g, "o").replace(/ç/g, "c").trim();

/** Süzgeç kuralı tek yerde: hem liste hem çipteki sayı buradan. */
const suzgeceUyar = (abone: Abone, suzgec: string) => {
  if (suzgec === "odeyen" && !(abone.erisimAcik && abone.durum === "active")) return false;
  if (suzgec === "deneme" && !(abone.erisimAcik && abone.durum === "trialing")) return false;
  if (suzgec === "kapali" && abone.erisimAcik) return false;
  return true;
};

export function AboneListesi({ aboneler, kaydet, tasi, kurumlar, durum }: {
  aboneler: Abone[];
  kaydet: (formData: FormData) => void;
  /** Kurum lisansına taşıma (kurum_id); kurumlar ürün koduna göre, lisansı olanlar. */
  tasi: (formData: FormData) => void;
  kurumlar: Record<string, { id: string; ad: string }[]>;
  /** ?durum= — geçersizse "hepsi". */
  durum?: string;
}) {
  const [arama, setArama] = useState("");
  const suzgec = SUZGECLER.some((secim) => secim.kod === durum) ? durum! : "hepsi";
  const [acik, setAcik] = useState<string | null>(null);
  const pencere = useRef<HTMLDialogElement>(null);

  const listelenen = useMemo(() => {
    const anahtar = sadelestir(arama);
    return aboneler.filter((abone) => {
      if (!suzgeceUyar(abone, suzgec)) return false;
      if (!anahtar) return true;
      return sadelestir(`${abone.ad ?? ""} ${abone.eposta} ${abone.urunAdi}`).includes(anahtar);
    });
  }, [aboneler, arama, suzgec]);

  /* showModal() elle çağrılıyor: <dialog open> ile çizmek pencereyi kipsiz
     yapıyor, yani arka plan tıklanabilir kalıyor ve Esc çalışmıyor. */
  useEffect(() => {
    const oge = pencere.current;
    if (!oge) return;
    if (acik && !oge.open) oge.showModal();
    if (!acik && oge.open) oge.close();
  }, [acik]);

  const secili = aboneler.find((abone) => abone.id === acik) ?? null;

  return (
    <>
      {/* Süzgeç adreste (?durum=): bağlantı paylaşılabiliyor, sayfa
          yenilenince kaybolmuyor. 29.10.2026'dan beri panelin segmenti. */}
      <div className="ekip-suzgec talep-suzgec ek-arac" role="group" aria-label="Süzgeç">
        <nav className="ek-segment" aria-label="Abone durumu">
          {SUZGECLER.map((secim) => (
            <Link
              key={secim.kod} href={secim.kod === "hepsi" ? ADRES : `${ADRES}?durum=${secim.kod}`}
              className={suzgec === secim.kod ? "is-active" : undefined} aria-current={suzgec === secim.kod ? "page" : undefined}
            >
              {secim.ad} <small>{aboneler.filter((abone) => suzgeceUyar(abone, secim.kod)).length}</small>
            </Link>
          ))}
        </nav>
        <div className="talep-ara" role="search">
          <input
            type="search" value={arama} placeholder="Ad, e-posta ya da ürün ara" aria-label="Abone ara"
            onChange={(olay) => setArama(olay.target.value)}
          />
        </div>
      </div>

      {listelenen.length ? (
        /*
          PANELİN TABLOSU (29.10.2026, konsol yeniden kurulurken). iOS
          satırında ürün ve e-posta tek alt satırdaydı, deneme bitişi ile
          dönem sonu aynı sağ hücrede birbirinin yerine yazılıyordu;
          "denemesi bu hafta biten kim" sorusu satır satır okunuyordu.
          Artık ürün, kayıt ve bitiş tarihi kendi sütununda. Gidilecek
          sayfa yok, düzenleme pencerede: düğme satırın sonunda.
        */
        <div className="talep-tablo">
          <table className="crm-data-table" data-cols="ab-abone">
            <thead><tr><th>Abone</th><th>Ürün</th><th className="crm-col-date">Kayıt</th><th className="crm-col-date">Bitiş</th><th>Durum</th><th></th></tr></thead>
            <tbody>
              {listelenen.map((abone) => {
                const durumu = { etiket: abone.erisimAcik ? abone.durumAdi : "Erişim kapalı", ton: abone.tone };
                const deneme = abone.durum === "trialing";
                const tarihAdi = deneme ? abone.denemeSonuAdi : abone.donemSonuAdi;
                const ad = abone.ad || abone.eposta;
                return (
                  <tr key={abone.id} className={abone.erisimAcik ? undefined : "is-pasif"}>
                    <td data-label="Abone">
                      <span className="ek-kisi">
                        <span className="ek-avatar" data-tur="bireysel" aria-hidden="true">{basHarfleri(ad)}</span>
                        {/* E-posta her zaman yazılıyor: adı girilmemiş üç aboneyi birbirinden ayırmanın başka yolu yok. */}
                        <span className="ek-kisi-metin"><span className="crm-table-title" title={ad}>{ad}</span>{abone.ad ? <span className="crm-table-sub" title={abone.eposta}>{abone.eposta}</span> : null}</span>
                      </span>
                    </td>
                    <td data-label="Ürün"><span className="crm-table-title">{abone.urunAdi}</span></td>
                    <td className="crm-col-date" data-label="Kayıt">{abone.kayit}</td>
                    <td className="crm-col-date" data-label="Bitiş">{tarihAdi}<small>{deneme ? "deneme bitişi" : "dönem sonu"}</small></td>
                    <td data-label="Durum"><span className="status-pill" data-tone={durumu.ton}>{durumu.etiket}</span></td>
                    <td className="crm-table-actions">
                      <button type="button" className="satir-ac panel-secondary" onClick={() => setAcik(abone.id)}
                        aria-label={`${ad} aboneliğini düzenle`}>
                        Düzenle
                      </button>
                    </td>
                    <MobilSatir baslik={ad} durum={durumu} alt={[abone.urunAdi, abone.ad ? abone.eposta : null, `${deneme ? "deneme" : "dönem"} ${tarihAdi}`]} />
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="crm-empty-state talep-bos-kutu ek-bos">
          <h2>{arama || suzgec !== "hepsi" ? "Eşleşen abone yok" : "Henüz bireysel abone yok"}</h2>
          <p>{arama || suzgec !== "hepsi" ? "Bu süzgeçle ya da aramayla eşleşen abone yok." : "Bir kişi ArvoLab ya da ArvoARC'a kendi adına abone olduğunda burada listelenir."}</p>
        </div>
      )}

      <dialog
        ref={pencere}
        className="plt-pencere"
        aria-label={secili ? `${secili.ad || secili.eposta} aboneliği` : "Abone"}
        onClose={() => setAcik(null)}
        onClick={(olay) => { if (olay.target === pencere.current) setAcik(null); }}
      >
        {secili ? (
          <div className="plt-pencere-govde">
            <header className="plt-pencere-bas">
              <div>
                <small>{secili.urunAdi}</small>
                <h2>{secili.ad || secili.eposta}</h2>
              </div>
              <button type="button" className="plt-pencere-kapat" aria-label="Kapat" onClick={() => setAcik(null)}>×</button>
            </header>

            <dl className="plt-urun-ozet">
              <div><dt>E-posta</dt><dd>{secili.eposta}</dd></div>
              <div><dt>Kayıt</dt><dd>{secili.kayit}</dd></div>
            </dl>

            {/* key={secili.id}: pencere başka bir aboneyle açıldığında form
                sıfırdan kurulsun. Aynı form yeniden kullanılırsa önceki
                abonenin girilmiş değerleri ekranda kalıyordu. */}
            <AboneFormu key={secili.id} abone={secili} kaydet={kaydet} onBitti={() => setAcik(null)} />
            <KurumaTasi key={`k-${secili.id}`} abone={secili} tasi={tasi} kurumlar={kurumlar[secili.urun] ?? []} onBitti={() => setAcik(null)} />
          </div>
        ) : null}
      </dialog>
    </>
  );
}

/*
  Kurum anlaşması yapıldığında personelin bireysel aboneliği kurum
  lisansına taşınır (14.10.2026): kişi bireysel listeden çıkar, erişimi
  kurumun lisansıyla açılıp kapanır. Yalnızca o ürünün lisansı olan
  kurumlar seçilebilir; lisanssız kuruma taşımak erişimi hemen kapatırdı.
*/
function KurumaTasi({ abone, tasi, kurumlar, onBitti }: {
  abone: Abone; tasi: (formData: FormData) => void; kurumlar: { id: string; ad: string }[]; onBitti: () => void;
}) {
  const [kurum, setKurum] = useState("");
  if (!kurumlar.length) {
    return <p className="panel-muted">{abone.urunAdi} lisansı olan bir kurum yok; kurum lisansına taşımak için önce kuruma ürünü açın.</p>;
  }
  return (
    <form className="panel-form kayit-formu" action={(veri) => { tasi(veri); onBitti(); }}>
      <input type="hidden" name="subscriber_id" value={abone.id} />
      <label className="wide">
        <span>Kurum lisansına taşı <small className="plt-optional">kurum anlaşmasıyla gelen personel</small></span>
        <select name="kurum_id" value={kurum} onChange={(o) => setKurum(o.target.value)} required>
          <option value="">Kurum seçin</option>
          {kurumlar.map((k) => <option key={k.id} value={k.id}>{k.ad}</option>)}
        </select>
        <small className="kota-olcum">Bireysel listeden çıkar; erişimi kurumun {abone.urunAdi} lisansıyla açılıp kapanır. Ödeme geçmişi silinmez.</small>
      </label>
      <div className="wide plt-urun-kaydet" data-kirli={Boolean(kurum)}>
        <button type="submit" className="panel-primary" disabled={!kurum}>Kuruma taşı</button>
      </div>
    </form>
  );
}

function AboneFormu({ abone, kaydet, onBitti }: { abone: Abone; kaydet: (formData: FormData) => void; onBitti: () => void }) {
  const baslangic = {
    status: abone.durum,
    trialEndsAt: abone.denemeSonu,
    currentPeriodEnd: abone.donemSonu,
    suspensionReason: abone.askiNedeni,
  };
  const [deger, setDeger] = useState(baslangic);
  const kirli = (Object.keys(baslangic) as (keyof typeof baslangic)[]).some((alan) => deger[alan] !== baslangic[alan]);
  const askida = deger.status === "suspended";

  return (
    <form className="panel-form kayit-formu" action={(veri) => { kaydet(veri); onBitti(); }}>
      <input type="hidden" name="subscriber_id" value={abone.id} />
      <label>
        Durum
        <select name="status" value={deger.status} onChange={(o) => setDeger({ ...deger, status: o.target.value })}>
          {DURUMLAR.map((durum) => <option key={durum.kod} value={durum.kod}>{durum.ad}</option>)}
        </select>
      </label>
      <label>
        Deneme bitişi
        <TarihSecici name="trial_ends_at" value={deger.trialEndsAt} onChange={(gun) => setDeger({ ...deger, trialEndsAt: gun })} />
      </label>
      <label>
        Dönem sonu
        <TarihSecici name="current_period_end" value={deger.currentPeriodEnd} onChange={(gun) => setDeger({ ...deger, currentPeriodEnd: gun })} />
      </label>

      {/* Askı nedeni yalnızca askıya alınırken; eskiden her abonede duruyor
          ve "yalnızca askıya alındığında" diye kendi gereksizliğini
          duyuruyordu. */}
      {askida || deger.suspensionReason ? (
        <label className="wide">
          Askıya alma nedeni
          <input
            name="suspension_reason" required={askida} value={deger.suspensionReason}
            placeholder="Kişi sorduğunda bu yanıtı vereceğiz"
            onChange={(o) => setDeger({ ...deger, suspensionReason: o.target.value })}
          />
          <small className="kota-olcum">{askida ? "Kayda geçer." : "Durum Askıda olmadığı için kaydedilmeyecek."}</small>
        </label>
      ) : null}

      <div className="wide plt-urun-kaydet" data-kirli={kirli}>
        <button type="button" className="panel-secondary" disabled={!kirli} onClick={() => setDeger(baslangic)}>Vazgeç</button>
        <button type="submit" className="panel-primary" disabled={!kirli}>Kaydet</button>
      </div>
    </form>
  );
}
