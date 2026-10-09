import type { SupabaseClient } from "@supabase/supabase-js";
import { formatPersonName } from "@/lib/format-name";

/**
 * Listelerde "son temas" bilgisi.
 *
 * Önceden yalnızca yorum sayısı çekiliyordu ("2 yorum"). Ama sayı,
 * sorulan soruyu cevaplamıyor: müşteriyle en son ne zaman konuşuldu?
 * İki yorumun ikisi de bir ay önce yazılmış olabilir.
 *
 * Asıl sinyal yorumun YOKLUĞU: uzun süredir bekleyen ama hiç not
 * girilmemiş bir kayıt, kimsenin takip etmediği kayıttır.
 */

export type LastContact = {
  count: number;
  at: string;
  authorInitials: string;
  preview: string;
};

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase("tr-TR"))
    .join("") || "--";

/** "2 gün önce", "3 saat önce" — tam tarihten daha hızlı okunuyor. */
export function relativeTime(value: string | null | undefined): string {
  if (!value) return "";
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "az önce";
  if (minutes < 60) return `${minutes} dk önce`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} saat önce`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} gün önce`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} ay önce`;
  return `${Math.floor(months / 12)} yıl önce`;
}

/** Bir tarihin üzerinden kaç gün geçtiği; gecikme uyarıları için. */
export function daysSince(value: string | null | undefined): number | null {
  if (!value) return null;
  return Math.floor((Date.now() - new Date(value).getTime()) / 86400000);
}

/**
 * Bekleme süresi etiketi. "0 gündür" hiçbir şey söylemiyordu;
 * bugün gönderilmiş bir kayıtta "bugün" yazması daha doğru.
 */
export function waitingLabel(value: string | null | undefined): string | null {
  const days = daysSince(value);
  if (days === null) return null;
  if (days <= 0) return "bugün gönderildi";
  if (days === 1) return "1 gündür bekliyor";
  return `${days} gündür bekliyor`;
}

export async function fetchLastContacts(
  supabase: SupabaseClient,
  organizationId: string,
  opportunityIds: string[],
): Promise<Map<string, LastContact>> {
  const result = new Map<string, LastContact>();
  if (!opportunityIds.length) return result;

  /*
    Yorumlar ve kurumun panel hesabı olan personeli AYNI ANDA okunur; yazar
    adlarının neredeyse hepsi oradan çıkıyor. Eskiden yorumlar okunup
    bittikten sonra yazarlar için ikinci bir tur atılıyordu (talepler
    listesinin kritik yolunda). Profil tablosuna yalnızca personel kaydı
    olmayan bir yazar kalırsa gidilir.
  */
  const [{ data, error }, { data: employees }] = await Promise.all([
    supabase
      .from("crm_internal_comments")
      .select("opportunity_id,body,created_at,created_by")
      .eq("organization_id", organizationId)
      .in("opportunity_id", opportunityIds)
      .order("created_at", { ascending: false }),
    supabase
      .from("hr_employees")
      .select("user_id,full_name")
      .eq("organization_id", organizationId)
      .not("user_id", "is", null),
  ]);
  if (error) throw new Error("Yorum bilgisi okunamadı: " + error.message);

  const rows = data ?? [];
  const names = new Map<string, string>();
  for (const e of employees ?? []) if (e.user_id) names.set(e.user_id, e.full_name);
  const eksikYazarlar = [...new Set(rows.map((r) => r.created_by).filter((id) => id && !names.has(id)))];
  if (eksikYazarlar.length) {
    const { data: profiles } = await supabase.from("profiles").select("id,full_name").in("id", eksikYazarlar);
    for (const p of profiles ?? []) names.set(p.id, p.full_name);
  }

  // Sorgu tarihe göre azalan sıralı; her talebin ilk gördüğümüz satırı en yenisi.
  for (const row of rows) {
    const existing = result.get(row.opportunity_id);
    if (existing) {
      existing.count += 1;
      continue;
    }
    const author = formatPersonName(names.get(row.created_by)) || "";
    const body = (row.body ?? "").replace(/\s+/g, " ").trim();
    result.set(row.opportunity_id, {
      count: 1,
      at: row.created_at,
      authorInitials: author ? initials(author) : "--",
      preview: body.length > 60 ? body.slice(0, 60).trimEnd() + "…" : body,
    });
  }

  return result;
}
