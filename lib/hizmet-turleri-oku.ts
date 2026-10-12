import type { SupabaseClient } from "@supabase/supabase-js";
import { hizmetTurleriCoz } from "./hizmet-turleri";

/*
  Kurumun hizmet türü listesi (lib/hizmet-turleri). Talep formu ve
  düzenleme formları buradan okur, Ayarlar da.

  Okuma düşerse (ör. migration 20261012110702 henüz uygulanmadı)
  varsayılan listeye dönülür ve `hata` döner: talep formu bir ayar
  tablosu yüzünden kapanmamalı. Ayarlar ekranı hatayı gösterir ve
  düzenlemeyi kapatır; yazma işlemi de okuyamadığı listenin üstüne
  yazmaz (hizmet-turu-actions).
*/
export async function kurumHizmetTurleri(supabase: SupabaseClient, organizationId: string) {
  const { data, error } = await supabase
    .from("organization_service_types").select("turler,updated_at")
    .eq("organization_id", organizationId).maybeSingle();
  if (error) return { liste: hizmetTurleriCoz(null), kayitli: false, guncelleme: null, hata: error.message };
  return { liste: hizmetTurleriCoz(data ? data.turler : null), kayitli: Boolean(data), guncelleme: (data?.updated_at as string | undefined) ?? null, hata: null };
}
