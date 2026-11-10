"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { etkinUygulama, type OsUygulama } from "./os-apps";
import { etkinBolum } from "./os-bolumler";
import { OsSimge } from "./os-icons";

/*
  MODÜL BÖLÜMLERİ İÇERİĞİN ÜSTÜNDE (10.11.2026, ürün kararı).

  Eskiden bölümler masaüstünde dock'un üstünde FAREYLE açılan ikinci bir
  menüdeydi (klavyede ↑ tuşunu bilmeyen bulamıyordu), telefonda üst
  çubuğun altında YATAY KAYAN bir şeritteydi (sağdaki bölümler ekran
  dışında, var olduğu görünmüyordu). İkisi de kalktı; tek yer burası:

  - Masaüstü (≥761px): satır sarılan bağlantılar; hepsi görünür, kaydırma yok.
  - Telefon: "CRM · Talepler ▾" düğmesi, dokununca bölümler alt alta açılır.
    Esc ve dışarı dokunmak kapatır, odak düğmeye döner.

  Yüksekliği ölçülüp --os-bolum-h olarak kabuğa yazılıyor: sabit
  yükseklikli sayfalar (ana ekran, liste sayfaları) bu satırı hesaba katar,
  satır iki satıra sarılsa bile sayfa taşmaz.
*/
export function OsBolumMenusu({ uygulamalar }: { uygulamalar: OsUygulama[] }) {
  const yol = usePathname();
  const sorgu = useSearchParams();
  const kutu = useRef<HTMLElement>(null);
  const dugme = useRef<HTMLButtonElement>(null);
  const [acikYol, setAcikYol] = useState<string | null>(null);
  const acik = acikYol === yol;

  const uygulama = etkinUygulama(uygulamalar, yol);
  const bolumler = uygulama?.bolumler ?? [];
  const etkin = bolumler.length ? etkinBolum(bolumler, yol, sorgu.toString()) : null;
  const gorunur = bolumler.length >= 2;

  // Yükseklik kabuğa: görünmüyorsa 0.
  useEffect(() => {
    const kok = document.querySelector<HTMLElement>(".os-root");
    if (!kok) return;
    const oge = kutu.current;
    if (!oge) { kok.style.setProperty("--os-bolum-h", "0px"); return; }
    const yaz = () => kok.style.setProperty("--os-bolum-h", `${Math.ceil(oge.getBoundingClientRect().height)}px`);
    yaz();
    const gozcu = new ResizeObserver(yaz);
    gozcu.observe(oge);
    return () => { gozcu.disconnect(); kok.style.setProperty("--os-bolum-h", "0px"); };
  }, [gorunur, uygulama?.key]);

  // Telefonda açık menü: dışarı dokununca ya da Esc ile kapanır.
  useEffect(() => {
    if (!acik) return;
    const disari = (olay: PointerEvent) => { if (!kutu.current?.contains(olay.target as Node)) setAcikYol(null); };
    const tus = (olay: KeyboardEvent) => { if (olay.key === "Escape") { setAcikYol(null); dugme.current?.focus(); } };
    document.addEventListener("pointerdown", disari);
    document.addEventListener("keydown", tus);
    return () => { document.removeEventListener("pointerdown", disari); document.removeEventListener("keydown", tus); };
  }, [acik]);

  if (!gorunur || !uygulama) return null;
  return (
    <nav ref={kutu} className="os-bolumler" aria-label={`${uygulama.label} bölümleri`}>
      <button
        ref={dugme}
        type="button"
        className="os-bolumler-ac"
        aria-expanded={acik}
        aria-controls="os-bolum-listesi"
        onClick={() => setAcikYol(acik ? null : yol)}
      >
        <span className="os-bolumler-modul">{uygulama.label}</span>
        <b>{etkin?.label ?? "Bölümler"}</b>
        <OsSimge ad="back" boyut={14} />
      </button>
      <ul id="os-bolum-listesi" className={acik ? "os-bolumler-liste is-acik" : "os-bolumler-liste"}>
        {bolumler.map((b) => (
          <li key={b.key}>
            <Link
              href={b.href}
              className={etkin?.key === b.key ? "is-active" : undefined}
              aria-current={etkin?.key === b.key ? "page" : undefined}
              onClick={() => setAcikYol(null)}
            >
              {b.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
