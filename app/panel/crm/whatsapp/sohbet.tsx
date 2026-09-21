"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { InboxMessage } from "@/lib/whatsapp-inbox";
import { replyWhatsapp, sohbetiGetir } from "../../settings/whatsapp/actions";

/*
  Sohbet akışı ve yanıt kutusu.

  Sayfa sunucuda bir kez çiziliyordu: müşteri yazdığında ekranda hiçbir şey
  olmuyor, kullanıcı sayfayı yenilemedikçe mesajı görmüyordu. Mesajlaşma
  ekranında bu kabul edilemez, o yüzden bu parça istemcide çalışıyor.

  Üç davranış gerçek bir mesajlaşma ekranını taklit ediyor:

  1. SEKME GÖRÜNÜRKEN tazeleme. Arka plandaki sekme için istek atmak, açık
     duran onlarca panelden boşuna trafik demek.
  2. Enter gönderir, Shift+Enter satır atlar. Mesajlaşmada beklenen budur;
     düğmeye uzanmak akışı kesiyordu.
  3. Yeni mesaj gelince en alta kayar — ama kullanıcı yukarı kaydırmışsa
     KAYDIRMAZ. Geçmişi okuyan birini aşağı fırlatmak, okuduğu yeri
     kaybettirir.
*/

const TAZELEME_MS = 10_000;

const DURUM_ISARETI: Record<string, string> = {
  queued: "🕐", sent: "✓", delivered: "✓✓", read: "✓✓", failed: "!",
};

const DURUM_ADI: Record<string, string> = {
  queued: "sırada", sent: "gönderildi", delivered: "iletildi",
  read: "okundu", failed: "gitmedi", received: "geldi",
};

const saat = (value: string) =>
  new Date(value).toLocaleTimeString("tr-TR", { timeZone: "Europe/Istanbul", hour: "2-digit", minute: "2-digit" });

/** Gün ayıracı: "Bugün", "Dün" ya da tarih. */
function gunEtiketi(value: string) {
  const gun = new Date(value).toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul" });
  const bugun = new Date().toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul" });
  const dun = new Date(Date.now() - 86_400_000).toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul" });
  if (gun === bugun) return "Bugün";
  if (gun === dun) return "Dün";
  return new Date(value).toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul", day: "numeric", month: "long", year: "numeric" });
}

export default function Sohbet({
  telefon,
  ilkMesajlar,
  ilkPencere,
  kendiNumarasi,
}: {
  telefon: string;
  ilkMesajlar: InboxMessage[];
  ilkPencere: boolean;
  /** Yanıt kurumun kendi numarasından mı gidiyor; kutunun altında yazılır. */
  kendiNumarasi: boolean;
}) {
  const [mesajlar, setMesajlar] = useState(ilkMesajlar);
  const [pencereAcik, setPencereAcik] = useState(ilkPencere);
  const [metin, setMetin] = useState("");
  const [hata, setHata] = useState<string | null>(null);
  const [gonderiliyor, basla] = useTransition();
  const akisRef = useRef<HTMLDivElement>(null);
  /* Kullanıcı yukarı kaydırdıysa otomatik kaydırma yapılmaz. */
  const altaYapisik = useRef(true);

  /*
    Sohbet değişince durumun sıfırlanmasını sayfa `key={telefon}` ile
    sağlıyor: bileşen baştan kuruluyor. Eskiden burada bir etki durumu elle
    sıfırlıyordu; hem fazladan bir çizim turu demekti hem de yeni eklenen
    her durumu oraya da yazmayı unutmak kolaydı.
  */

  const tazele = useCallback(async () => {
    try {
      const sonuc = await sohbetiGetir(telefon);
      setMesajlar(sonuc.messages);
      setPencereAcik(sonuc.windowOpen);
    } catch {
      // Geçici ağ hatası ekranı bozmamalı; bir sonraki turda yeniden denenir.
    }
  }, [telefon]);

  useEffect(() => {
    const zamanlayici = window.setInterval(() => {
      if (document.visibilityState === "visible") void tazele();
    }, TAZELEME_MS);
    return () => window.clearInterval(zamanlayici);
  }, [tazele]);

  // Yeni mesaj geldiğinde en alta kay — kullanıcı yukarı kaydırmadıysa.
  useEffect(() => {
    const akis = akisRef.current;
    if (akis && altaYapisik.current) akis.scrollTop = akis.scrollHeight;
  }, [mesajlar]);

  /*
    Gün başlığı ve "önceki mesajla aynı yön" bilgisi çizimden ÖNCE hesaplanıyor.
    Eskiden map içinde bir `oncekiGun` değişkeni güncelleniyordu; React 19
    çizim sırasında değişken güncellemeyi kabul etmiyor (aynı listeyi iki kez
    çizdiğinde ikinci turda gün başlıkları kaybolurdu).
  */
  const satirlar = useMemo(
    () =>
      mesajlar.map((mesaj, sira) => {
        const gun = gunEtiketi(mesaj.createdAt);
        const gunBasligi = sira === 0 || gun !== gunEtiketi(mesajlar[sira - 1].createdAt) ? gun : null;
        return {
          mesaj,
          gunBasligi,
          // Aynı yönden art arda gelen mesajlar birbirine yaklaştırılır.
          oncekiAyniYon: sira > 0 && mesajlar[sira - 1].direction === mesaj.direction && !gunBasligi,
        };
      }),
    [mesajlar],
  );

  const kaydirmaDegisti = () => {
    const akis = akisRef.current;
    if (!akis) return;
    altaYapisik.current = akis.scrollHeight - akis.scrollTop - akis.clientHeight < 80;
  };

  const gonder = () => {
    const govde = metin.trim();
    if (!govde || gonderiliyor) return;
    setHata(null);
    basla(async () => {
      const veri = new FormData();
      veri.set("phone", telefon);
      veri.set("text", govde);
      try {
        await replyWhatsapp(veri);
        setMetin("");
      } catch (sorun) {
        setHata(sorun instanceof Error ? sorun.message : "Mesaj gönderilemedi.");
      }
      // Gönderim sonucu (gitti/gitmedi) ancak kayıttan okunur.
      await tazele();
    });
  };

  return (
    <>
      <div className="wa-flow" ref={akisRef} onScroll={kaydirmaDegisti}>
        {satirlar.map(({ mesaj, gunBasligi, oncekiAyniYon }) => {
          return (
            <div key={mesaj.id} className="wa-grup">
              {gunBasligi ? <div className="wa-gun"><span>{gunBasligi}</span></div> : null}
              <div
                className="wa-msg"
                data-yon={mesaj.direction}
                data-durum={mesaj.status}
                data-bitisik={oncekiAyniYon ? "true" : undefined}
              >
                {mesaj.body ?? (mesaj.template ? `[şablon: ${mesaj.template}]` : "—")}
                <span className="wa-msg-alt">
                  <time dateTime={mesaj.createdAt}>{saat(mesaj.createdAt)}</time>
                  {mesaj.direction === "outbound" ? (
                    /* İşaret görsel, ama tek başına bırakılmıyor: ekran
                       okuyucu ve renk göremeyen için durumun adı da var. */
                    <b title={DURUM_ADI[mesaj.status] ?? mesaj.status} data-durum={mesaj.status}>
                      <span aria-hidden="true">{DURUM_ISARETI[mesaj.status] ?? ""}</span>
                      <span className="wa-durum-adi">{DURUM_ADI[mesaj.status] ?? mesaj.status}</span>
                    </b>
                  ) : null}
                  {mesaj.error ? <span>· {mesaj.error}</span> : null}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {pencereAcik ? (
        <div className="wa-reply">
          <textarea
            value={metin}
            onChange={(olay) => setMetin(olay.target.value)}
            onKeyDown={(olay) => {
              // Enter gönderir, Shift+Enter satır atlar.
              if (olay.key === "Enter" && !olay.shiftKey) {
                olay.preventDefault();
                gonder();
              }
            }}
            maxLength={4096}
            placeholder="Yanıtınızı yazın… (Enter gönderir, Shift+Enter satır atlar)"
            aria-label="Yanıt"
            disabled={gonderiliyor}
          />
          <div className="wa-reply-foot">
            <p className="wa-note">
              Yanıt {kendiNumarasi ? "kendi numaranızdan" : "Arvo’nun ortak numarasından"} gider.
              {hata ? <b className="wa-hata"> {hata}</b> : null}
            </p>
            <button className="panel-primary" type="button" onClick={gonder} disabled={gonderiliyor || !metin.trim()}>
              {gonderiliyor ? "Gönderiliyor…" : "Gönder"}
            </button>
          </div>
        </div>
      ) : (
        <p className="wa-note">
          Müşteri son 24 saat içinde yazmadığı için serbest metin gönderilemiyor (Meta kuralı).
          Müşteri yeniden yazdığında pencere açılır; o zamana kadar yalnızca onaylı şablonlu mesajlar gider.
        </p>
      )}
    </>
  );
}
