/*
  Kullanıcının yürürlükteki ArvoOS Kullanım Sözleşmesi sürümünü onaylayıp
  onaylamadığı (sozlesme_onaylari, 20261029162437). İstek başına bir kez.

  OKUYAMAZSA KAPATMAZ (ArvoLab'daki kuralın aynısı): tablo henüz yoksa
  (migration uygulanmadan önceki dağıtım) ya da sorgu düşerse pencere
  gösterilmez ve günlüğe yazılır. Geçici bir arıza bütün kullanıcıları bir
  onay penceresine kilitlememeli; onay bir sonraki istekte istenir. Sunucu
  anahtarı yoksa da gösterilmez: onay yazılamayacağı için pencere
  kullanıcıyı çıkamayacağı bir yere kapatırdı.

  MUAFİYET YOK: Kurum Sahibi ve kurucu dâhil panele giren herkes onaylar
  (ArvoLab'da kurum sahibinin 29.10.2026 kararı; burada baştan böyle).

  Bilerek "use server" DEĞİL: bu dosyadaki her export dışarıdan
  çağrılabilir bir uç noktaya dönüşürdü.
*/
import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { SOZLESME_SURUMU } from "./kullanim-sozlesmesi";

export const sozlesmeOnayGerekli = cache(async (supabase: SupabaseClient, kullaniciId: string): Promise<boolean> => {
  if (!createAdminClient()) return false;
  const { data, error } = await supabase
    .from("sozlesme_onaylari")
    .select("id")
    .eq("user_id", kullaniciId)
    .eq("belge", "kullanim_sozlesmesi")
    .eq("surum", SOZLESME_SURUMU)
    .limit(1);
  if (error) {
    console.error("[sözleşme] onay durumu okunamadı; pencere gösterilmedi", error.code, error.message);
    return false;
  }
  return !data?.length;
});

export type SozlesmeOnayi = {
  id: string; surum: string; onaylandi: string; ip: string | null; kullanici_araci: string | null;
  ulke: string | null; bolge: string | null; sehir: string | null; enlem: number | null; boylam: number | null;
  adres: string | null; kurum_adi: string | null; metin_ozeti: string;
};

export const ONAY_SECIMI = "id,surum,onaylandi,ip,kullanici_araci,ulke,bolge,sehir,enlem,boylam,adres,kurum_adi,metin_ozeti";
