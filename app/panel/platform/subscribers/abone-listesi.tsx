"use client";

import { useEffect, useMemo, useRef, useState } from "react";

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

export function AboneListesi({ aboneler, kaydet }: { aboneler: Abone[]; kaydet: (formData: FormData) => void }) {
  const [arama, setArama] = useState("");
  const [suzgec, setSuzgec] = useState<string>("hepsi");
  const [acik, setAcik] = useState<string | null>(null);
  const pencere = useRef<HTMLDialogElement>(null);

  const listelenen = useMemo(() => {
    const anahtar = sadelestir(arama);
    return aboneler.filter((abone) => {
      if (suzgec === "odeyen" && !(abone.erisimAcik && abone.durum === "active")) return false;
      if (suzgec === "deneme" && !(abone.erisimAcik && abone.durum === "trialing")) return false;
      if (suzgec === "kapali" && abone.erisimAcik) return false;
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
      <div className="plt-abone-arac">
        <label className="plt-abone-arama">
          <span className="plt-gizli">Abone ara</span>
          <input
            type="search" value={arama} placeholder="Ad, e-posta ya da ürün ara"
            onChange={(olay) => setArama(olay.target.value)}
          />
        </label>
        <div className="plt-hizli" role="group" aria-label="Süzgeç">
          {SUZGECLER.map((secim) => (
            <button
              key={secim.kod} type="button" data-secili={suzgec === secim.kod}
              onClick={() => setSuzgec(secim.kod)}
            >{secim.ad}</button>
          ))}
        </div>
      </div>

      {listelenen.length ? (
        <div className="plt-abone-liste">
          {listelenen.map((abone) => (
            <button key={abone.id} type="button" className="plt-abone-satir" onClick={() => setAcik(abone.id)}>
              <span className="plt-abone-kim">
                <b>{abone.ad || abone.eposta}</b>
                {/* E-posta her zaman yazılıyor: adı girilmemiş üç aboneyi
                    birbirinden ayırmanın başka yolu yok. */}
                <small>{abone.ad ? abone.eposta : abone.urunAdi}</small>
              </span>
              <span data-etiket="Ürün">{abone.urunAdi}</span>
              <span data-etiket="Durum">
                <span className="status-pill" data-tone={abone.tone}>{abone.erisimAcik ? abone.durumAdi : "Erişim kapalı"}</span>
              </span>
              <span data-etiket={abone.durum === "trialing" ? "Deneme bitişi" : "Dönem sonu"}>
                {abone.durum === "trialing" ? abone.denemeSonuAdi : abone.donemSonuAdi}
              </span>
              <span className="plt-abone-uc" aria-hidden="true">›</span>
            </button>
          ))}
        </div>
      ) : (
        <p className="plt-substatus">
          {arama || suzgec !== "hepsi" ? "Bu süzgeçle eşleşen abone yok." : "Henüz bireysel abone yok."}
        </p>
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
          </div>
        ) : null}
      </dialog>
    </>
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
    <form className="panel-form" action={(veri) => { kaydet(veri); onBitti(); }}>
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
