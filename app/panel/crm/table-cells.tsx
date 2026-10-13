import Link from "next/link";
import "../components/mobil-satir.css";
import { formatPhone } from "@/lib/format-phone";
import { formatPersonName } from "@/lib/format-name";
import { initials } from "@/lib/table-format";
import { relativeTime, type LastContact } from "./last-contact";

// Talepler, Teklifler ve Sözleşmeler tabloları aynı hücreleri kullanır;
// böylece üç tabloda sütunlar aynı sırada ve aynı biçimde görünür:
// No · Müşteri · Hizmet türü · Temsilci · [Tutar] · Durum · Tarih · Son temas.
// Kayıt, ilk hücredeki bağlantıyla açılır; o bağlantı hücresini doldurur.
// Eskiden satırın tamamını kaplayan görünmez bir ::after vardı ama Safari
// <tr>'yi kapsayıcı blok yapmadığı için kaplama kartın tamamına yayılıyor,
// boş bir yere tıklamak alakasız bir kayıt açıyor ve liste hiç kaymıyordu
// (08.10.2026). Gerekçe kayit-detay.css'teki notta.

export function CustomerCell({
  name,
  phone,
  email,
  href,
}: {
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  /** Verilirse müşteri adı bu sayfaya bağlanır (müşteri sayfası). */
  href?: string | null;
}) {
  const display = formatPersonName(name) || "—";
  return (
    <td data-label="Müşteri">
      {href ? (
        <Link className="crm-table-title crm-musteri-link" href={href} title={`${display}: müşteri sayfası`}>{display}</Link>
      ) : (
        <span className="crm-table-title" title={display}>{display}</span>
      )}
      <span className="crm-table-sub">{formatPhone(phone) || email || "İletişim yok"}</span>
    </td>
  );
}

/**
 * Yalnızca hizmet türü. Eskiden "Konu" sütunu başlığı ve altında hizmet
 * türünü yazıyordu; başlık çoğu kayıtta hizmet türünün tekrarıydı ve
 * satırı iki katına çıkarıyordu. Başlık kayıt detayında duruyor.
 */
export function ServiceCell({ service }: { service?: string | null }) {
  const ad = service?.trim();
  return (
    <td data-label="Hizmet türü">
      <span className={ad ? "crm-table-title" : "crm-table-sub"} title={ad || undefined}>{ad || "Belirtilmedi"}</span>
    </td>
  );
}

/** name: null ise atanmamış. label: kart görünümündeki etiket (operasyonda "Sorumlu") */
export function RepresentativeCell({ name, label = "Temsilci" }: { name: string | null; label?: string }) {
  if (!name) {
    return (
      <td data-label={label} className="crm-col-rep">
        <span className="crm-rep is-empty" title="Temsilci atanmamış">
          <i aria-hidden="true">—</i>
          <span>Atanmamış</span>
        </span>
      </td>
    );
  }
  const display = formatPersonName(name);
  return (
    <td data-label={label} className="crm-col-rep">
      <span className="crm-rep" title={display}>
        <i aria-hidden="true">{initials(display)}</i>
        <span>{display}</span>
      </span>
    </td>
  );
}

export function DateCell({ label, value }: { label: string; value?: string | null }) {
  return (
    // data-bos: telefonda boş tarih ("—") satırda yer kaplamasın (mobil-uygulama.css).
    <td data-label={label} className="crm-col-date" data-bos={value ? undefined : ""}>
      {value ? new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString("tr-TR") : "—"}
    </td>
  );
}

export function LastContactCell({ contact }: { contact?: LastContact | null }) {
  return (
    <td data-label="Son temas" className="crm-col-contact">
      {contact ? (
        <span className="crm-last-contact" title={contact.preview}>
          <span className="crm-last-contact-who">{contact.authorInitials}</span>
          <span className="crm-last-contact-when">{relativeTime(contact.at)}</span>
        </span>
      ) : (
        <span className="crm-last-contact-none">Not yok</span>
      )}
    </td>
  );
}

/*
  TELEFONDA LİSTE SATIRI (13.10.2026). Masaüstündeki sütunlar telefonda
  "etiket değer" parçaları hâlinde yan yana diziliyordu: dört beş parça
  iki üç satıra kırılıyor, hangi sözcüğün etiket hangisinin değer olduğu
  seçilmiyordu ("Sorumlu Berkcan Ağca İlerleme %5 Termin…"). Kurum
  sahibinin tarifi: sade, kompakt, kaliteden ödün vermeden.

  Bu hücre satırın telefondaki TEK görünümü: üç düzenli satır —
  başlık + durum / kim (müşteri · sorumlu) / kısa işaretler (termin,
  ilerleme, uyarılar; renk anlam taşıyor, etiket yok). Masaüstünde gizli
  (mobil-satir.css); telefonda satırın öteki hücreleri gizli. Başlık
  gerçek bağlantı: satırın geri kalanına dokunmak SatirTiklama ile
  aynı yere gider.
*/
export type MobilIsaret = { metin: string; ton?: "sessiz" | "guclu" | "uyari" | "tehlike" | "basari" | "bilgi" };

export function MobilSatir({ href, baslik, durum, alt = [], isaretler = [] }: {
  href: string;
  baslik: string;
  durum?: { etiket: string; ton: string } | null;
  alt?: (string | null | undefined | false)[];
  isaretler?: (MobilIsaret | null | undefined | false)[];
}) {
  const altMetin = alt.filter(Boolean).join(" · ");
  const isaretListesi = isaretler.filter((i): i is MobilIsaret => Boolean(i && i.metin));
  return (
    <td className="mobil-satir">
      <div className="ms-ust">
        <Link className="ms-baslik" href={href}>{baslik}</Link>
        {durum ? <span className="status-pill" data-tone={durum.ton}>{durum.etiket}</span> : null}
      </div>
      {altMetin ? <div className="ms-alt">{altMetin}</div> : null}
      {isaretListesi.length ? (
        <div className="ms-isaretler">
          {isaretListesi.map((i, sira) => <span key={sira} data-ton={i.ton}>{i.metin}</span>)}
        </div>
      ) : null}
    </td>
  );
}

/** "2026-10-28" → "28 Eki". Yalnızca gün: saat dilimi kaydırmasın diye öğlen UTC. */
export function kisaTarih(deger?: string | null) {
  if (!deger) return null;
  return new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${deger.slice(0, 10)}T12:00:00Z`));
}
