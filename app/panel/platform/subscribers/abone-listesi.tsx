"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { KBos, KListe, KOge } from "../konsol-ui";
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
      {/* 14.10.2026: panelin süzgeç satırı ve tablosu (konsol-ui). Eskiden
          konsolun kendi düğme dizisi (.plt-hizli) ve satır listesi
          (.plt-abone-satir) vardı ve süzgeç yalnızca bellekteydi. Artık
          ?durum= adresinde, Abonelikler listesindeki gibi: bağlantı
          paylaşılabiliyor, sayfa yenilenince süzgeç kaybolmuyor. */}
      <div className="ekip-suzgec talep-suzgec" role="group" aria-label="Süzgeç">
        {SUZGECLER.map((secim) => (
          <Link
            key={secim.kod} href={secim.kod === "hepsi" ? ADRES : `${ADRES}?durum=${secim.kod}`}
            className={suzgec === secim.kod ? "is-active" : undefined} aria-current={suzgec === secim.kod ? "page" : undefined}
          >
            {secim.ad} <small>{aboneler.filter((abone) => suzgeceUyar(abone, secim.kod)).length}</small>
          </Link>
        ))}
        <div className="talep-ara" role="search">
          <input
            type="search" value={arama} placeholder="Ad, e-posta ya da ürün ara" aria-label="Abone ara"
            onChange={(olay) => setArama(olay.target.value)}
          />
        </div>
      </div>

      {listelenen.length ? (
        /*
          iOS LİSTESİ (14.10.2026, "iOS gibi olmalı"): abone tek satır —
          kişi simgesi, ad, altında ürün · e-posta; sağda durum ve deneme
          bitişi / dönem sonu. Eskiden beş sütunlu tabloydu (KTablo).
        */
        <KListe>
          {listelenen.map((abone) => {
            const durumu = { etiket: abone.erisimAcik ? abone.durumAdi : "Erişim kapalı", ton: abone.tone };
            const tarihEtiketi = abone.durum === "trialing" ? "deneme bitişi" : "dönem sonu";
            const tarihAdi = abone.durum === "trialing" ? abone.denemeSonuAdi : abone.donemSonuAdi;
            return (
              <KOge
                key={abone.id}
                simge={abone.ad || abone.eposta}
                baslik={abone.ad || abone.eposta}
                /* E-posta her zaman yazılıyor: adı girilmemiş üç aboneyi
                   birbirinden ayırmanın başka yolu yok. */
                alt={[abone.urunAdi, abone.ad ? abone.eposta : null].filter(Boolean).join(" · ")}
                durum={durumu}
                deger={tarihAdi}
                degerAlt={tarihEtiketi}
                /* Gidilecek sayfa yok, düzenleme pencerede. Eskiden satıra
                   tıklama gizli .satir-ac düğmesine basıyordu (SatirTiklama,
                   KTablo'nun içindeydi); iOS listesinde o dinleyici yok, düğme
                   satırın sonunda görünür duruyor — klavye ve ekran okuyucu
                   da onu kullanıyor. */
                sonu={(
                  <button type="button" className="satir-ac panel-secondary" onClick={() => setAcik(abone.id)}
                    aria-label={`${abone.ad || abone.eposta} aboneliğini düzenle`}>
                    Düzenle
                  </button>
                )}
              />
            );
          })}
        </KListe>
      ) : (
        <KBos
          baslik={arama || suzgec !== "hepsi" ? "Eşleşen abone yok" : "Henüz bireysel abone yok"}
          aciklama={arama || suzgec !== "hepsi" ? "Bu süzgeçle ya da aramayla eşleşen abone yok." : undefined}
        />
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
        <input type="date" name="trial_ends_at" value={deger.trialEndsAt} onChange={(o) => setDeger({ ...deger, trialEndsAt: o.target.value })} />
      </label>
      <label>
        Dönem sonu
        <input type="date" name="current_period_end" value={deger.currentPeriodEnd} onChange={(o) => setDeger({ ...deger, currentPeriodEnd: o.target.value })} />
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
