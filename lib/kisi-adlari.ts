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
/** Tek istekte sorulan en fazla kimlik (adres uzunluğu sınırı; bkz. aşağıdaki not). */
export const KISI_PARCA = 100;

export async function kisiAdlari(
  supabase: SupabaseClient,
  organizationId: string,
  userIds: readonly (string | null | undefined)[],
): Promise<Map<string, string>> {
  const kimlikler = [...new Set(userIds.filter((deger): deger is string => Boolean(deger)))];
  const adlar = new Map<string, string>();
  if (!kimlikler.length) return adlar;

  /*
    Kimlikler PARÇA PARÇA soruluyor. Eskiden hepsi tek bir `in.(…)`
    süzgecindeydi: her kimlik ~37 karakter, 1100 akademisyenli bir kurumda
    adres ~40 KB'ı aşıyor ve istek boş bir hatayla düşüyordu — gözetim
    listesindeki herkes "Üye xxxxxxxx" yedeğiyle göründü (F6 PR7, gerçek
    PostgREST'te ölçüldü). Barındırılan Supabase'in adres sınırı daha düşük.
  */
  const parcalar: string[][] = [];
  for (let i = 0; i < kimlikler.length; i += KISI_PARCA) parcalar.push(kimlikler.slice(i, i + KISI_PARCA));
  const yanitlar = await Promise.all(parcalar.map((parca) => Promise.all([
    supabase.from("profiles").select("id,full_name").in("id", parca),
    supabase.from("hr_employees").select("user_id,full_name").eq("organization_id", organizationId).in("user_id", parca),
  ])));
  const profiller = yanitlar.flatMap(([p]) => p.data ?? []);
  const personeller = yanitlar.flatMap(([, h]) => h.data ?? []);
  const profilHatasi = yanitlar.find(([p]) => p.error)?.[0].error ?? null;
  const personelHatasi = yanitlar.find(([, h]) => h.error)?.[1].error ?? null;
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
