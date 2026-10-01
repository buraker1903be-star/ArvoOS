"use client";

import { useEffect, useRef, type FormEvent, type KeyboardEvent } from "react";
import { useFormStatus } from "react-dom";
import { replyCustomerFileMessage } from "../actions";

export type SohbetMesaji = {
  id: string;
  sender_type: "customer" | "staff";
  sender_name: string;
  body: string;
  created_at: string;
  read_at: string | null;
};

const TZ = "Europe/Istanbul";
const saat = new Intl.DateTimeFormat("tr-TR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
const gunUzun = new Intl.DateTimeFormat("tr-TR", { timeZone: TZ, day: "numeric", month: "long", year: "numeric" });
const gunAnahtar = new Intl.DateTimeFormat("en-CA", { timeZone: TZ });

/** "Bugün" / "Dün" / "12 Ekim 2026" — uzun yazışmada tarih ayracı. */
function gunEtiketi(tarih: Date, bugun: string, dun: string) {
  const anahtar = gunAnahtar.format(tarih);
  if (anahtar === bugun) return "Bugün";
  if (anahtar === dun) return "Dün";
  return gunUzun.format(tarih);
}

/** "2026-10-01" → "2026-09-30". Saf: Date.now() okumuyor. */
function oncekiGun_(gun: string) {
  const d = new Date(`${gun}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

const basHarfler = (ad: string) =>
  ad.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toLocaleUpperCase("tr-TR")).join("") || "?";

function GonderDugmesi() {
  const { pending } = useFormStatus();
  return (
    <button className="panel-primary" type="submit" disabled={pending}>
      {pending ? "Gönderiliyor…" : "Yanıtı gönder"}
    </button>
  );
}

/*
  MÜŞTERİ SOHBETİ.

  Önce basit bir baloncuk listesiydi ve uzun yazışmada dağılıyordu:
  pencere kendi başına kayarken listenin de kendi kaydırıcısı vardı (iç
  içe iki çubuk), açılışta en ESKİ mesaj görünüyordu, aynı kişinin arka
  arkaya üç mesajı üç kez ad ve saat basıyordu, günler ayrışmıyordu ve
  "nereye kadar okumuştum" sorusunun yanıtı yoktu.

  Burada çözülenler:
    * Tek kaydırıcı: pencere gövdesi sabit, yalnızca liste kayıyor,
      yazma alanı altta sabit duruyor.
    * Açılışta en YENİ mesaja iniyor (okunmamış varsa ona).
    * Gün ayraçları (Bugün · Dün · tarih) ve okunmamışların önüne
      "Yeni mesajlar" çizgisi.
    * Aynı kişinin ardışık mesajları tek blok: ad bir kez, saat her
      baloncukta küçük.
    * ⌘/Ctrl+Enter ile gönder; metin alanı içerikle büyüyor.
*/
export function MusteriSohbeti({
  workflowId, messages, customerName, canReply, bugun,
}: {
  workflowId: string;
  messages: SohbetMesaji[];
  customerName: string;
  canReply: boolean;
  /*
    İstanbul günü SUNUCUDAN geliyor (YYYY-MM-DD). Date.now() render
    içinde okunamaz (react-hooks/purity) ve okunsaydı sunucuyla
    istemcinin "bugün"ü ayrı olabilirdi: gece yarısına yakın saatlerde
    ayraç sunucuda "Dün", tarayıcıda "Bugün" basılır, hidrasyon kayardı.
  */
  bugun: string;
}) {
  const listeRef = useRef<HTMLDivElement>(null);
  const yeniRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const alanRef = useRef<HTMLTextAreaElement>(null);

  // Açılışta en yeniye (okunmamış varsa ilk okunmamışa) in.
  useEffect(() => {
    const hedef = yeniRef.current;
    const liste = listeRef.current;
    if (!liste) return;
    if (hedef) hedef.scrollIntoView({ block: "center" });
    else liste.scrollTop = liste.scrollHeight;
  }, []);

  const buyut = () => {
    const alan = alanRef.current;
    if (!alan) return;
    alan.style.height = "auto";
    alan.style.height = `${Math.min(alan.scrollHeight, 160)}px`;
  };

  const tusla = (olay: KeyboardEvent<HTMLTextAreaElement>) => {
    if (olay.key === "Enter" && (olay.metaKey || olay.ctrlKey)) {
      olay.preventDefault();
      formRef.current?.requestSubmit();
    }
  };

  const gonderildi = (olay: FormEvent<HTMLFormElement>) => {
    // React 19 eylemden sonra formu sıfırlıyor; yükseklik elle geri alınır.
    void olay;
    requestAnimationFrame(() => {
      if (alanRef.current) alanRef.current.style.height = "auto";
      const liste = listeRef.current;
      if (liste) liste.scrollTop = liste.scrollHeight;
    });
  };

  const dun = oncekiGun_(bugun);
  const ilkOkunmamis = messages.find((m) => m.sender_type === "customer" && !m.read_at)?.id ?? null;

  let oncekiGun = "";
  let oncekiGonderen = "";

  return (
    <div className="opd-sohbet">
      <div className="opd-sohbet-liste" ref={listeRef} role="log" aria-label="Müşteri yazışması">
        {messages.length ? messages.map((mesaj) => {
          const tarih = new Date(mesaj.created_at);
          const gun = gunAnahtar.format(tarih);
          const gunDegisti = gun !== oncekiGun;
          const musteri = mesaj.sender_type === "customer";
          const gonderen = musteri ? "customer" : mesaj.sender_name;
          /* Gün değişince blok da kırılır: ayracın altında ad yeniden yazılsın. */
          const blokBasi = gunDegisti || gonderen !== oncekiGonderen;
          const yeniBurada = mesaj.id === ilkOkunmamis;
          oncekiGun = gun;
          oncekiGonderen = gonderen;
          const ad = musteri ? customerName : mesaj.sender_name;
          return (
            <div key={mesaj.id}>
              {gunDegisti ? <div className="opd-sohbet-gun"><span>{gunEtiketi(tarih, bugun, dun)}</span></div> : null}
              {yeniBurada ? <div className="opd-sohbet-yeni" ref={yeniRef}><span>Yeni mesajlar</span></div> : null}
              <div className={`opd-sohbet-satir${musteri ? "" : " is-staff"}${blokBasi ? " is-bas" : ""}`}>
                <i className="opd-sohbet-avatar" aria-hidden="true">{blokBasi ? basHarfler(ad) : ""}</i>
                <div className="opd-sohbet-govde">
                  {blokBasi ? <b>{ad}</b> : null}
                  <p>{mesaj.body}<time dateTime={mesaj.created_at}>{saat.format(tarih)}</time></p>
                </div>
              </div>
            </div>
          );
        }) : (
          <p className="opd-sohbet-bos">
            <b>Henüz mesaj yok</b>
            <span>Takip kodunu paylaştığınızda müşteri buradan yazabilir; yanıtlarınız aynı ekranda görünür.</span>
          </p>
        )}
      </div>

      {canReply ? (
        <form className="opd-sohbet-yaz" action={replyCustomerFileMessage} onSubmit={gonderildi} ref={formRef}>
          <input type="hidden" name="workflow_id" value={workflowId} />
          <textarea
            ref={alanRef} name="body" required minLength={2} maxLength={2000} rows={1}
            placeholder="Müşteriye yanıt yazın…" aria-label="Müşteriye yanıt"
            onInput={buyut} onKeyDown={tusla}
          />
          <div>
            <small>Yanıt müşterinin takip ekranında görünür · ⌘/Ctrl + Enter ile gönder</small>
            <GonderDugmesi />
          </div>
        </form>
      ) : (
        <p className="opd-sohbet-kapali">Bu iş bir sözleşmeye bağlı olmadığı için müşteri mesajlaşması kapalı.</p>
      )}
    </div>
  );
}
