import { gunFarki } from "@/lib/is-adimlari";

/*
  TERMİN ROZETİ — OPERASYONUN TEK KAYNAĞI.

  Aynı hesap üç yerde ayrı yazılıydı ve üçü farklı konuşuyordu: genel
  bakış "3 gün kaldı", işler tablosu yalnızca "Gecikti", iş detayı kendi
  dueInfo'suyla "Bugün teslim". Panoda ise hiç yoktu; oradaki "0 gün"
  rozeti kalan günü değil AŞAMADA GEÇEN günü sayıyordu ve geri sayım
  sanılıyordu. Dört ekran aynı işi yapıp başka şey söyleyince "pano ile
  işler senkron değil" oluyor — haklı olarak.

  Artık tek fonksiyon: tarih yoksa ve iş bittiyse de bir yanıtı var.

  Uzak termin "info" (mavi), "success" değil: iş detayındaki kopya
  yeşil basıyordu ama 57 gün sonrası bir BAŞARI değil, yalnızca bilgi.
  Sözler dört ekranda da aynı olmak zorunda olduğu için dar karta da
  geniş kutuya da sığacak biçimde seçildi.
*/
export type TerminRozeti = { tone: "danger" | "warning" | "info" | "success" | "neutral"; label: string; late: boolean };

export function dueBadge(due: string | null | undefined, today: string, status?: string): TerminRozeti {
  if (status === "completed" || status === "archived") return { tone: "success", label: "Tamamlandı", late: false };
  if (!due) return { tone: "neutral", label: "Tarih girilmedi", late: false };
  const days = gunFarki(today, due);
  if (days < 0) return { tone: "danger", label: `${-days} gün gecikti`, late: true };
  if (days === 0) return { tone: "warning", label: "Bugün teslim", late: false };
  if (days <= 3) return { tone: "warning", label: `${days} gün kaldı`, late: false };
  return { tone: "info", label: `${days} gün kaldı`, late: false };
}
