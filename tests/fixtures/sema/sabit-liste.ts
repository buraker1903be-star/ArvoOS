/*
  Sütun listesi bir SABİTTE: liste sayfaları yan sorgudan kaçmak için
  sütunları sayıyor, ödeme ayarları da (ArvoARC) on alanı tek sabitte
  tutuyor. Denetim sabiti çözemediği sürece bu sütunlar kör noktada
  kalıyordu.
*/
const DUZ_LISTE = "id,full_name,yanlis_sutun";
const DIZI_LISTE = ["id", "user_id", "olmayan_alan"].join(",");
/* Çözülemeyen biçim: bilerek denetlenmiyor (yanlış çözmek, kaçırmaktan kötü). */
const KOSULLU = Math.random() > 0.5 ? "id" : "full_name";

export async function sabitSecimler(supabase: any) {
  await supabase.from("personel").select(DUZ_LISTE);
  await supabase.from("oturum_kayitlari").select(DIZI_LISTE);
  await supabase.from("personel").select(KOSULLU);
}
