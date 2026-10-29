"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { OnayPenceresi, type OnayIstegi } from "../../components/onay-penceresi";
import { csvMetni, csvTutar } from "@/lib/csv";
import { todayInIstanbul } from "@/lib/istanbul-date";
import { topluHatirlatma } from "./toplu-actions";
import "./toplu-islem.css";

/*
  MÜŞTERİ LİSTESİNİN TOPLU İŞLEM ÇUBUĞU (29.10.2026).

  Satırlardaki seçim kutuları tablonun içinde, sunucuda çiziliyor; bu
  çubuk onları `form="mu-toplu"` özniteliğiyle kendi formuna bağlıyor —
  tabloyu istemci bileşenine çevirmeden. Seçim sayısı belge düzeyindeki
  change olayından okunuyor (form özniteliğiyle bağlanan kutunun olayı
  forma değil kendi atasına kabarıyor).

  İki iş:
   - Hatırlatma e-postası: seçilenlere, onay penceresinden sonra
     (toplu-actions.ts; alıcıyı ve ürünleri sunucu okuyor).
   - CSV: seçilenler, seçim yoksa listede GÖRÜNEN bütün satırlar (süzgeç
     ve arama uygulanmış hâli). Dosya tarayıcıda kuruluyor: veri zaten
     sayfada, ikinci bir okuma uç noktası açmaya gerek yok.
*/
export type CsvSatiri = {
  secim: string; tur: string; ad: string; eposta: string | null; telefon: string | null; urunler: string;
  paket: string | null; kullanici: string | null; durum: string; aylik: number | null; yenileme: string | null; olusma: string | null;
};

const FORM = "mu-toplu";
const kutular = () => [...document.querySelectorAll<HTMLInputElement>(`input[type=checkbox][form=${FORM}][name=secim]`)];

export function TopluIslem({ satirlar }: { satirlar: CsvSatiri[] }) {
  const form = useRef<HTMLFormElement>(null);
  const [secili, setSecili] = useState<string[]>([]);
  const [onay, setOnay] = useState<OnayIstegi | null>(null);
  const [calisiyor, basla] = useTransition();

  const oku = useCallback(() => setSecili(kutular().filter((k) => k.checked).map((k) => k.value)), []);
  useEffect(() => {
    const dinle = (olay: Event) => { if ((olay.target as HTMLInputElement | null)?.getAttribute?.("form") === FORM) oku(); };
    document.addEventListener("change", dinle);
    return () => document.removeEventListener("change", dinle);
  }, [oku]);

  const hepsi = satirlar.length > 0 && secili.length === satirlar.length;
  const tumunuSec = () => { for (const k of kutular()) k.checked = !hepsi; oku(); };
  const temizle = () => { for (const k of kutular()) k.checked = false; oku(); };

  const indir = () => {
    const kume = new Set(secili);
    const liste = secili.length ? satirlar.filter((s) => kume.has(s.secim)) : satirlar;
    const metin = csvMetni(
      ["Tür", "Ad", "E-posta", "Telefon", "Ürünler", "Paket", "Kullanıcı", "Durum", "Aylık (TL, KDV dahil)", "Yenileme", "Kayıt"],
      liste.map((s) => [s.tur, s.ad, s.eposta, s.telefon, s.urunler, s.paket, s.kullanici, s.durum, csvTutar(s.aylik), s.yenileme?.slice(0, 10) ?? null, s.olusma?.slice(0, 10) ?? null]),
    );
    const adres = URL.createObjectURL(new Blob([metin], { type: "text/csv;charset=utf-8" }));
    const a = Object.assign(document.createElement("a"), { href: adres, download: `musteriler-${todayInIstanbul()}.csv` });
    a.click();
    URL.revokeObjectURL(adres);
  };

  return (
    <div className="mu-toplu" role="toolbar" aria-label="Toplu işlem">
      <form id={FORM} ref={form} action={topluHatirlatma} hidden />
      <label className="mu-toplu-hepsi">
        <input type="checkbox" checked={hepsi} onChange={tumunuSec} aria-label="Listedeki bütün müşterileri seç" />
        <span>{secili.length ? `${secili.length} seçili` : "Seç"}</span>
      </label>
      {secili.length ? <button type="button" className="mu-toplu-temizle" onClick={temizle}>Seçimi kaldır</button> : null}
      <span className="mu-toplu-bosluk" />
      <button type="button" className="panel-secondary" onClick={indir} title={secili.length ? "Seçilenleri CSV olarak indir" : "Listede görünen bütün müşterileri CSV olarak indir"}>
        CSV indir{secili.length ? ` (${secili.length})` : ""}
      </button>
      <button type="button" className="panel-primary" disabled={!secili.length || calisiyor}
        onClick={() => setOnay({
          ust: "Toplu işlem",
          baslik: `${secili.length} müşteriye hatırlatma e-postası gönderilsin mi?`,
          metin: "Her müşteriye açık aboneliklerinin dönem sonu ve tutarı tek e-postada gider: kurumlarda Kurum Sahiplerine, bireyselde aboneye. Açık aboneliği olmayanlar ve Arvo/grup kayıtları atlanır.",
          onayEtiketi: "Gönder",
        })}>
        {calisiyor ? "Gönderiliyor…" : "Hatırlatma e-postası"}
      </button>
      <OnayPenceresi istek={onay} calisiyor={calisiyor} onIptal={() => { if (!calisiyor) setOnay(null); }}
        onOnay={() => basla(async () => {
          const veri = new FormData();
          for (const s of secili) veri.append("secim", s);
          await topluHatirlatma(veri);
          setOnay(null);
          temizle();
        })} />
    </div>
  );
}
