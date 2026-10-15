import type { SupabaseClient } from "@supabase/supabase-js";
import { formatPersonName } from "@/lib/format-name";

/*
  BİR İŞİ KİMİN YAPTIĞININ ADI.

  Panel "şunu kim yaptı" sorusunu üç ayrı yerde soruyor: görevi kim
  tamamladı, dosyayı kim yükledi, işi kim arşivledi. Üçü de adı yalnızca
  `hr_employees`ten arıyordu ve personel kaydı olmayan herkes — KURUM
  SAHİBİ DAHİL — "Ekip üyesi" diye yazılıyordu.

  Yeni kurulan bir kurumda sahibin personel kaydı yok: o satır ancak İK
  ekranından elle açılıyor, kuruluş açmıyor. Yani kurumun ilk haftasında
  işi fiilen yürüten kişinin adı hiçbir yerde yazmıyordu. 15.10.2026'da
  iş detayında ölçüldü: tek bir aşama tamamlama olayı "Son hareketler"
  listesinde "Ekip üyesi", hemen altındaki kayıt geçmişinde "Burak
  Erdoğan" görünüyordu — çünkü kayıt geçmişi `profiles`a da bakıyordu.

  Kural tek yerde: önce profiles, sonra hr_employees. Sıra önemli,
  personel kaydındaki ad profiles'takini EZİYOR — kurumun kendi
  kayıtlarındaki yazım esas.

  Okunamazsa ad yerine çağıranın yedeği ("Ekip üyesi") yazılıyor; bu
  GÖRÜNÜR bir yedek, yanlış bir cümle değil. Yine de iz bırakıyor:
  sessizce isimsizleşen bir denetim satırının sebebi aranabilsin.
*/
export async function kisiAdlari(
  supabase: SupabaseClient,
  organizationId: string,
  userIds: readonly (string | null | undefined)[],
): Promise<Map<string, string>> {
  const kimlikler = [...new Set(userIds.filter((deger): deger is string => Boolean(deger)))];
  const adlar = new Map<string, string>();
  if (!kimlikler.length) return adlar;

  const [{ data: profiller, error: profilHatasi }, { data: personeller, error: personelHatasi }] = await Promise.all([
    supabase.from("profiles").select("id,full_name").in("id", kimlikler),
    supabase.from("hr_employees").select("user_id,full_name").eq("organization_id", organizationId).in("user_id", kimlikler),
  ]);
  if (profilHatasi || personelHatasi) {
    console.error("[kisi-adlari] adlar okunamadı", {
      organizationId,
      kisiSayisi: kimlikler.length,
      profil: profilHatasi?.message,
      personel: personelHatasi?.message,
    });
  }

  for (const satir of (profiller ?? []) as { id: string; full_name: string | null }[]) {
    const ad = formatPersonName(satir.full_name);
    if (ad) adlar.set(satir.id, ad);
  }
  for (const satir of (personeller ?? []) as { user_id: string | null; full_name: string | null }[]) {
    const ad = formatPersonName(satir.full_name);
    if (satir.user_id && ad) adlar.set(satir.user_id, ad);
  }
  return adlar;
}
