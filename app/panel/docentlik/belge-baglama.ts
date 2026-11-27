import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { belgeBaglamaHatasi } from "@/lib/docentlik-islem";
import type { DocentlikBaglami } from "./baglam";

/*
  BELGEYİ FAALİYETE BAĞLAMA / KALDIRMA (F6 PR8) — tek service_role yolu.

  belge_yolu artık istemciye kapalı (20261115145234): kullanıcı oturumuyla
  PostgREST'ten yazılamıyor. Bağlama yalnızca service_role'ün çalıştırabildiği
  iki işlevden geçiyor; bu dosya o işlevleri çağıran TEK yer.

  BİLEREK "use server" DEĞİL ve server-only: "use server" dosyasındaki her
  export istemciden çağrılabilir bir uç noktaya dönüşür ve buradaki işlevler
  kullanıcı kimliğini PARAMETREYLE alıyor — dışarı açılsaydı herkes başkası
  adına belge bağlayabilirdi. Kimlik yalnızca docentlikBaglami()'nın
  oturumdan doğruladığı b.ben / b.kurum'dan gelir; çağıran sunucu işlemi
  (actions.ts) sahipliği ve PDF içeriğini kullanıcının KENDİ oturumuyla
  zaten doğruladı, işlev aynı kuralları veritabanında yeniden uyguluyor.

  Yönetici anahtarı yoksa özellik kapalı: anlaşılır hata, düşme değil.
*/
function yonetici() {
  const admin = createAdminClient();
  if (!admin) throw new Error("Belge ekleme bu kurulumda kapalı: sunucu anahtarı tanımlı değil.");
  return admin;
}

/** Yeni yolu bağlar; dönen değer önceki yol (silinmesi gereken eski nesne) ya da null. */
export async function belgeyiBagla(b: DocentlikBaglami, faaliyetId: string, yol: string, eskiYol: string | null) {
  const { data, error } = await yonetici().rpc("docentlik_belge_bagla", {
    p_kullanici: b.ben, p_org: b.kurum, p_faaliyet: faaliyetId, p_yol: yol, p_eski: eskiYol,
  });
  if (error) throw new Error(belgeBaglamaHatasi(error));
  return ((data as { eski_yol: string | null }[] | null)?.[0]?.eski_yol) ?? null;
}

/** Bağlantıyı kaldırır; dönen değer kaldırılan yol. */
export async function belgeyiKaldir(b: DocentlikBaglami, faaliyetId: string, eskiYol: string | null) {
  const { data, error } = await yonetici().rpc("docentlik_belge_kaldir", {
    p_kullanici: b.ben, p_org: b.kurum, p_faaliyet: faaliyetId, p_eski: eskiYol,
  });
  if (error) throw new Error(belgeBaglamaHatasi(error));
  return ((data as { eski_yol: string | null }[] | null)?.[0]?.eski_yol) ?? null;
}
