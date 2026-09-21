"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import type { InboxConversation } from "@/lib/whatsapp-inbox";
import { basHarfler, numaraYaz, renkTonu } from "@/lib/whatsapp-kisi-gorunumu";
import { sohbetiArsivle } from "../../settings/whatsapp/actions";

/*
  Sohbet listesi: arama, arşiv ve "yanıt bekliyor" işareti.

  Liste sunucuda çizilip öylece duruyordu. Birkaç sohbetle sorun değil ama
  yüz sohbette aranan kişiyi bulmak kaydırmayla oluyordu; mesajlaşma
  ekranında aramanın olmaması en çok eksikliği hissedilen şeydi.

  Arşiv ayrı bir liste, karışık değil: amacı kapanmış yazışmayı günlük
  listeden çıkarmak. Silme yok — kayıt hem kanıt hem CRM geçmişi.

  "Yanıt bekliyor" işareti okunmamışlık DEĞİL — öyle bir kaydımız yok ve
  uydurmak yanlış olurdu. Son mesajın müşteriden gelmiş olmasını
  gösteriyor; satışçının bakması gereken sohbet zaten budur.
*/

const saat = (value: string) => {
  const tarih = new Date(value);
  const bugun = new Date().toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul" });
  const gun = tarih.toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul" });
  // Bugünkü sohbette saat, eskilerde tarih: WhatsApp da böyle yapıyor ve
  // listede en çok sorulan "bugün mü yazdı" sorusunu tek bakışta yanıtlıyor.
  return gun === bugun
    ? tarih.toLocaleTimeString("tr-TR", { timeZone: "Europe/Istanbul", hour: "2-digit", minute: "2-digit" })
    : tarih.toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul", day: "numeric", month: "short" });
};

/** Türkçe duyarsız arama: "İş" ile "is" eşleşsin. */
const sadelestir = (value: string) =>
  value
    .replace(/İ/g, "i").replace(/I/g, "ı")
    .toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i").replace(/ş/g, "s").replace(/ğ/g, "g")
    .replace(/ü/g, "u").replace(/ö/g, "o").replace(/ç/g, "c");

export default function SohbetListesi({
  sohbetler,
  seciliNumara,
  arsivGorunumu,
  arsivSayisi,
}: {
  sohbetler: InboxConversation[];
  seciliNumara: string | null;
  /** Arşiv sekmesi mi açık; düğmenin yönünü ve boş metni belirler. */
  arsivGorunumu: boolean;
  arsivSayisi: number;
}) {
  const [arama, setArama] = useState("");
  const [islenen, setIslenen] = useState<string | null>(null);
  const [, basla] = useTransition();

  const gorunen = useMemo(() => {
    const anahtar = sadelestir(arama.trim());
    if (!anahtar) return sohbetler;
    // Rakam girildiyse numarada, harf girildiyse adda ve son mesajda aranır.
    const rakamlar = anahtar.replace(/\D/g, "");
    return sohbetler.filter((sohbet) => {
      if (rakamlar.length >= 3 && sohbet.phone.includes(rakamlar)) return true;
      return sadelestir(`${sohbet.name ?? ""} ${sohbet.lastBody ?? ""}`).includes(anahtar);
    });
  }, [sohbetler, arama]);

  const arsivleDegistir = (telefon: string) => {
    setIslenen(telefon);
    basla(async () => {
      try {
        await sohbetiArsivle(telefon, !arsivGorunumu);
      } finally {
        // Başarısızlıkta da bırakılmalı: yoksa düğme sonsuza dek kilitli kalır.
        setIslenen(null);
      }
    });
  };

  return (
    <nav className="wa-list" aria-label="Sohbetler">
      <div className="wa-list-head">
        <div className="wa-sekme">
          <Link href="/panel/crm/whatsapp" data-aktif={!arsivGorunumu}>Sohbetler</Link>
          {/* Arşiv boşken sekmeyi de göstermiyoruz: hiç kullanılmamış bir
              özelliğin sekmesi her gün yer kaplardı. */}
          {arsivSayisi || arsivGorunumu ? (
            <Link href="/panel/crm/whatsapp?arsiv=1" data-aktif={arsivGorunumu}>Arşiv ({arsivSayisi})</Link>
          ) : null}
        </div>

        <input
          className="wa-ara"
          type="search"
          value={arama}
          onChange={(olay) => setArama(olay.target.value)}
          placeholder="Ad, numara ya da mesajda ara"
          aria-label="Sohbetlerde ara"
        />
      </div>

      <div className="wa-satirlar">
        {!gorunen.length ? (
          <p className="wa-note wa-list-bos">
            {arama.trim()
              ? "Aramanıza uyan sohbet yok."
              : arsivGorunumu
                ? "Arşivde sohbet yok. Arşivlediğiniz yazışmalar burada durur; müşteri yeniden yazarsa kendiliğinden listeye döner."
                : "Sohbet yok."}
          </p>
        ) : (
          gorunen.map((sohbet) => {
            const ad = sohbet.name ?? numaraYaz(sohbet.phone);
            return (
              <div key={sohbet.phone} className="wa-satir" data-secili={seciliNumara === sohbet.phone}>
                <Link className="wa-satir-ana" href={`/panel/crm/whatsapp?numara=${sohbet.phone}${arsivGorunumu ? "&arsiv=1" : ""}`}>
                  <span className="wa-avatar" style={{ "--wa-ton": renkTonu(sohbet.phone) } as React.CSSProperties} aria-hidden="true">
                    {basHarfler(sohbet.name, sohbet.phone)}
                  </span>
                  <span className="wa-satir-govde">
                    <span className="wa-list-top">
                      <b>{ad}</b>
                      <time dateTime={sohbet.lastAt}>{saat(sohbet.lastAt)}</time>
                    </span>
                    <span className="wa-satir-alt">
                      <small>
                        {sohbet.lastDirection === "outbound" ? "↗ " : ""}
                        {sohbet.lastBody ?? "—"}
                      </small>
                      {sohbet.lastDirection === "inbound" ? (
                        <span className="wa-bekliyor">
                          <span className="wa-gizli">Yanıt bekliyor</span>
                        </span>
                      ) : null}
                    </span>
                  </span>
                </Link>

                <button
                  type="button"
                  className="wa-arsivle"
                  onClick={() => arsivleDegistir(sohbet.phone)}
                  disabled={islenen === sohbet.phone}
                  title={arsivGorunumu ? `${ad} sohbetini arşivden çıkar` : `${ad} sohbetini arşivle`}
                  aria-label={arsivGorunumu ? `${ad} sohbetini arşivden çıkar` : `${ad} sohbetini arşivle`}
                >
                  {arsivGorunumu ? "↩" : "⌵"}
                </button>
              </div>
            );
          })
        )}
      </div>
    </nav>
  );
}
