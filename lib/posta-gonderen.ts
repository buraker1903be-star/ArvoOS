import { getPanelContext } from "@/lib/panel-context";
import { formatPersonName } from "@/lib/format-name";

type PanelSupabase = Awaited<ReturnType<typeof getPanelContext>>["supabase"];

/*
  İMZANIN İLK SATIRI: postayı yazan personelin adı (kurum sahibinin
  kararı, 10.10.2026). Ortak kutudan çıkan yanıtta kimin yazdığı
  görünmüyordu; müşteri kiminle konuştuğunu bilmiyordu.

  Personel kaydı yoksa ad düşüyor ve imza eskisi gibi yalnızca kurumun
  oluyor — kullanıcı hesabı olan ama hr_employees kaydı olmayan biri
  (kurucu, dış destek) postayı yine gönderebilsin.

  Burada, posta sayfasının içinde değil: cariye giden posta da aynı
  imzayı taşıyor ve iki yerde iki ayrı sorgu, birinde adı gösterip
  diğerinde göstermemenin en kolay yoluydu.
*/
export async function gonderenPersonelAdi(
  supabase: PanelSupabase,
  organizationId: string,
  userId: string,
): Promise<string | null> {
  const { data } = await supabase.from("hr_employees").select("full_name")
    .eq("organization_id", organizationId).eq("user_id", userId).maybeSingle();
  const ad = (data?.full_name as string | undefined) ?? "";
  return ad.trim() ? formatPersonName(ad) : null;
}
