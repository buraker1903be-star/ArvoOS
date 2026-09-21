"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { InboxMessage, KayitliHazirMesaj } from "@/lib/whatsapp-inbox";
import { hazirMesajiDoldur, type HazirMesaj } from "@/lib/whatsapp-hazir-mesaj";
import { dosyaGonder, hazirMesajEkle, hazirMesajSil, replyWhatsapp, sohbetiGetir, sohbetiOkunduIsaretle } from "../../settings/whatsapp/actions";

/*
  Sohbet akışı, yazma kutusu ve hazır mesajlar.

  Sayfa sunucuda bir kez çiziliyordu: müşteri yazdığında ekranda hiçbir şey
  olmuyor, kullanıcı sayfayı yenilemedikçe mesajı görmüyordu. Mesajlaşma
  ekranında bu kabul edilemez, o yüzden bu parça istemcide çalışıyor.

  Dört davranış gerçek bir mesajlaşma ekranını taklit ediyor:

  1. SEKME GÖRÜNÜRKEN tazeleme. Arka plandaki sekme için istek atmak, açık
     duran onlarca panelden boşuna trafik demek.
  2. Enter gönderir, Shift+Enter satır atlar. Mesajlaşmada beklenen budur;
     düğmeye uzanmak akışı kesiyordu.
  3. Yeni mesaj gelince en alta kayar — ama kullanıcı yukarı kaydırmışsa
     KAYDIRMAZ. Geçmişi okuyan birini aşağı fırlatmak, okuduğu yeri
     kaybettirir.
  4. Hazır mesaj kutuya YAZILIR, doğrudan gönderilmez. Yanlış sohbete
     giden hazır bir metni geri almanın yolu yok; gönderen kişi son bir
     kez görsün.
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

/** Yer tutucu metni ("[görsel]") gerçek bir mesaj değil; altyazı varsa odur. */
function mesajMetni(mesaj: InboxMessage): string {
  const govde = (mesaj.body ?? "").trim();
  if (!mesaj.media) return govde;
  return /^\[[^\]]+\]$/.test(govde) ? "" : govde;
}

const boyutYaz = (bayt: number | null) =>
  !bayt ? "" : bayt < 1024 * 1024 ? `${Math.round(bayt / 1024)} KB` : `${(bayt / 1024 / 1024).toFixed(1)} MB`;

/**
 * Balondaki görsel/dosya.
 *
 * Dosya doğrudan kovadan değil kendi rotamızdan geliyor: kova özel ve
 * yetki tek yerde (app/panel/crm/whatsapp/dosya/[id]) doğrulanıyor.
 *
 * Görsel <img> ile gösteriliyor, diğer her şey indirme satırı. Videoyu da
 * satır yapıyoruz: otomatik yüklenen bir video, elli mesajlık bir akışta
 * sayfayı ve bağlantıyı gereksiz yere harcıyor.
 */
function MesajMedyasi({ mesaj }: { mesaj: InboxMessage }) {
  const medya = mesaj.media!;
  const adres = `/panel/crm/whatsapp/dosya/${mesaj.id}`;
  const ad = medya.filename ?? "dosya";

  if (medya.status === "failed") {
    return (
      <span className="wa-dosya" data-durum="failed">
        <span aria-hidden="true">⚠</span>
        <span>{medya.error ?? "Dosya indirilemedi."}</span>
      </span>
    );
  }

  const gorsel = (medya.mime ?? "").startsWith("image/");
  if (gorsel) {
    return (
      /* Düz <img>: kaynak kısa ömürlü imzalı bir yönlendirme, next/image
         onu önbelleğe alıp bağlantı öldükten sonra 404'e düşüyor. */
      <a className="wa-gorsel" href={adres} target="_blank" rel="noreferrer">
        <img src={adres} alt={ad} loading="lazy" />
      </a>
    );
  }

  return (
    <a className="wa-dosya" href={adres} target="_blank" rel="noreferrer">
      <span className="wa-dosya-simge" aria-hidden="true">📎</span>
      <span className="wa-dosya-ad">
        <b>{ad}</b>
        <small>{medya.status === "pending" ? "indirilecek" : boyutYaz(medya.size)}</small>
      </span>
    </a>
  );
}

export default function Sohbet({
  telefon,
  ilkMesajlar,
  ilkPencere,
  kendiNumarasi,
  hazirKendi,
  hazirOnerilen,
  musteriAdi,
}: {
  telefon: string;
  ilkMesajlar: InboxMessage[];
  ilkPencere: boolean;
  /** Yanıt kurumun kendi numarasından mı gidiyor; kutunun altında yazılır. */
  kendiNumarasi: boolean;
  hazirKendi: KayitliHazirMesaj[];
  hazirOnerilen: HazirMesaj[];
  /** {ad} yer tutucusunu doldurmak için; CRM kaydı ya da profil adı. */
  musteriAdi: string | null;
}) {
  const [mesajlar, setMesajlar] = useState(ilkMesajlar);
  const [pencereAcik, setPencereAcik] = useState(ilkPencere);
  const [metin, setMetin] = useState("");
  const [hata, setHata] = useState<string | null>(null);
  const [hazirAcik, setHazirAcik] = useState(false);
  const [ekleAcik, setEkleAcik] = useState(false);
  const [gonderiliyor, basla] = useTransition();
  const akisRef = useRef<HTMLDivElement>(null);
  const kutuRef = useRef<HTMLTextAreaElement>(null);
  const dosyaRef = useRef<HTMLInputElement>(null);
  const hazirRef = useRef<HTMLDivElement>(null);
  /* Kullanıcı yukarı kaydırdıysa otomatik kaydırma yapılmaz. */
  const altaYapisik = useRef(true);

  /*
    Sohbet değişince durumun sıfırlanmasını sayfa `key={telefon}` ile
    sağlıyor: bileşen baştan kuruluyor. Eskiden burada bir etki durumu elle
    sıfırlıyordu; hem fazladan bir çizim turu demekti hem de yeni eklenen
    her durumu oraya da yazmayı unutmak kolaydı.
  */

  /*
    Okundu damgasının en son yazıldığı gelen mesajın zamanı.

    Her tazelemede damga yazmak, açık duran her sekme için 10 saniyede bir
    boşuna yazma demekti. Damga yalnızca DAHA YENİ bir gelen mesaj
    göründüğünde yazılıyor.
  */
  const okunanaKadar = useRef<number>(0);

  const okunduYaz = useCallback(
    (gelenler: InboxMessage[]) => {
      const sonGelen = [...gelenler].reverse().find((m) => m.direction === "inbound");
      const zaman = sonGelen ? Date.parse(sonGelen.createdAt) : 0;
      if (!zaman || zaman <= okunanaKadar.current) return;
      okunanaKadar.current = zaman;
      void sohbetiOkunduIsaretle(telefon);
    },
    [telefon],
  );

  const tazele = useCallback(async () => {
    try {
      const sonuc = await sohbetiGetir(telefon);
      setMesajlar(sonuc.messages);
      setPencereAcik(sonuc.windowOpen);
      okunduYaz(sonuc.messages);
    } catch {
      // Geçici ağ hatası ekranı bozmamalı; bir sonraki turda yeniden denenir.
    }
  }, [telefon, okunduYaz]);

  // Sohbet açıldığı anda okundu sayılır; ekrandaki mesajlar görülmüş demektir.
  useEffect(() => {
    okunduYaz(ilkMesajlar);
  }, [ilkMesajlar, okunduYaz]);

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

  // Hazır mesaj kutusu: Escape ve dışarı tıklama kapatır.
  useEffect(() => {
    if (!hazirAcik) return;
    const tus = (olay: KeyboardEvent) => { if (olay.key === "Escape") setHazirAcik(false); };
    const tikla = (olay: PointerEvent) => {
      if (!hazirRef.current?.contains(olay.target as Node)) setHazirAcik(false);
    };
    document.addEventListener("keydown", tus);
    document.addEventListener("pointerdown", tikla);
    return () => {
      document.removeEventListener("keydown", tus);
      document.removeEventListener("pointerdown", tikla);
    };
  }, [hazirAcik]);

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

  /*
    Dosya seçilir seçilmez gidiyor, önizleme adımı yok.

    Bilinçli: metin kutusundaki yazı varsa altyazı olarak gidiyor, yani
    "dosya + açıklama" tek hamlede tamamlanıyor. Araya bir önizleme ekranı
    koymak, WhatsApp'ta olmayan bir adım eklerdi.
  */
  const dosyaSecildi = (olay: React.ChangeEvent<HTMLInputElement>) => {
    const dosya = olay.target.files?.[0];
    // Aynı dosya tekrar seçilebilsin diye girdi hemen sıfırlanıyor.
    olay.target.value = "";
    if (!dosya) return;

    setHata(null);
    const altYazi = metin.trim();
    basla(async () => {
      const veri = new FormData();
      veri.set("phone", telefon);
      veri.set("file", dosya);
      if (altYazi) veri.set("text", altYazi);
      try {
        await dosyaGonder(veri);
        setMetin("");
      } catch (sorun) {
        setHata(sorun instanceof Error ? sorun.message : "Dosya gönderilemedi.");
      }
      await tazele();
    });
  };

  /* Hazır mesaj kutuya yazılır, gönderilmez: son bakış gönderene kalsın. */
  const hazirSec = (govde: string) => {
    setMetin(hazirMesajiDoldur(govde, musteriAdi));
    setHazirAcik(false);
    kutuRef.current?.focus();
  };

  const hazirSilVeKapat = (id: string) => {
    basla(async () => {
      try {
        await hazirMesajSil(id);
      } catch (sorun) {
        setHata(sorun instanceof Error ? sorun.message : "Hazır mesaj silinemedi.");
      }
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
                {mesaj.media ? <MesajMedyasi mesaj={mesaj} /> : null}
                {/* Görselin altyazısı yoksa yer tutucu metni ("[görsel]")
                    tekrar yazmıyoruz: resmin altında "[görsel]" yazması
                    hiçbir şey anlatmıyor. */}
                {mesaj.media
                  ? mesajMetni(mesaj) || null
                  : mesaj.body ?? (mesaj.template ? `[şablon: ${mesaj.template}]` : "—")}
                {/* Hata kendi satırında: saatin yanına sıkıştırıldığında
                    Meta'nın uzun açıklaması balonu geriyor ve saati iki
                    satıra bölüyordu. */}
                {mesaj.error ? <span className="wa-msg-hata">{mesaj.error}</span> : null}
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
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {pencereAcik ? (
        <div className="wa-reply">
          {hazirAcik ? (
            <div className="wa-hazir" ref={hazirRef} role="dialog" aria-label="Hazır mesajlar">
              <div className="wa-hazir-baslik">
                <b>Hazır mesajlar</b>
                <button type="button" className="wa-hazir-kapat" onClick={() => setEkleAcik((a) => !a)}>
                  {ekleAcik ? "Vazgeç" : "Yeni ekle"}
                </button>
              </div>

              {hazirKendi.length ? <p className="wa-hazir-grup">Kurumunuzun metinleri</p> : null}
              {hazirKendi.map((mesaj) => (
                <div key={mesaj.id} className="wa-hazir-satir">
                  <button type="button" className="wa-hazir-secim" onClick={() => hazirSec(mesaj.body)}>
                    <b>{mesaj.title}</b>
                    <small>{hazirMesajiDoldur(mesaj.body, musteriAdi)}</small>
                  </button>
                  <button
                    type="button"
                    className="wa-hazir-sil"
                    onClick={() => hazirSilVeKapat(mesaj.id)}
                    title={`${mesaj.title} hazır mesajını sil`}
                  >
                    Sil
                  </button>
                </div>
              ))}

              {hazirOnerilen.length ? <p className="wa-hazir-grup">Öneriler</p> : null}
              {hazirOnerilen.map((mesaj) => (
                <div key={mesaj.title} className="wa-hazir-satir">
                  <button type="button" className="wa-hazir-secim" onClick={() => hazirSec(mesaj.body)}>
                    <b>{mesaj.title}</b>
                    <small>{hazirMesajiDoldur(mesaj.body, musteriAdi)}</small>
                  </button>
                </div>
              ))}

              {ekleAcik ? (
                /* Kaydetme sunucu eylemiyle; kaydedilen metin sayfa
                   tazelendiğinde "kurumunuzun metinleri" altına geçer. */
                <form className="wa-hazir-ekle" action={hazirMesajEkle}>
                  <input name="title" maxLength={60} placeholder="Başlık (ör. Fiyat listesi)" required />
                  <textarea name="body" rows={3} maxLength={1024} placeholder="Merhaba {ad}, ..." required />
                  <div className="wa-hazir-ekle-alt">
                    <p className="wa-hazir-ipucu">{"{ad}"} müşterinin adıyla değişir.</p>
                    <button className="panel-primary" type="submit">Kaydet</button>
                  </div>
                </form>
              ) : null}
            </div>
          ) : null}

          <div className="wa-yazma">
            <input
              ref={dosyaRef}
              type="file"
              className="wa-gizli"
              onChange={dosyaSecildi}
              accept="image/jpeg,image/png,image/webp,video/mp4,audio/mpeg,audio/mp4,audio/ogg,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv"
            />
            <button
              type="button"
              className="wa-arac"
              onClick={() => dosyaRef.current?.click()}
              disabled={gonderiliyor}
              title="Görsel ya da dosya gönder"
              aria-label="Görsel ya da dosya gönder"
            >
              📎
            </button>

            <button
              type="button"
              className="wa-arac"
              onClick={() => setHazirAcik((a) => !a)}
              aria-expanded={hazirAcik}
              title="Hazır mesajlar"
              aria-label="Hazır mesajlar"
            >
              ⚡
            </button>

            <textarea
              ref={kutuRef}
              rows={1}
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
              placeholder="Mesaj yazın… (Enter gönderir, Shift+Enter satır atlar)"
              aria-label="Yanıt"
              disabled={gonderiliyor}
            />

            <button
              className="wa-gonder"
              type="button"
              onClick={gonder}
              disabled={gonderiliyor || !metin.trim()}
              title="Gönder"
              aria-label="Gönder"
            >
              {gonderiliyor ? "…" : "➤"}
            </button>
          </div>

          <p className="wa-note">
            Yanıt {kendiNumarasi ? "kendi numaranızdan" : "Arvo’nun ortak numarasından"} gider.
            {hata ? <b className="wa-hata"> {hata}</b> : null}
          </p>
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
