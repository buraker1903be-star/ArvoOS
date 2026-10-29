"use client";

import { useCallback, useEffect, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { kullanimSozlesmesi, SOZLESME_SURUMU } from "@/lib/sozlesme/kullanim-sozlesmesi";
import { sozlesmeyiOnayla } from "./sozlesme-actions";
import "./sozlesme-onayi.css";

/*
  KULLANIM SÖZLEŞMESİ ONAY PENCERESİ (29.10.2026; ArvoLab'daki pencerenin
  ArvoOS karşılığı).

  Kapatılamaz: Esc, arka plana tıklama ya da kapatma düğmesi yok. İki çıkış
  var: sonuna kadar okuyup onaylamak ya da onaylamayıp oturumu kapatmak.
  "Okudum ve onaylıyorum" düğmesi metnin SONUNA kaydırılmadan etkinleşmez
  (kısa ekranda metin baştan sığarsa hemen etkin). Kaydırmanın tamamlandığı
  bilgisi sunucuya gider ve kayda yazılır; IP, konum, cihaz ve zaman
  sunucuda okunur (sozlesme-actions.ts).

  Arka plandaki panel bu pencere açıkken etkisizdir (layout'ta inert) ve
  dock ile komut paleti çizilmez: pencerenin üstüne açılıp odağı çalmasınlar.
*/
export function SozlesmeOnayi({ cikis }: { cikis: () => Promise<void> }) {
  const router = useRouter();
  const metin = kullanimSozlesmesi();
  const baslikId = useId();
  const kutu = useRef<HTMLDivElement>(null);
  const [okundu, setOkundu] = useState(false);
  const [ilerleme, setIlerleme] = useState(0);
  const [hata, setHata] = useState<string | null>(null);
  const [bekliyor, basla] = useTransition();

  const olc = useCallback(() => {
    const k = kutu.current;
    if (!k) return;
    const kalan = k.scrollHeight - k.clientHeight - k.scrollTop;
    const oran = k.scrollHeight <= k.clientHeight ? 1 : k.scrollTop / (k.scrollHeight - k.clientHeight);
    setIlerleme(Math.min(100, Math.round(oran * 100)));
    // Bir kez sona ulaşan kullanıcı geri kaydırsa da okumuş sayılır.
    if (kalan <= 8) setOkundu(true);
  }, []);

  useEffect(() => {
    olc();
    kutu.current?.focus();
    // Pencere boyutu değişince (telefon döndürme) metin sığabilir.
    window.addEventListener("resize", olc);
    return () => window.removeEventListener("resize", olc);
  }, [olc]);

  const onayla = () => {
    setHata(null);
    basla(async () => {
      const sonuc = await sozlesmeyiOnayla({ kaydirmaTamamlandi: okundu });
      if ("hata" in sonuc) setHata(sonuc.hata);
      else router.refresh();
    });
  };

  return (
    <div className="so-kok">
      <div className="so-arka" aria-hidden="true" />
      <section className="so-pencere" role="dialog" aria-modal="true" aria-labelledby={baslikId}>
        <header className="so-baslik">
          <div>
            <h2 id={baslikId}>{metin.baslik}</h2>
            <p>ArvoOS&apos;u kullanmaya devam etmek için sözleşmeyi sonuna kadar okuyup onaylayın.</p>
          </div>
        </header>

        <div ref={kutu} className="so-metin" tabIndex={0} onScroll={olc} aria-label="Sözleşme metni">
          <p className="so-giris">{metin.giris}</p>
          {metin.bolumler.map((b) => (
            <section key={b.baslik}>
              <h3>{b.baslik}</h3>
              {b.paragraflar.map((p) => <p key={p.slice(0, 48)}>{p}</p>)}
            </section>
          ))}
          <p className="so-son">Sözleşmenin sonu · Sürüm {SOZLESME_SURUMU}</p>
        </div>

        <div className="so-ilerleme" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={okundu ? 100 : ilerleme} aria-label="Okuma ilerlemesi">
          <span data-deger={okundu ? 100 : Math.round(ilerleme / 10) * 10} />
        </div>

        <footer className="so-alt">
          <p className="so-not" aria-live="polite">
            {okundu
              ? "Onay; tarih-saat, IP adresi, IP'den belirlenen yaklaşık konum ve cihaz bilgisiyle kaydedilir ve bir kopyası e-postanıza gönderilir."
              : "Onaylamak için metni sonuna kadar kaydırın."}
          </p>
          {hata ? <p className="so-hata" role="alert">{hata}</p> : null}
          <div className="so-dugmeler">
            <form action={cikis}>
              <button type="submit" className="panel-secondary" disabled={bekliyor}>Onaylamıyorum, çıkış yap</button>
            </form>
            <button type="button" className="panel-primary" disabled={!okundu || bekliyor} onClick={onayla} aria-disabled={!okundu || bekliyor}>
              {bekliyor ? "Kaydediliyor…" : "Okudum ve onaylıyorum"}
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
