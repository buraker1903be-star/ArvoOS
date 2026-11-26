"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent } from "react";
import { TEMA_TERCIHLERI, type TemaTercihi } from "@/lib/konsol-giris/tema";
import { ceviriciKur, type Dil, type Metin } from "@/lib/konsol-giris/dil";
import { temaAbone, temaDurumu, temaTercihiniUygula } from "./tema-istemci";
import { AySimgesi, EkranSimgesi, GunesSimgesi, OnaySimgesi } from "./simgeler";

/*
  TEMA SEÇİCİ: AÇIK / KOYU / SİSTEM (ArvoLab app/_components/theme-toggle.tsx
  ile aynı yapı, simge ve klavye davranışı; canlı commit b3fab7a4).

  Eskiden ArvoOS'ta giriş ekranında tema seçimi hiç yoktu; tema yalnızca
  panelde ve iki durumluydu. Düğme küçük bir menü açar, üç seçenek,
  seçili olan işaretli. Düğmenin simgesi SEÇİLİ tercihi gösterir
  (güneş, ay, ekran) — gidilecek temayı gösterseydi menüyle ters okunurdu.

  Menü kendi başına kapanır (dışarı dokunuş, Escape, seçim). Klavye:
  ↑/↓/Home/End seçenekler arasında, Escape odağı düğmeye geri verir.
*/
const SECENEK: Record<TemaTercihi, { ad: Metin; ipucu?: Metin; Simge: typeof GunesSimgesi }> = {
  light: { ad: { tr: "Açık", en: "Light" }, Simge: GunesSimgesi },
  dark: { ad: { tr: "Koyu", en: "Dark" }, Simge: AySimgesi },
  system: { ad: { tr: "Sistem", en: "System" }, ipucu: { tr: "Cihazınızın ayarını izler", en: "Follows your device" }, Simge: EkranSimgesi },
};

/* Sunucuda tercih bilinmiyor; ilk çizim "system" der, istemci hemen gerçeğine geçer. */
const sunucuDurumu = () => "system:light";
const istemciDurumu = () => {
  const { tercih, tema } = temaDurumu();
  return `${tercih}:${tema}`;
};

/*
  Dil KODU alınır, çevirici burada kurulur: sunucu bileşeninden istemci
  bileşenine FONKSİYON geçirilemez (React bunu serileştiremiyor ve sayfa
  hata sınırına düşüyordu). ceviriciKur saf ve iki satır; ArvoLab aynı
  işi bir bağlam sağlayıcıyla (dil-saglayici) yapıyor — tek ekran için
  bağlam kurmak yerine dil doğrudan veriliyor.
*/
export default function TemaSecici({ dil, className = "kg-simge" }: { dil: Dil; className?: string }) {
  const t = ceviriciKur(dil);
  const durum = useSyncExternalStore(temaAbone, istemciDurumu, sunucuDurumu);
  const tercih = durum.split(":")[0] as TemaTercihi;
  const [acik, setAcik] = useState(false);
  const kok = useRef<HTMLDivElement>(null);
  const dugme = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const Simge = SECENEK[tercih].Simge;

  useEffect(() => {
    if (!acik) return;
    /* Açılınca odak seçili seçenekte: klavye kullanıcısı nerede olduğunu görür. */
    menu.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus();
    const disari = (olay: PointerEvent) => {
      if (!kok.current?.contains(olay.target as Node)) setAcik(false);
    };
    document.addEventListener("pointerdown", disari);
    return () => document.removeEventListener("pointerdown", disari);
  }, [acik]);

  const kapat = (odakGeriDonsun: boolean) => {
    setAcik(false);
    if (odakGeriDonsun) dugme.current?.focus();
  };

  const sec = (yeni: TemaTercihi) => {
    temaTercihiniUygula(yeni);
    kapat(true);
  };

  const tus = (olay: KeyboardEvent<HTMLDivElement>) => {
    if (olay.key === "Escape") {
      olay.preventDefault();
      kapat(true);
      return;
    }
    const ogeler = [...(menu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]') ?? [])];
    const simdiki = ogeler.indexOf(document.activeElement as HTMLButtonElement);
    const hedef =
      olay.key === "ArrowDown" ? (simdiki + 1) % ogeler.length
      : olay.key === "ArrowUp" ? (simdiki - 1 + ogeler.length) % ogeler.length
      : olay.key === "Home" ? 0
      : olay.key === "End" ? ogeler.length - 1
      : null;
    if (hedef === null) return;
    olay.preventDefault();
    ogeler[hedef]?.focus();
  };

  const secimAdi = t(SECENEK[tercih].ad);
  const etiket = t({ tr: `Tema: ${secimAdi}`, en: `Theme: ${secimAdi}` });

  return (
    <div className="kg-tema" ref={kok}>
      <button
        ref={dugme}
        type="button"
        className={className}
        aria-haspopup="menu"
        aria-expanded={acik}
        aria-label={etiket}
        title={etiket}
        onClick={() => setAcik((a) => !a)}
      >
        <Simge size={17} strokeWidth={1.9} />
      </button>
      {acik ? (
        <div ref={menu} className="kg-tema-menu" role="menu" aria-label={t({ tr: "Tema", en: "Theme" })} onKeyDown={tus}>
          {TEMA_TERCIHLERI.map((secenek) => {
            const { ad, ipucu, Simge: SecenekSimgesi } = SECENEK[secenek];
            const secili = secenek === tercih;
            return (
              <button key={secenek} type="button" role="menuitemradio" aria-checked={secili} tabIndex={secili ? 0 : -1} onClick={() => sec(secenek)}>
                <SecenekSimgesi size={16} strokeWidth={1.9} />
                <span className="kg-tema-ad">
                  {t(ad)}
                  {ipucu ? <small>{t(ipucu)}</small> : null}
                </span>
                {secili ? <OnaySimgesi className="kg-tema-isaret" size={16} strokeWidth={2} /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
