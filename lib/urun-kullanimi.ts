import { createClient } from "@supabase/supabase-js";
import { arvolabClient } from "@/lib/arvolab";
import { istanbulMonthStart } from "@/lib/istanbul-date";

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

/*
  1 KREDİ = 1.000 KARAKTER.

  Maliyet jetonla oluşuyor; ArvoLab'ın kaydettiği prompt_chars +
  output_chars jetonun en yakın vekili. "Çalışma sayısı" saymak kârı
  rastlantıya bırakırdı: iki sayfalık bir özetle altmış sayfalık bir
  analiz aynı 1 çalışma olur ve en çok kullanan müşteride en çok zarar
  edilirdi.

  Tanım BURADA çünkü fiyat kararı ArvoOS'un; ArvoLab yalnızca karakter
  sayıyor. Dilim değişirse tek yer değişir.
*/
export const KREDI_KARAKTERI = 1000;

/** Karakteri krediye çevirir; başlanan dilim tam sayılır. */
export const krediye = (karakter: number) => Math.ceil(Math.max(0, karakter) / KREDI_KARAKTERI);

export type UrunKullanimi = {
  arvolab: { aylik_kontrol: number | null; proje: number | null; aylik_kredi: number | null; aylik_calisma: number | null } | null;
  randevu: { personel: number | null; aylik_randevu: number | null } | null;
};

function randevuClient() {
  const url = process.env.RANDEVU_SUPABASE_URL;
  const key = process.env.RANDEVU_SUPABASE_SECRET_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function arvolabKullanimi(organizationId: string, baslangic: string) {
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

    /*
      AI tüketimi projeden bağımsız: kurumun hiç projesi olmasa da
      asistan çalıştırılmış olabilir. Bu yüzden erken dönüşten ÖNCE
      ölçülüyor — eskiden proje yoksa fonksiyon burada dönüyordu.
    */
    const { data: aiSatiri, error: aiHatasi } = await lab
      .rpc("arvoos_ai_kullanimi", { p_organization_id: organizationId, p_since: baslangic })
      .maybeSingle();
    /*
      Ölçüm alınamazsa null: "0 kredi" yazmak, hiç kullanmamış kiracıyla
      ölçümü kopmuş kiracıyı aynı gösterirdi. Bilinmeyen, sıfır değildir.
    */
    const ai = aiHatasi ? null : (aiSatiri as { karakter: number; calisma: number } | null);
    const aylik_kredi = ai ? krediye(Number(ai.karakter ?? 0)) : null;
    const aylik_calisma = ai ? Number(ai.calisma ?? 0) : null;

    if (!projeIdleri.length) return { aylik_kontrol: 0, proje: 0, aylik_kredi, aylik_calisma };
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

    return { aylik_kontrol: (atif ?? 0) + (ozgunluk ?? 0), proje: projeIdleri.length, aylik_kredi, aylik_calisma };
  } catch (sorun) {
    // Ölçüm bir kolaylık; ArvoLab'a ulaşılamaması ekranı kapatmamalı.
    console.error("[kota] ArvoLab kullanımı okunamadı", sorun instanceof Error ? sorun.message : sorun);
    return null;
  }
}

async function randevuKullanimi(organizationId: string, baslangic: string) {
  const rdv = randevuClient();
  if (!rdv) return null;

  try {
    const [{ count: personel, error: personelHatasi }, { count: randevu }] = await Promise.all([
      rdv.from("rdv_staff").select("id", { count: "exact", head: true }).eq("organization_id", organizationId),
      // Randevular başlangıç saatine göre sayılıyor: bu ay YAPILAN iş.
      rdv.from("rdv_appointments").select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId).gte("starts_at", baslangic),
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
  /* Sınır BİR KEZ hesaplanıp iki ürüne de veriliyor: ayrı ayrı çağrılınca
     ay sınırı iki ölçüm arasında değişebilirdi. */
  const baslangic = istanbulMonthStart().toISOString();
  const [arvolab, randevu] = await Promise.all([
    arvolabKullanimi(organizationId, baslangic),
    randevuKullanimi(organizationId, baslangic),
  ]);
  return { arvolab, randevu };
}
