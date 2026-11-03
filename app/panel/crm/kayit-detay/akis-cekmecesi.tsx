"use client";

import { Children, useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import "./akis-cekmecesi.css";

/*
  YAZIŞMALAR ÇEKMECESİ (03.11.2026, AkademikMerkez'in geri bildirimi).

  İş detayının üçüncü sütunu sekmeli bir akıştı (TalepAkis): mesajlar,
  yorumlar, WhatsApp, postalar ve geçmiş, sütunun içinde. Sütun dar ve
  kısaydı (dizüstünde ~250 px, aynı anda iki mesaj); müşterinin uzun
  mesajları satır satır kırılıyor, personel sürekli kaydırarak okuyordu.

  Şimdi sütunda yalnızca ÖZET var: kanal başına bir düğme, yanında yeni
  rozeti ve son mesajın ilk satırları. Düğme sağdan açılan geniş bir
  çekmeceyi o kanalın sekmesinde açıyor; sekmeler çekmecenin içinde.

  Çekmece BİLEREK kipsiz (arka planı karartmıyor, sayfayı kilitlemiyor):
  personel mesajı okurken görevi de işaretliyor ("giriş bölümü
  gönderildi" → görev tamam). Ortada açılan bir pencere görev listesini
  kapatır, her seferinde kapatıp açmak gerekirdi.

  Paneller yalnızca İLK AÇILDIKLARINDA kuruluyor: müşteri mesajları panel
  kurulunca okundu sayılıyor; sayfayı açmak okumak sayılsaydı okunmamış
  rozeti kimse görmeden sönerdi (TalepAkis'teki `tembel` kuralı).
*/
export type AkisKanali = {
  ad: string;
  /** "3 yeni" gibi; varsa düğmede vurgulu görünür. */
  rozet?: string | null;
  /** Son mesajın özeti; yoksa `bos` yazar. */
  onizleme?: { kim: string; metin: string; zaman: string } | null;
  bos?: string;
};

const abonelikYok = () => () => undefined;

export function AkisCekmecesi({
  kanallar,
  baslik,
  kicker,
  acikBaslar = null,
  telefondaAcma = false,
  children,
}: {
  kanallar: AkisKanali[];
  baslik: string;
  kicker?: string;
  /** Adres bir kanalı istiyorsa (bildirimden gelen bağlantı) çekmece o sekmede açık başlar. */
  acikBaslar?: number | null;
  /*
    Telefonda o kanalın kendi penceresi varsa (iş detayının alt
    düğmeleri, opd-telefon) çekmece açılışta açılmaz: ikisi birden
    açılıp üst üste biniyordu. panel-modal'daki `yalnizcaTelefonda`
    kuralının tersi.
  */
  telefondaAcma?: boolean;
  children: ReactNode;
}) {
  const [acik, setAcik] = useState(() =>
    acikBaslar !== null && !(telefondaAcma && typeof window !== "undefined" && window.matchMedia("(max-width:760px)").matches));
  const [secili, setSecili] = useState(acikBaslar ?? 0);
  const [kurulanlar, setKurulanlar] = useState(() => new Set(acikBaslar === null ? [] : [acikBaslar]));
  const baslikId = useId();
  const kimlik = useId();
  const pencereRef = useRef<HTMLElement>(null);
  const istemcide = useSyncExternalStore(abonelikYok, () => true, () => false);
  const hedef = istemcide ? (document.querySelector(".panel-root") ?? document.body) : null;
  const paneller = Children.toArray(children);

  const sec = (sira: number) => {
    setSecili(sira);
    setKurulanlar((onceki) => (onceki.has(sira) ? onceki : new Set(onceki).add(sira)));
  };
  const ac = (sira: number) => {
    sec(sira);
    setAcik(true);
  };

  useEffect(() => {
    if (!acik) return;
    pencereRef.current?.focus({ preventScroll: true });
    const tus = (olay: KeyboardEvent) => {
      // Açık bir tarih seçicinin Escape'i yalnızca onu kapatır (tarih-secici.tsx).
      if (olay.key === "Escape" && !olay.defaultPrevented) setAcik(false);
    };
    document.addEventListener("keydown", tus);
    return () => document.removeEventListener("keydown", tus);
  }, [acik]);

  const cekmece = (
    <aside
      ref={pencereRef}
      tabIndex={-1}
      className={acik ? "akis-cekmece is-acik" : "akis-cekmece"}
      role="dialog"
      aria-modal="false"
      aria-labelledby={baslikId}
      aria-hidden={!acik}
      inert={!acik}
    >
      <header className="akis-cekmece-bas">
        <div>
          {kicker ? <small className="panel-kicker">{kicker}</small> : null}
          <h2 id={baslikId}>{baslik}</h2>
        </div>
        <button className="akis-cekmece-kapat" type="button" aria-label="Kapat" onClick={() => setAcik(false)}>×</button>
      </header>
      <div className="talep-akis-sekmeler akis-cekmece-sekmeler" role="tablist" aria-label={baslik}>
        {kanallar.map((kanal, sira) => (
          <button
            key={kanal.ad}
            type="button"
            role="tab"
            id={`${kimlik}-sekme-${sira}`}
            aria-selected={sira === secili}
            aria-controls={`${kimlik}-panel-${sira}`}
            tabIndex={sira === secili ? 0 : -1}
            className={sira === secili ? "is-active" : undefined}
            onClick={() => sec(sira)}
            onKeyDown={(olay) => {
              if (olay.key !== "ArrowRight" && olay.key !== "ArrowLeft") return;
              const sonraki = (secili + (olay.key === "ArrowRight" ? 1 : -1) + kanallar.length) % kanallar.length;
              sec(sonraki);
              document.getElementById(`${kimlik}-sekme-${sonraki}`)?.focus();
            }}
          >
            {kanal.ad}
            {kanal.rozet ? <span className="akis-rozet">{kanal.rozet}</span> : null}
          </button>
        ))}
      </div>
      {paneller.map((panel, sira) => (
        <div
          key={sira}
          id={`${kimlik}-panel-${sira}`}
          role="tabpanel"
          aria-labelledby={`${kimlik}-sekme-${sira}`}
          hidden={sira !== secili}
          className="talep-akis-panel akis-cekmece-panel"
        >
          {kurulanlar.has(sira) ? panel : null}
        </div>
      ))}
    </aside>
  );

  return (
    <>
      <section className="panel-card akis-ozet" aria-label={baslik}>
        <h3 className="akis-ozet-baslik">{baslik}</h3>
        <ul>
          {kanallar.map((kanal, sira) => (
            <li key={kanal.ad}>
              <button
                type="button"
                className={acik && sira === secili ? "akis-ozet-satir is-secili" : "akis-ozet-satir"}
                aria-expanded={acik && sira === secili}
                onClick={() => (acik && sira === secili ? setAcik(false) : ac(sira))}
              >
                <span className="akis-ozet-ust">
                  <b>{kanal.ad}</b>
                  {kanal.rozet ? <span className="akis-rozet">{kanal.rozet}</span> : null}
                  {kanal.onizleme ? <time>{kanal.onizleme.zaman}</time> : null}
                </span>
                {kanal.onizleme ? (
                  <span className="akis-ozet-metin"><em>{kanal.onizleme.kim}:</em> {kanal.onizleme.metin}</span>
                ) : kanal.bos ? (
                  <span className="akis-ozet-metin is-bos">{kanal.bos}</span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      </section>
      {hedef ? createPortal(cekmece, hedef) : null}
    </>
  );
}
