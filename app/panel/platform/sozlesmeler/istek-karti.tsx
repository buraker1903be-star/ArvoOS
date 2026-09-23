"use client";

import { useState, useTransition } from "react";
import { para } from "../bicim";
import { abonelikIsteginiOnayla, abonelikIsteginiReddet } from "./actions";

/*
  Bekleyen abonelik isteği kartı.

  İki karar var ve ikisi de geri alınamaz cinsten: onay modülleri açar,
  ret imzalı bir sözleşmeyi reddeder. Bu yüzden ikisi de tek tıkla
  olmuyor — onayda kiracı seçimi, rette sebep zorunlu.
*/

export type Kurum = { id: string; ad: string };

export type BekleyenIstek = {
  id: string;
  contractId: string | null;
  contractNo: string | null;
  customerName: string | null;
  amount: number | null;
  currency: string;
  createdAt: string;
  moduller: { product: string; name: string; monthlyFee: number | null; integrated: boolean }[];
  /** Adı kiracı listesiyle eşleşen kurum; kurucuya öneri olarak sunulur. */
  onerilenKurumId: string | null;
};

/*
  Tutar KURUŞUYLA yazılıyor. Burada ayrı bir biçimleyici vardı ve
  maximumFractionDigits: 0 kullanıyordu: sayfanın üstündeki "bekleyen
  tutar" kuruşlu, karttaki tutar yuvarlanmış çıkıyordu. Kurucu tahsilatı
  bu sayıyla doğruluyor; yuvarlanmış bir tutar, iki kaydın tutmamasına
  giden yol. Biçim artık tek yerde (../bicim).
*/

const tarih = (value: string) =>
  new Date(value).toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul", day: "numeric", month: "long", year: "numeric" });

export function IstekKarti({ istek, kurumlar }: { istek: BekleyenIstek; kurumlar: Kurum[] }) {
  const [kurumId, setKurumId] = useState(istek.onerilenKurumId ?? "");
  const [not, setNot] = useState("");
  const [calisiyor, basla] = useTransition();

  const onayla = () => {
    if (!kurumId) return;
    const ad = kurumlar.find((k) => k.id === kurumId)?.ad ?? "seçilen kiracı";
    if (!window.confirm(
      `${ad} için ${istek.moduller.length} modül açılsın mı?\n\n` +
      istek.moduller.map((m) => `· ${m.name}${m.integrated ? "" : " (bağımsız)"}`).join("\n") +
      "\n\nTahsilatı doğruladığınızdan emin olun.",
    )) return;

    basla(async () => {
      const veri = new FormData();
      veri.set("request_id", istek.id);
      veri.set("target_organization_id", kurumId);
      veri.set("review_note", not);
      await abonelikIsteginiOnayla(veri);
    });
  };

  const reddet = () => {
    if (!not.trim()) {
      window.alert("Ret sebebini yazın. İmzalı bir sözleşmeyi neden açmadığımız kayıtta olmalı.");
      return;
    }
    if (!window.confirm("İstek reddedilsin mi? Sözleşme imzalı kalır, yalnızca modüller açılmaz.")) return;

    basla(async () => {
      const veri = new FormData();
      veri.set("request_id", istek.id);
      veri.set("review_note", not);
      await abonelikIsteginiReddet(veri);
    });
  };

  return (
    <section className="panel-card istek-karti" aria-label={istek.contractNo ?? "Abonelik isteği"}>
      <header>
        <div>
          <b>{istek.customerName ?? "Müşteri adı yok"}</b>
          <small>{istek.contractNo ?? "sözleşme no yok"} · imza {tarih(istek.createdAt)}</small>
          {/*
            İmzalı sözleşmeye bağlantı. Kurucu bu ekranda "tahsilatı
            doğrula" diye karar veriyor ama sözleşmeyi açacak hiçbir yer
            yoktu: sözleşme no okunup app.arvo-os.com'da elle aranıyordu.
            Sözleşme öbür alan adında, o yüzden tam adres ve yeni sekme.
          */}
          {istek.contractId ? (
            <a
              className="istek-sozlesme"
              href={`https://app.arvo-os.com/panel/crm/contracts/${istek.contractId}`}
              target="_blank" rel="noreferrer"
            >Sözleşmeyi aç ↗</a>
          ) : null}
        </div>
        {istek.amount ? <span className="istek-tutar">{para(Number(istek.amount), istek.currency)}</span> : null}
      </header>

      {istek.moduller.length ? (
        <ul className="istek-moduller">
          {istek.moduller.map((modul) => (
            <li key={modul.product}>
              <b>{modul.name}</b>
              <span>
                {modul.monthlyFee ? `${para(Number(modul.monthlyFee), istek.currency)} / ay` : "ücret belirtilmedi"}
                {modul.integrated ? "" : " · bağımsız"}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        /* Modülsüz bir istek onaylanamaz; sunucu da reddediyor. Sebebini
           burada söylüyoruz ki kurucu düğmeyi deneyip hata almasın. */
        <p className="istek-uyari">
          Sözleşmede açılacak modül belirtilmemiş. Sözleşmeyi hazırlayan satış temsilcisinden modülleri eklemesini isteyin.
        </p>
      )}

      <div className="istek-alanlar">
        <label>
          Aboneliğin açılacağı kiracı
          <select value={kurumId} onChange={(olay) => setKurumId(olay.target.value)}>
            <option value="">Seçin…</option>
            {kurumlar.map((kurum) => <option key={kurum.id} value={kurum.id}>{kurum.ad}</option>)}
          </select>
        </label>
        <label>
          Not
          <input value={not} onChange={(olay) => setNot(olay.target.value)} placeholder="Onayda isteğe bağlı, rette zorunlu" />
        </label>
      </div>

      <div className="istek-islemler">
        <button type="button" className="panel-secondary" disabled={calisiyor} onClick={reddet}>Reddet</button>
        <button
          type="button"
          className="panel-primary"
          disabled={calisiyor || !kurumId || !istek.moduller.length}
          onClick={onayla}
        >
          {calisiyor ? "İşleniyor…" : "Onayla ve modülleri aç"}
        </button>
      </div>
    </section>
  );
}
