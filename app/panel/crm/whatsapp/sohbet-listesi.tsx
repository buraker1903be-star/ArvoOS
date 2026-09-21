"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { InboxConversation } from "@/lib/whatsapp-inbox";

/*
  Sohbet listesi: arama ve "yanıt bekliyor" işareti.

  Liste sunucuda çizilip öylece duruyordu. Birkaç sohbetle sorun değil ama
  yüz sohbette aranan kişiyi bulmak kaydırmayla oluyordu; mesajlaşma
  ekranında aramanın olmaması en çok eksikliği hissedilen şeydi.

  "Yanıt bekliyor" işareti okunmamışlık DEĞİL — öyle bir kaydımız yok ve
  uydurmak yanlış olurdu. Son mesajın müşteriden gelmiş olmasını
  gösteriyor; satışçının bakması gereken sohbet zaten budur.
*/

const numaraYaz = (phone: string) =>
  phone.length === 12 && phone.startsWith("90")
    ? `0${phone.slice(2, 5)} ${phone.slice(5, 8)} ${phone.slice(8, 10)} ${phone.slice(10)}`
    : phone;

const saat = (value: string) =>
  new Date(value).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

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
}: {
  sohbetler: InboxConversation[];
  seciliNumara: string | null;
}) {
  const [arama, setArama] = useState("");

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

  return (
    <nav className="wa-list" aria-label="Sohbetler">
      <input
        className="wa-ara"
        type="search"
        value={arama}
        onChange={(olay) => setArama(olay.target.value)}
        placeholder="Ad, numara ya da mesajda ara"
        aria-label="Sohbetlerde ara"
      />

      {!gorunen.length ? (
        <p className="wa-note wa-list-bos">Aramanıza uyan sohbet yok.</p>
      ) : (
        gorunen.map((sohbet) => (
          <Link
            key={sohbet.phone}
            href={`/panel/crm/whatsapp?numara=${sohbet.phone}`}
            aria-current={seciliNumara === sohbet.phone}
          >
            <span className="wa-list-top">
              <b>{sohbet.name ?? numaraYaz(sohbet.phone)}</b>
              <time dateTime={sohbet.lastAt}>{saat(sohbet.lastAt)}</time>
            </span>
            <small>
              {sohbet.lastDirection === "outbound" ? "↗ " : "↙ "}
              {sohbet.lastBody ?? "—"}
            </small>
            {sohbet.lastDirection === "inbound" ? (
              <span className="wa-bekliyor">Yanıt bekliyor</span>
            ) : null}
          </Link>
        ))
      )}
    </nav>
  );
}
