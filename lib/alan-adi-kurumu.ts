import type { SupabaseClient } from "@supabase/supabase-js";
import { kisaOnbellek } from "@/lib/kisa-onbellek";

/*
  Alan adı → kurum (resolve_organization_by_domain), sunucuda 60 sn
  önbellekli (lib/kisa-onbellek). Proxy, sayfa başlığı ve iş durumu
  sayfası aynı istekte ayrı ayrı soruyordu. Bulunamayan alan adı da
  saklanır (botların denediği adresler veritabanına gitmesin); HATA
  saklanmaz.
*/
export function alanAdiKurumu(supabase: SupabaseClient, host: string): Promise<string | null> {
  return kisaOnbellek("alan-adi", host.toLowerCase(), async () => {
    const { data, error } = await supabase.rpc("resolve_organization_by_domain", { p_domain: host });
    return { id: (data as string | null) ?? null, hata: Boolean(error) };
  }, (sonuc) => !sonuc.hata).then((sonuc) => sonuc.id);
}
