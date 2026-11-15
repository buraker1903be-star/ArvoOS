import "server-only";
import { getPanelContext } from "@/lib/panel-context";
import { assertModuleKeyAccess } from "@/lib/role-permissions";

/*
  DOÇENTLİK SUNUCU BAĞLAMI (F6 PR5). Okuma (veri.ts) ve yazma
  (actions.ts) işlemlerinin TEK kapısı; yetkinin "sunucu" katmanı.

  Kimlik ve kurum yalnızca oturumdan (getPanelContext): hiçbir işlem
  kullanıcı kimliğini ya da kurumu formdan almıyor. Kurum, seçili çalışma
  alanı; kullanıcı, oturum jetonunun sahibi.

  Üç kapı, sırayla:
   1. Modül kurumda açık mı (izin listesi + kurumda açık; #317 başka
      kurumda açık satır olmasına izin vermiyor).
   2. Kişide/rolünde modül gizli mi (Kurum Sahibi hariç).
   3. İşleme özgü yetenek (docentlik.tumunu_gor / kriter_yonet / uak_yonet)
      — panel bağlamının izin() sorusu; Kurum Sahibi istisnası onun içinde,
      modül kapalıyken üçü de yok (lib/yetkiler → kurumaOzelYetkileriSuz).

  Bu kapılar kullanıcıya anlaşılır bir cümle vermek için. Asıl koruma
  RLS: her yazma kullanıcının kendi oturumuyla (service_role değil) ve
  "returning" ile yapılıyor; işlem sırasında üyelik düşer ya da modül
  kapanırsa satır yazılmıyor, işlem "0 satır" görüp reddediyor.

  "server-only": bu dosya istemci paketine girerse derleme düşer.
*/

export const DOCENTLIK_KAPALI = "Doçentlik modülü kurumunuzda açık değil.";

export async function docentlikBaglami() {
  const baglam = await getPanelContext();
  if (!baglam.modules.some((modul) => modul.code === "docentlik")) throw new Error(DOCENTLIK_KAPALI);
  assertModuleKeyAccess(baglam.membership.role, "docentlik", baglam.hiddenModuleKeys);
  return { ...baglam, kurum: baglam.membership.organization_id, ben: baglam.userId };
}

export type DocentlikBaglami = Awaited<ReturnType<typeof docentlikBaglami>>;

/** Yetenek gerekli; yoksa anlaşılır hata (RLS de aynı kuralı uyguluyor). */
export function yetkiGerekli(baglam: DocentlikBaglami, anahtar: "docentlik.tumunu_gor" | "docentlik.kriter_yonet" | "docentlik.uak_yonet", metin: string) {
  if (!baglam.izin(anahtar)) throw new Error(metin);
}

/*
  Supabase istemcisi hata fırlatmıyor, `error` alanına yazıyor (AGENTS.md:
  okunamayan sorgu). Okunamayan veri "kayıt yok" sayılmaz.
*/
export function okunamadiysaFirlat(hata: { message: string } | null, ne: string): void {
  if (hata) throw new Error(`${ne} okunamadı: ${hata.message}`);
}
