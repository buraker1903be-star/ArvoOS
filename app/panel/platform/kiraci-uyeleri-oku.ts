import type { SupabaseClient } from "@supabase/supabase-js";
import type { KiraciUyesi } from "./kiraci-uyeleri";

/*
  Bir kiracının üyeleri, adı ve e-postasıyla (14.10.2026).

  Kiracı dosyasının içindeydi; müşteri detayının Kullanıcılar penceresi de
  aynı listeyi gösterdiği için buraya alındı — ad için üç kaynağın
  sırası (profiles → personel → auth üstverisi) iki yerde ayrı ayrı
  yazılsaydı biri ötekinden sapardı.

  admin: sunucu anahtarlı istemci; yoksa e-posta ve personel adı okunmaz.
*/
export async function kiraciUyeleriniOku(
  supabase: SupabaseClient,
  admin: SupabaseClient | null,
  targetId: string,
  uyelikler: { organization_id: string; user_id: string; role: string; is_active: boolean }[],
): Promise<KiraciUyesi[]> {
  const kiraciUyelikleri = uyelikler.filter((satir) => satir.organization_id === targetId);
  /*
    Ad üç yerde olabilir ve hiçbiri zorunlu değil:

      profiles.full_name  — davet akışı yazıyor (owner daveti, üye ekleme).
      hr_employees        — kurumun kendi personel kaydı; kiracının paneli
                            selamlamada bunu kullanıyor.
      auth üstverisi      — kayıt sırasında girilmişse.

    Üçü de denenmediği için konsolda "Adı kayıtlı değil" yazan satırlar
    kalıyordu: davet akışından geçmeden kuruma eklenen bir hesabın
    profiles kaydı hiç oluşmuyor.
  */
  const kullaniciIdleri = kiraciUyelikleri.map((satir) => satir.user_id);
  /* Personel kaydı yalnızca kurum üyelerine açık (RLS: arvo_is_member).
     Kurucu her kiracının üyesi değil; kullanıcı anahtarıyla okusaydık ad
     bazı kiracılarda çıkar bazılarında çıkmazdı — sessiz ve açıklanamaz
     bir fark. Sunucu anahtarıyla okunuyor, ödeme ve etkinlik gibi. */
  const [{ data: profilData }, { data: personelData }] = kullaniciIdleri.length
    ? await Promise.all([
        supabase.from("profiles").select("id,full_name").in("id", kullaniciIdleri),
        admin
          ? admin.from("hr_employees").select("user_id,full_name").eq("organization_id", targetId).in("user_id", kullaniciIdleri)
          : Promise.resolve({ data: [] }),
      ])
    : [{ data: [] }, { data: [] }];
  const personelAdi = new Map(
    ((personelData ?? []) as { user_id: string | null; full_name: string | null }[])
      .filter((row) => row.user_id && row.full_name)
      .map((row) => [row.user_id as string, row.full_name]),
  );
  const adById = new Map(((profilData ?? []) as { id: string; full_name: string | null }[]).map((row) => [row.id, row.full_name]));
  /*
    E-posta ve yedek ad auth.users'ta; REST'ten okunamıyor, yönetim
    API'siyle geliyor. Kiracı başına birkaç üye olduğu için tek tek
    sormak ucuz — Tüm Üyeler ekranındaki gibi tüm listeyi sayfalamak
    burada gereksiz olurdu.

    "Adı kayıtlı değil" yazan üç satır arasında kimin kim olduğunu
    ayırmanın yolu yoktu: profiles.full_name çoğu hesapta boş, e-posta
    ise hesabın kendisi.
  */
  const hesaplar = admin
    ? await Promise.all(kiraciUyelikleri.map(async (satir) => {
        const { data } = await admin.auth.admin.getUserById(satir.user_id);
        const ustveri = (data?.user?.user_metadata ?? {}) as { full_name?: string; name?: string };
        return { id: satir.user_id, email: data?.user?.email ?? null, name: ustveri.full_name ?? ustveri.name ?? null };
      }))
    : [];
  const hesapById = new Map(hesaplar.map((hesap) => [hesap.id, hesap]));
  return kiraciUyelikleri
    .map((satir) => ({
      userId: satir.user_id,
      name: adById.get(satir.user_id) || personelAdi.get(satir.user_id) || hesapById.get(satir.user_id)?.name || null,
      email: hesapById.get(satir.user_id)?.email ?? null,
      role: satir.role,
      active: Boolean(satir.is_active),
    }))
    // Sahipler üstte, pasifler altta: bakılması gereken sıra bu.
    .sort((a, b) => Number(b.active) - Number(a.active) || Number(b.role === "owner") - Number(a.role === "owner"));
}
