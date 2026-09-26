/*
  check-rakamlar denetiminin örnek ağacı. DERLENMEZ, ÇALIŞTIRILMAZ —
  tsconfig ve eslint dışarıda bırakıyor. Satır numaraları teste girdiği
  için bu dosyanın üstüne satır eklemeyin; yeni örnekleri sona ekleyin.
*/
import { createClient } from "@/lib/supabase/server";

// YAKALANMALI: sınırlı sorgudan .reduce() ile toplam
export async function a1_reduce() {
  const supabase = await createClient();
  const { data: satirlar } = await supabase.from("t").select("x").limit(50);
  return (satirlar ?? []).reduce((t, s) => t + Number(s.x ?? 0), 0);
}

// YAKALANMALI: süslü parantezsiz döngüde biriktirme
export async function a2_dongu() {
  const supabase = await createClient();
  const { data } = await supabase.from("t").select("x").limit(5000);
  let toplam = 0;
  for (const satir of data ?? []) toplam += Number(satir.x ?? 0);
  return toplam;
}

// YAKALANMALI: (data ?? []).filter(…).length
export async function a3_filterLength() {
  const supabase = await createClient();
  const { data } = await supabase.from("t").select("r").limit(200);
  return (data ?? []).filter((s) => s.r === "a").length;
}

// YAKALANMALI: ((x ?? []) as T[]).filter(…).length
export async function a4_asIleFilter() {
  const supabase = await createClient();
  const { data: kayitlar } = await supabase.from("t").select("r").limit(10);
  return ((kayitlar ?? []) as { r: string }[]).filter((s) => s.r === "b").length;
}

// YAKALANMAMALI: sınırsız sorgu — üstelik aynı "data" adıyla
export async function b1_serbest() {
  const supabase = await createClient();
  const { data } = await supabase.from("t").select("r");
  return (data ?? []).filter((s) => s.r === "a").length;
}

// YAKALANMAMALI: sınırlı liste yalnızca ekrana diziliyor, sayı iddia edilmiyor
export async function b2_sadeceGosterim() {
  const supabase = await createClient();
  const { data } = await supabase.from("t").select("ad").limit(20);
  return (data ?? []).map((s) => s.ad);
}

// YAKALANMAMALI: gerekçesi yazılmış bilinçli kullanım
export async function b3_kacis() {
  const supabase = await createClient();
  const { data } = await supabase.from("t").select("x").limit(20);
  let sayac = 0;
  /* tuzak-tamam: bu turda kaç kayıt işlendiğini raporluyor, bir nüfus ölçmüyor. */
  for (const satir of data ?? []) sayac += Number(satir.x ?? 0);
  return sayac;
}
