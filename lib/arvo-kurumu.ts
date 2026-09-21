import type { SupabaseClient } from "@supabase/supabase-js";

/*
  Kurum Arvo'nun kendisi mi (organizations.kind = 'internal')?

  Tek kullanım yeri belge gönderiminin hangi yoldan gideceği kararı
  (lib/belge-gonderim-yolu.ts): ortak numara Arvo'nun numarası olduğu için
  Arvo kendi müşterisine oradan yazabilir, başka bir kurum yazamaz.

  Panel bağlamında taşınmıyor çünkü `kind` get_my_workspaces RPC'sinde yok;
  oraya eklemek migration gerektirirdi ve bu tek soru için gereksiz.
*/
export async function arvoKurumuMu(supabase: SupabaseClient, organizationId: string): Promise<boolean> {
  const { data } = await supabase
    .from("organizations")
    .select("kind")
    .eq("id", organizationId)
    .maybeSingle();
  // Okunamazsa "değil" sayıyoruz: yanlış tarafa düşmenin bedeli, başka bir
  // kurumun teklifinin Arvo'nun numarasından gitmesi olurdu.
  return data?.kind === "internal";
}
