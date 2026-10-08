import Link from "next/link";
import { formatPhone } from "@/lib/format-phone";
import { formatPersonName } from "@/lib/format-name";
import { initials } from "@/lib/table-format";
import { relativeTime, type LastContact } from "./last-contact";

// Talepler, Teklifler ve Sözleşmeler tabloları aynı hücreleri kullanır;
// böylece üç tabloda sütunlar aynı sırada ve aynı biçimde görünür:
// No · Müşteri · Hizmet türü · Temsilci · [Tutar] · Durum · Tarih · Son temas.
// Satırın tamamı ilk hücredeki bağlantıyla tıklanır (kayit-detay.css). Hücre
// içindeki başka bir bağlantı (müşteri adı) kaplamanın üstünde kalır ve
// kendi sayfasına gider.

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
    <td data-label={label} className="crm-col-date">
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
