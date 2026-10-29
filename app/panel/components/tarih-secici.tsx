"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { todayInIstanbul } from "@/lib/istanbul-date";
import { AY_KISA, AYLAR, aralikta, ayEkle, ayIzgarasi, GUN_KISA, GUNLER, gunEkle, gunMu, goreliAd, haftaGunu, kutuYazisi, parcala, uzunYazi, yaziMaskesi, yaziyiCoz } from "@/lib/takvim";
import "./tarih-secici.css";

/*
  PANELİN TARİH SEÇİCİSİ (29.10.2026, kurum sahibinin isteği: "panelde
  tüm tarih seçiciler aynı olsun").

  Eskiden her yer tarayıcının kendi <input type="date">'ini kullanıyordu:
  Chrome'da küçük gri bir takvim, Safari'de başka bir düzen, Windows'ta
  ABD sırasıyla ay/gün; ayı ve yılı değiştirmek ok tuşuyla tek tek
  ilerlemek demekti. Burada:
   - kutu "gg.aa.yyyy" yazılabilir (noktalar kendiliğinden), yanında gün adı;
   - takvim Türkçe, pazartesi başlar, ay ve yıl ızgarasına geçilebilir;
   - bugün halkalı, seçili dolu, aralık dışı (min/max) günler kapalı;
   - kısayollar: Bugün, Yarın, 1 hafta, 1 ay; zorunlu değilse Temizle;
   - klavye: oklar gün/hafta, PageUp/PageDown ay (Shift ile yıl),
     Home/End hafta başı/sonu, Enter seçer, Escape kapatır.

  FORM SÖZLEŞMESİ DEĞİŞMEDİ. Görünmez bir yerel <input type="date">
  adı, değeri ("YYYY-MM-DD"), required/min/max doğrulamasını ve change
  olayını taşıyor: sunucu işlemleri aynı alanı okuyor, AnindaForm
  (operasyon) tarih değişince yine kendiliğinden gönderiyor, eksik
  zorunlu tarih tarayıcının uyarısını yine bu alanın üstünde veriyor.

  Takvim panelin köküne (.panel-root) çiziliyor ve konumu ekrana göre
  hesaplanıyor: pencere gövdeleri ve tablolar overflow:hidden; kutunun
  altına çizilen takvim onların içinde kesiliyordu.
*/

type Ortak = {
  name?: string;
  required?: boolean;
  disabled?: boolean;
  min?: string;
  max?: string;
  id?: string;
  className?: string;
  "aria-label"?: string;
  placeholder?: string;
};
type Props = Ortak & (
  | { value: string; onChange: (deger: string) => void; defaultValue?: never }
  | { value?: never; onChange?: (deger: string) => void; defaultValue?: string | null }
);

const bos = () => () => {};
type Gorunum = "gun" | "ay" | "yil";

/* React'in kontrollü yerel alanında değer, React'in izlediği ayarlayıcıdan
   yazılmalı; yoksa olay React'e "değişmedi" diye ulaşır. */
function yerelDegerYaz(alan: HTMLInputElement, deger: string) {
  const ayarlayici = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  ayarlayici?.call(alan, deger);
  alan.dispatchEvent(new Event("input", { bubbles: true }));
  alan.dispatchEvent(new Event("change", { bubbles: true }));
}

export function TarihSecici(props: Props) {
  const { name, required, disabled, min, max, id, className, placeholder = "gg.aa.yyyy" } = props;
  const etiket = props["aria-label"];
  const kontrollu = props.value !== undefined;
  const [icDeger, setIcDeger] = useState(() => (gunMu(props.defaultValue) ? props.defaultValue : ""));
  const deger = kontrollu ? (gunMu(props.value) ? props.value : "") : icDeger;

  const [yazi, setYazi] = useState(() => kutuYazisi(deger));
  const [oncekiDeger, setOncekiDeger] = useState(deger);
  // Değer dışarıdan değişince (kontrollü alan, +1 ay düğmesi) kutu da güncellensin.
  if (deger !== oncekiDeger) {
    setOncekiDeger(deger);
    setYazi(kutuYazisi(deger));
  }

  const bugun = useSyncExternalStore(bos, () => todayInIstanbul(), () => "");
  const [acik, setAcik] = useState(false);
  const [gorunum, setGorunum] = useState<Gorunum>("gun");
  const [odak, setOdak] = useState(() => deger || todayInIstanbul());
  const [konum, setKonum] = useState<{ top: number; left: number; yukari: boolean } | null>(null);

  const kokRef = useRef<HTMLDivElement>(null);
  const yerelRef = useRef<HTMLInputElement>(null);
  const kutuRef = useRef<HTMLInputElement>(null);
  const takvimRef = useRef<HTMLDivElement>(null);
  const takvimId = useId();
  const istemci = useSyncExternalStore(bos, () => true, () => false);
  const hedef = istemci ? (document.querySelector(".panel-root") ?? document.body) : null;

  const sec = useCallback((yeni: string) => {
    if (yeni && !aralikta(yeni, min, max)) return;
    if (!kontrollu) setIcDeger(yeni);
    setYazi(kutuYazisi(yeni));
    if (yerelRef.current) yerelDegerYaz(yerelRef.current, yeni);
    props.onChange?.(yeni);
  }, [kontrollu, min, max, props]);

  const ac = () => {
    if (disabled) return;
    setOdak(deger || (aralikta(bugun || todayInIstanbul(), min, max) ? (bugun || todayInIstanbul()) : (min || max || todayInIstanbul())));
    setGorunum("gun");
    setAcik(true);
  };
  const kapat = (odaklan = true) => {
    setAcik(false);
    if (odaklan) kutuRef.current?.focus();
  };

  /* Değer dışarıdan değişince (kontrollü alan) formun asıl alanı da aynı
     değeri taşısın; olay yayılmıyor — değişikliği yapan zaten biliyor. */
  useEffect(() => {
    if (yerelRef.current && yerelRef.current.value !== deger) yerelRef.current.value = deger;
  }, [deger]);

  /* Form sıfırlanınca (React 19 işlemden sonra formu sıfırlıyor) kontrolsüz alan ilk değerine döner. */
  useEffect(() => {
    const form = yerelRef.current?.form;
    if (!form || kontrollu) return;
    const sifirla = () => {
      const ilk = gunMu(props.defaultValue) ? props.defaultValue : "";
      setIcDeger(ilk);
      setYazi(kutuYazisi(ilk));
    };
    form.addEventListener("reset", sifirla);
    return () => form.removeEventListener("reset", sifirla);
  }, [kontrollu, props.defaultValue]);

  /* Konum: kutunun altı; sığmıyorsa üstü. Kaydırma ve yeniden boyutlamada izler. */
  useLayoutEffect(() => {
    if (!acik) return;
    const hesapla = () => {
      const kutu = kokRef.current?.getBoundingClientRect();
      if (!kutu) return;
      const genislik = 312;
      const yukseklik = takvimRef.current?.offsetHeight ?? 380;
      const altaSigar = kutu.bottom + 6 + yukseklik <= window.innerHeight - 8;
      const yukari = !altaSigar && kutu.top - 6 - yukseklik >= 8;
      const left = Math.max(8, Math.min(kutu.left, window.innerWidth - genislik - 8));
      setKonum({ top: yukari ? kutu.top - 6 - yukseklik : Math.min(kutu.bottom + 6, window.innerHeight - yukseklik - 8), left, yukari });
    };
    hesapla();
    window.addEventListener("scroll", hesapla, true);
    window.addEventListener("resize", hesapla);
    return () => {
      window.removeEventListener("scroll", hesapla, true);
      window.removeEventListener("resize", hesapla);
    };
  }, [acik, gorunum]);

  /* Dışarı tıklayınca kapanır. */
  useEffect(() => {
    if (!acik) return;
    const disari = (olay: PointerEvent) => {
      const t = olay.target as Node;
      if (kokRef.current?.contains(t) || takvimRef.current?.contains(t)) return;
      setAcik(false);
    };
    document.addEventListener("pointerdown", disari, true);
    return () => document.removeEventListener("pointerdown", disari, true);
  }, [acik]);

  /* Açılınca odak seçili/bugün gününe. */
  useEffect(() => {
    if (!acik || gorunum !== "gun") return;
    takvimRef.current?.querySelector<HTMLButtonElement>(`[data-gun="${odak}"]`)?.focus({ preventScroll: true });
  }, [acik, gorunum, odak]);

  const tus = (olay: React.KeyboardEvent) => {
    if (olay.key === "Escape") {
      // Pencerenin (PanelModal/PanelDrawer) Escape'i de kapatmasın: defaultPrevented'a bakıyorlar.
      olay.preventDefault();
      kapat();
      return;
    }
    if (gorunum !== "gun") return;
    const adim: Record<string, () => string> = {
      ArrowLeft: () => gunEkle(odak, -1),
      ArrowRight: () => gunEkle(odak, 1),
      ArrowUp: () => gunEkle(odak, -7),
      ArrowDown: () => gunEkle(odak, 7),
      PageUp: () => ayEkle(odak, olay.shiftKey ? -12 : -1),
      PageDown: () => ayEkle(odak, olay.shiftKey ? 12 : 1),
      Home: () => gunEkle(odak, -haftaGunu(odak)),
      End: () => gunEkle(odak, 6 - haftaGunu(odak)),
    };
    if (adim[olay.key]) {
      olay.preventDefault();
      setOdak(adim[olay.key]());
    }
  };

  /* Yazılan tarihi değer yap; kutunun yazısı ellenmez (kullanıcı hâlâ yazıyor). */
  const yazidanAl = (cozulen: string) => {
    setOncekiDeger(cozulen);
    if (!kontrollu) setIcDeger(cozulen);
    if (yerelRef.current) yerelDegerYaz(yerelRef.current, cozulen);
    props.onChange?.(cozulen);
    setOdak(cozulen);
  };
  /*
    Yazarken yalnızca DÖRT haneli yıl kabul edilir. Eskiden "09.07.20"
    yazıldığı an 2020 sayılıyor, değer değişince kutu "09.07.2020" ile
    yeniden yazılıyor ve kalan rakamlar ("26") taşıp kayboluyordu. İki
    haneli yıl ("09.07.26") odaktan çıkınca kabul edilir.
  */
  const yaziDegisti = (ham: string) => {
    const maskeli = yaziMaskesi(ham);
    setYazi(maskeli);
    /* Kutu boşaltılınca değer HEMEN silinmez: yeniden yazmak için metni
       seçip silmek, anında kaydeden formda (AnindaForm) kayıtlı terminin
       silinmesi demekti. Silme odaktan çıkınca ya da Temizle ile. */
    if (!maskeli) return;
    const cozulen = /\d{4}$/.test(maskeli) ? yaziyiCoz(maskeli) : null;
    if (cozulen && cozulen !== deger && aralikta(cozulen, min, max)) yazidanAl(cozulen);
  };
  // Odaktan çıkınca: iki haneli yıl da çözülür; yarım ya da geçersiz yazı son geçerli değere döner.
  const yaziBitti = () => {
    if (!yazi) {
      // Zorunlu alan boş bırakılamaz: son değerine döner.
      if (deger && !required) yazidanAl("");
      else setYazi(kutuYazisi(deger));
      return;
    }
    const cozulen = yaziyiCoz(yazi);
    if (cozulen && cozulen !== deger && aralikta(cozulen, min, max)) {
      yazidanAl(cozulen);
      setYazi(kutuYazisi(cozulen));
      return;
    }
    setYazi(kutuYazisi(deger));
  };

  const { yil, ay } = parcala(odak);
  const goreli = deger && bugun ? goreliAd(deger, bugun) : null;
  // Yıl ızgarası bulunulan yılı ortalasın: önceki ve sonraki yıllar bir bakışta.
  const yilBasi = yil - 5;
  const kisayollar = bugun ? [
    { ad: "Bugün", gun: bugun },
    { ad: "Yarın", gun: gunEkle(bugun, 1) },
    { ad: "1 hafta", gun: gunEkle(bugun, 7) },
    { ad: "1 ay", gun: ayEkle(bugun, 1) },
  ] : [];

  const takvim = acik && hedef ? createPortal(
    <div
      ref={takvimRef}
      id={takvimId}
      className="tsc-takvim"
      role="dialog"
      aria-label={etiket ? `${etiket} — takvim` : "Takvim"}
      data-yukari={konum?.yukari ? "evet" : undefined}
      style={konum ? { top: konum.top, left: konum.left } : { visibility: "hidden", top: 0, left: 0 }}
      onKeyDown={tus}
    >
      <div className="tsc-bas">
        <button type="button" className="tsc-baslik" onClick={() => setGorunum(gorunum === "gun" ? "ay" : gorunum === "ay" ? "yil" : "gun")} aria-label="Ay ve yıl seç">
          {gorunum === "yil" ? `${yilBasi} – ${yilBasi + 11}` : gorunum === "ay" ? yil : <>{AYLAR[ay - 1]} <span>{yil}</span></>}
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
        </button>
        <div className="tsc-oklar">
          <button type="button" aria-label="Önceki" onClick={() => setOdak(gorunum === "gun" ? ayEkle(odak, -1) : gorunum === "ay" ? ayEkle(odak, -12) : ayEkle(odak, -144))}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
          </button>
          <button type="button" aria-label="Sonraki" onClick={() => setOdak(gorunum === "gun" ? ayEkle(odak, 1) : gorunum === "ay" ? ayEkle(odak, 12) : ayEkle(odak, 144))}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
          </button>
        </div>
      </div>

      {gorunum === "gun" ? (
        <div className="tsc-izgara" role="grid" aria-label={`${AYLAR[ay - 1]} ${yil}`}>
          {GUN_KISA.map((g, i) => <span key={g} className="tsc-gun-adi" data-hafta-sonu={i > 4 ? "evet" : undefined} aria-hidden="true">{g}</span>)}
          {ayIzgarasi(yil, ay).map(({ gun, ayIcinde }) => {
            const kapali = !aralikta(gun, min, max);
            const secili = gun === deger;
            return (
              <button
                key={gun}
                type="button"
                data-gun={gun}
                className="tsc-gun"
                data-disari={ayIcinde ? undefined : "evet"}
                data-bugun={gun === bugun ? "evet" : undefined}
                data-secili={secili ? "evet" : undefined}
                data-hafta-sonu={haftaGunu(gun) > 4 ? "evet" : undefined}
                disabled={kapali}
                tabIndex={gun === odak ? 0 : -1}
                aria-pressed={secili}
                aria-label={`${uzunYazi(gun)}${gun === bugun ? " (bugün)" : ""}`}
                onClick={() => { sec(gun); kapat(); }}
              >
                {parcala(gun).gun}
              </button>
            );
          })}
        </div>
      ) : gorunum === "ay" ? (
        <div className="tsc-secim-izgara">
          {AY_KISA.map((ad, i) => (
            <button key={ad} type="button" data-secili={deger && parcala(deger).yil === yil && parcala(deger).ay === i + 1 ? "evet" : undefined}
              data-bugun={bugun && parcala(bugun).yil === yil && parcala(bugun).ay === i + 1 ? "evet" : undefined}
              onClick={() => { setOdak(ayEkle(odak, i + 1 - ay)); setGorunum("gun"); }}>{ad}</button>
          ))}
        </div>
      ) : (
        <div className="tsc-secim-izgara">
          {Array.from({ length: 12 }, (_, i) => yilBasi + i).map((y) => (
            <button key={y} type="button" data-secili={deger && parcala(deger).yil === y ? "evet" : undefined}
              data-bugun={bugun && parcala(bugun).yil === y ? "evet" : undefined}
              onClick={() => { setOdak(ayEkle(odak, (y - yil) * 12)); setGorunum("ay"); }}>{y}</button>
          ))}
        </div>
      )}

      <div className="tsc-kisayol">
        {kisayollar.map((k) => (
          <button key={k.ad} type="button" disabled={!aralikta(k.gun, min, max)} data-secili={deger === k.gun ? "evet" : undefined} onClick={() => { sec(k.gun); kapat(); }}>{k.ad}</button>
        ))}
      </div>
      <div className="tsc-alt">
        <span>{deger ? uzunYazi(deger) : "Tarih seçilmedi"}</span>
        {!required && deger ? <button type="button" onClick={() => { sec(""); kapat(); }}>Temizle</button> : null}
      </div>
    </div>,
    hedef,
  ) : null;

  return (
    <div ref={kokRef} className={className ? `tsc ${className}` : "tsc"} data-acik={acik ? "evet" : undefined} data-kapali={disabled ? "evet" : undefined}>
      <input
        ref={kutuRef}
        id={id}
        className="tsc-kutu"
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={yazi}
        placeholder={placeholder}
        disabled={disabled}
        aria-label={etiket}
        role="combobox"
        aria-haspopup="dialog"
        aria-expanded={acik}
        aria-controls={acik ? takvimId : undefined}
        onChange={(olay) => yaziDegisti(olay.target.value)}
        onBlur={yaziBitti}
        onClick={() => (acik ? null : ac())}
        onKeyDown={(olay) => {
          if (olay.key === "ArrowDown" && !acik) { olay.preventDefault(); ac(); }
          else if (olay.key === "Escape" && acik) { olay.preventDefault(); kapat(); }
          else if (olay.key === "Enter" && acik) { olay.preventDefault(); kapat(); }
        }}
      />
      {deger ? <span className="tsc-ek" aria-hidden="true">{goreli ?? GUNLER[haftaGunu(deger)]}</span> : null}
      <button type="button" className="tsc-dugme" tabIndex={-1} disabled={disabled} aria-label="Takvimi aç" onClick={() => (acik ? kapat() : ac())}>
        <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15.5" rx="2.5" /><path d="M3.5 9.5h17M8 3v4M16 3v4" /></svg>
      </button>
      {/* Formun asıl alanı: ad, değer, required/min/max ve change olayı burada (bkz. yukarı). */}
      <input
        ref={yerelRef}
        className="tsc-yerel"
        type="date"
        name={name}
        defaultValue={deger}
        required={required}
        disabled={disabled}
        min={min}
        max={max}
        tabIndex={-1}
        aria-hidden="true"
        onFocus={() => kutuRef.current?.focus()}
      />
      {takvim}
    </div>
  );
}
