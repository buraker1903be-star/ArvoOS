import { formatPhone } from "@/lib/format-phone";
import { formatPersonName } from "@/lib/format-name";
import { formatSubject, initials } from "@/lib/table-format";
import { relativeTime, type LastContact } from "./last-contact";

// Talepler, Teklifler ve Sözleşmeler tabloları aynı hücreleri kullanır;
// böylece üç tabloda sütunlar aynı sırada ve aynı biçimde görünür:
// No · Müşteri · Konu · Temsilci · [Tutar] · Durum · Tarih · Son temas.
// Satırın tamamı ilk hücredeki bağlantıyla tıklanır (panel-premium.css),
// bu yüzden hücrelerde ayrıca bağlantı yok.

export function CustomerCell({
  name,
  phone,
  email,
}: {
  name?: string | null;
  phone?: string | null;
  email?: string | null;
}) {
  const display = formatPersonName(name) || "—";
  return (
    <td data-label="Müşteri">
      <span className="crm-table-title" title={display}>{display}</span>
      <span className="crm-table-sub">{formatPhone(phone) || email || "İletişim yok"}</span>
    </td>
  );
}

export function SubjectCell({ title, service }: { title?: string | null; service?: string | null }) {
  const subject = formatSubject(title) || "—";
  return (
    <td data-label="Konu">
      <span className="crm-table-title" title={subject}>{subject}</span>
      <span className="crm-table-sub">{service?.trim() || "Hizmet belirtilmedi"}</span>
    </td>
  );
}

/** name: null ise temsilci atanmamış */
export function RepresentativeCell({ name }: { name: string | null }) {
  if (!name) {
    return (
      <td data-label="Temsilci" className="crm-col-rep">
        <span className="crm-rep is-empty" title="Temsilci atanmamış">
          <i aria-hidden="true">—</i>
          <span>Atanmamış</span>
        </span>
      </td>
    );
  }
  const display = formatPersonName(name);
  return (
    <td data-label="Temsilci" className="crm-col-rep">
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
