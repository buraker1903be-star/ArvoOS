import Link from "next/link";
import type { Otomasyon } from "@/lib/konsol/otomasyonlar";
import { istanbulDateTime, todayInIstanbul } from "@/lib/istanbul-date";
import "./konsol-ana-kartlar.css";

/*
  ANA SAYFA'NIN İKİ ÜST KARTI (26.11.2026, onaylı mockup).

  Ekran yöneticinin üç sorusuna sırayla cevap veriyor:
    1. Bugün hangi iş BENİM kararımı bekliyor → Karar bekleyenler
    2. Sistem arka planda neyi bitirdi, neye dokunmam gerek → Otomasyonlar
    3. Ürünler ve tahsilat nasıl → Ürün performansı (konsol-urun-performansi)

  Kartlar yalnızca ÇİZİYOR: kuyruk, yetki ve onay akışları değişmedi,
  satırlar kendi ekranlarına açılıyor.
*/

export type KararKalemi = {
  anahtar: string;
  /** Ürün etiketi (ArvoLab, ArvoCal…); ürüne bağlı olmayan işte yok. */
  urun?: string;
  baslik: string;
  /** Kayıt no · kurum · tutar / süre — ikincil satır. */
  alt?: string;
  /** Kaydın zamanı (ISO); "Bugün, 09:15" diye yazılıyor. */
  zaman?: string | null;
  href: string;
  eylem?: string;
};

/*
  ZAMAN KISA YAZILIR: bugünse saat, dünse "Dün, 16:40", öncesinde tarih.
  Saat İSTANBUL'a göre (lib/istanbul-date): sunucu UTC'de koşuyor ve
  dilimsiz biçimlendirme gece 00:00–03:00 arasında bir önceki günü
  yazıyordu.
*/
function kisaZaman(ham: string | null | undefined): string | null {
  if (!ham) return null;
  const gun = ham.slice(0, 10);
  const saat = istanbulDateTime(ham, { hour: "2-digit", minute: "2-digit" });
  const bugun = todayInIstanbul();
  if (gun === bugun) return `Bugün, ${saat}`;
  const dun = new Date(`${bugun}T12:00:00Z`);
  dun.setUTCDate(dun.getUTCDate() - 1);
  if (gun === dun.toISOString().slice(0, 10)) return `Dün, ${saat}`;
  return istanbulDateTime(ham, { day: "2-digit", month: "short" });
}

export function KararBekleyenlerKarti({ kalemler, okunamayan }: {
  kalemler: KararKalemi[];
  /** Okunamayan kaynaklar: "iş yok" ile "bilmiyoruz" aynı şey değil. */
  okunamayan: string[];
}) {
  return (
    <article className="kak-kart" aria-labelledby="kak-karar-baslik">
      <header className="kak-bas">
        <h2 id="kak-karar-baslik">Karar bekleyenler</h2>
      </header>
      {kalemler.length ? (
        <ul className="kak-liste">
          {kalemler.map((k) => (
            <li key={k.anahtar}>
              <Link className="kak-satir" href={k.href}>
                {k.urun ? <span className="kak-urun">{k.urun}</span> : <span className="kak-urun kak-urun-bos" aria-hidden="true" />}
                <span className="kak-govde">
                  <b>{k.baslik}</b>
                  {k.alt ? <small>{k.alt}</small> : null}
                </span>
                {kisaZaman(k.zaman) ? <time className="kak-zaman">{kisaZaman(k.zaman)}</time> : null}
                <span className="kak-eylem">{k.eylem ?? "İncele"}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="kak-bos">Karar bekleyen iş yok.</p>
      )}
      {okunamayan.length ? (
        <p className="kak-bos" data-tone="danger">
          {okunamayan.join(", ")} okunamadı; bu kalemler listede eksik olabilir.
        </p>
      ) : null}
    </article>
  );
}

export function OtomasyonlarKarti({ isler, href }: { isler: Otomasyon[]; href: string }) {
  return (
    <article className="kak-kart" aria-labelledby="kak-otomasyon-baslik">
      <header className="kak-bas">
        <h2 id="kak-otomasyon-baslik">Otomasyonlar</h2>
      </header>
      <ul className="kak-liste kak-otomasyon">
        {isler.map((is) => (
          <li key={is.anahtar}>
            <span className="kak-satir kak-satir-duz">
              <span className="kak-ikon" data-tone={is.ton} aria-hidden="true">
                <OtomasyonIkonu durum={is.durum} />
              </span>
              <span className="kak-govde">
                <b>{is.ad}</b>
                <small>{is.detay}</small>
              </span>
              <span className="kak-rozet" data-tone={is.ton}>{is.etiket}</span>
            </span>
          </li>
        ))}
      </ul>
      <Link className="kak-alt-bag" href={href}>İşlem geçmişi →</Link>
    </article>
  );
}

/* Durum rengi tek başına bilgi taşımasın: her durumun kendi şekli var. */
function OtomasyonIkonu({ durum }: { durum: Otomasyon["durum"] }) {
  if (durum === "yeniden") {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        <path d="M20 11a8 8 0 1 0-1.6 5.6" /><path d="M20 5v6h-6" />
      </svg>
    );
  }
  if (durum === "mudahale") {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        <path d="M12 8v5" /><path d="M12 16.5h.01" /><circle cx="12" cy="12" r="9" />
      </svg>
    );
  }
  if (durum === "bagli_degil" || durum === "kayit_yok") {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        <circle cx="12" cy="12" r="9" /><path d="M8.5 12h7" />
      </svg>
    );
  }
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" /><path d="m8.5 12.5 2.5 2.5 4.5-5" />
    </svg>
  );
}
