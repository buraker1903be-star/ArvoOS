import type { getPanelContext } from "@/lib/panel-context";
import type { Donem } from "@/lib/rapor-donemi";

/*
  BİR RAPORUN İHTİYACI (2026-10-24).

  Sekiz raporun gövdesi aynı üç şeyi alıyor: okuma istemcisi, kurum
  kimliği ve dönem. Yetki ve modül kapısı rapor gövdesinde DEĞİL,
  pencereyi açan sayfada: kapıyı her gövdeye bırakmak, birinde
  unutulduğunda sessizce açık bir rapor bırakırdı.

  Oturum istemcisi RLS'li (`createClient`), `service_role` DEĞİL:
  rapor ne okuyabiliyorsa kullanıcının kendi yetkisiyle okuyor.
*/
export type RaporGirdisi = {
  supabase: Awaited<ReturnType<typeof getPanelContext>>["supabase"];
  organizationId: string;
  donem: Donem;
};
