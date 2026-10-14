// Sütun DOĞRU, değer imkânsız: kısıt yalnızca 'basarili' ve 'basarisiz'a
// izin veriyor. Sorgu hata vermez, sessizce sıfır satır döner.
export async function imkansiz(supabase: any) {
  return supabase.from("oturum_kayitlari").select("id").eq("sonuc", "hata");
}
