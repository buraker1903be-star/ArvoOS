import type { SupabaseClient } from "@supabase/supabase-js";
import { kisaOnbellek } from "@/lib/kisa-onbellek";

/*
  TAKİP EKRANLARININ KURUM MARKASI — TEK KAYNAK (17.10.2026).

  İki kamusal ekran var: /durum/<kurum> (slug ile) ve kurumun kendi
  alan adındaki /is-durumu (alan adı ile). İkisi de markayı hem
  `generateMetadata` içinde hem sayfada okuyordu, yani her istekte
  AYNI sorgu iki kez gidiyordu. Üstüne bir de sayfanın 404 kararını
  düzeltmek için üçüncü bir okuma gerekti; o yüzden okuma buraya
  toplandı ve `kisaOnbellek` ile 60 saniye saklanıyor — alan adı
  çözümünde zaten kullanılan desen (lib/alan-adi-kurumu).

  Yalnızca KAMUSAL bilgi: kurum adı, logo, renk. Kişiye ya da
  yetkiye bağlı hiçbir şey burada saklanmıyor. Bulunamayan kurum da
  saklanıyor (botların denediği adresler veritabanına gitmesin),
  HATA saklanmıyor.
*/
export type TakipMarkasi = {
  slug: string;
  name: string;
  logo_url?: string | null;
  primary_color?: string | null;
};

type Sonuc = { marka: TakipMarkasi | null; hata: boolean };

const ilk = (data: unknown): TakipMarkasi | null => {
  const satir = Array.isArray(data) ? data[0] : data;
  return (satir as TakipMarkasi | null) ?? null;
};

/** Slug ile: /durum/<kurum>. */
export function slugMarkasi(supabase: SupabaseClient, slug: string): Promise<TakipMarkasi | null> {
  return kisaOnbellek<Sonuc>(
    "takip-markasi-slug",
    slug.toLowerCase(),
    async () => {
      const { data, error } = await supabase.rpc("get_public_organization_branding", { p_slug: slug });
      return { marka: ilk(data), hata: Boolean(error) };
    },
    (sonuc) => !sonuc.hata,
  ).then((sonuc) => sonuc.marka);
}

/** Kurum kimliği ile: kendi alan adındaki /is-durumu. */
export function kurumMarkasi(supabase: SupabaseClient, organizationId: string): Promise<TakipMarkasi | null> {
  return kisaOnbellek<Sonuc>(
    "takip-markasi-kurum",
    organizationId,
    async () => {
      const { data, error } = await supabase.rpc("get_public_organization_branding_by_id", { p_org_id: organizationId });
      return { marka: ilk(data), hata: Boolean(error) };
    },
    (sonuc) => !sonuc.hata,
  ).then((sonuc) => sonuc.marka);
}
