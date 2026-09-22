import { createClient } from "@supabase/supabase-js";
import { arvolabClient } from "@/lib/arvolab";

/*
  Ürün kullanımının ölçülmesi: ArvoLab ve Randevu.

  Kota koymadan önce ölçüm gerekiyor — ArvoOS'ta storage_limit_mb
  yıllarca girildi, kullanım hiç hesaplanmadı ve ekrandaki sayının
  karşılığı yoktu. Bu dosya o hatayı tekrarlamamak için var.

  Veri ÜRÜNLERİN KENDİ VERİTABANLARINDA: ArvoLab ayrı bir Supabase
  projesi, Randevu ayrı. Ölçüm oradan okunuyor ve hiçbir şey yazılmıyor.

  ULAŞILAMAZSA null DÖNER, hata fırlatmaz. Köprü koptuğu için kiracı
  ekranının açılmaması ya da kotanın "aşıldı" görünmesi, en kötü hata
  türü olurdu — bilinmeyen, aşım değildir.
*/

export type UrunKullanimi = {
  arvolab: { aylik_kontrol: number | null; proje: number | null } | null;
  randevu: { personel: number | null; aylik_randevu: number | null } | null;
};

/** Ayın ilk günü, Türkiye saatiyle. Dönemsel sayımların başlangıcı. */
function ayBasi(): string {
  const simdi = new Date();
  const istanbul = new Date(simdi.toLocaleString("en-US", { timeZone: "Europe/Istanbul" }));
  return new Date(Date.UTC(istanbul.getFullYear(), istanbul.getMonth(), 1)).toISOString();
}

function randevuClient() {
  const url = process.env.RANDEVU_SUPABASE_URL;
  const key = process.env.RANDEVU_SUPABASE_SECRET_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function arvolabKullanimi(organizationId: string) {
  const lab = arvolabClient();
  if (!lab) return null;

  try {
    /*
      Kontroller projeye bağlı, projeler kuruma. citation_checks'te
      organization_id yok (project_id var), originality_checks'te
      document_id var — iki farklı yol. Önce kurumun projelerini alıp
      sonra saymak, iki ayrı iç içe join'den hem okunur hem ucuz.
    */
    const { data: projeler, error } = await lab
      .from("academic_projects")
      .select("id")
      .eq("organization_id", organizationId);
    if (error) throw error;

    const projeIdleri = (projeler ?? []).map((satir) => satir.id as string);
    if (!projeIdleri.length) return { aylik_kontrol: 0, proje: 0 };

    const baslangic = ayBasi();
    const [{ count: atif }, { data: belgeler }] = await Promise.all([
      lab.from("citation_checks").select("id", { count: "exact", head: true })
        .in("project_id", projeIdleri).gte("created_at", baslangic),
      lab.from("document_uploads").select("id").in("project_id", projeIdleri),
    ]);

    const belgeIdleri = (belgeler ?? []).map((satir) => satir.id as string);
    const { count: ozgunluk } = belgeIdleri.length
      ? await lab.from("originality_checks").select("id", { count: "exact", head: true })
          .in("document_id", belgeIdleri).gte("created_at", baslangic)
      : { count: 0 };

    return { aylik_kontrol: (atif ?? 0) + (ozgunluk ?? 0), proje: projeIdleri.length };
  } catch (sorun) {
    // Ölçüm bir kolaylık; ArvoLab'a ulaşılamaması ekranı kapatmamalı.
    console.error("[kota] ArvoLab kullanımı okunamadı", sorun instanceof Error ? sorun.message : sorun);
    return null;
  }
}

async function randevuKullanimi(organizationId: string) {
  const rdv = randevuClient();
  if (!rdv) return null;

  try {
    const [{ count: personel, error: personelHatasi }, { count: randevu }] = await Promise.all([
      rdv.from("rdv_staff").select("id", { count: "exact", head: true }).eq("organization_id", organizationId),
      // Randevular başlangıç saatine göre sayılıyor: bu ay YAPILAN iş.
      rdv.from("rdv_appointments").select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId).gte("starts_at", ayBasi()),
    ]);
    if (personelHatasi) throw personelHatasi;

    return { personel: personel ?? 0, aylik_randevu: randevu ?? 0 };
  } catch (sorun) {
    console.error("[kota] Randevu kullanımı okunamadı", sorun instanceof Error ? sorun.message : sorun);
    return null;
  }
}

/**
 * Kiracının ürün kullanımı. Ölçüm alınamayan ürün null döner.
 *
 * Yalnızca SEÇİLİ kiracı için çağrılıyor: iki ayrı veritabanına gidiyor
 * ve tüm kiracılar için yapmak liste ekranını her açılışta yavaşlatırdı.
 */
export async function urunKullanimi(organizationId: string): Promise<UrunKullanimi> {
  const [arvolab, randevu] = await Promise.all([
    arvolabKullanimi(organizationId),
    randevuKullanimi(organizationId),
  ]);
  return { arvolab, randevu };
}
