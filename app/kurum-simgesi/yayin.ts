import { getLoginBrand } from "@/lib/login-branding";
import { depodakiSimgeMi, harfSimgesiSvg } from "@/lib/kurum-simgesi";

/*
  KURUMUN SEKME SİMGESİNİ BİZ YAYINLIYORUZ (12.10.2026).

  Kurum simgeyi Ayarlar → Kurumsal kimlik'ten yüklüyor (depoda
  organization-assets/<kurum>/favicon.*); kendi alan adında bu yanıt onu
  BİZİM adresimizden veriyor: /kurum-simgesi (sayfa etiketleri) ve
  /favicon.ico (tarayıcıların ve arama motorlarının kökten doğrudan
  istediği adres — eskiden hiç yoktu, 404 dönüyordu).

  Simge yüklenmemişse ya da depodan okunamazsa kurumun baş harfi
  (lib/kurum-simgesi). Arvo'nun kendi adreslerinde Arvo simgesi.

  Yalnızca depodaki kendi dosyası indiriliyor (depodakiSimgeMi);
  türü ve boyutu da denetleniyor, yönlendirme izlenmiyor.
*/

const IZINLI_TURLER = new Set(["image/png", "image/jpeg", "image/webp"]);
const EN_FAZLA = 5 * 1024 * 1024;

const ortakBasliklar = {
  // Yanıt alan adına göre değişiyor: önbellek iki kurumun simgesini karıştırmasın.
  Vary: "Host",
  "X-Content-Type-Options": "nosniff",
  // Simge değişince sayfa etiketi yeni ?v= ile istiyor; /favicon.ico ise en geç bir saatte tazelenir.
  "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
};

export async function kurumSimgesiYaniti(): Promise<Response> {
  const marka = await getLoginBrand();
  if (!marka) return new Response(null, { status: 307, headers: { Location: "/favicon.svg", "Cache-Control": "public, max-age=3600", Vary: "Host" } });

  if (depodakiSimgeMi(marka.favicon_url, process.env.NEXT_PUBLIC_SUPABASE_URL, marka.id)) {
    try {
      const yanit = await fetch(marka.favicon_url, { redirect: "error", signal: AbortSignal.timeout(5000) });
      const tur = (yanit.headers.get("content-type") ?? "").split(";")[0].trim();
      if (yanit.ok && IZINLI_TURLER.has(tur)) {
        const govde = await yanit.arrayBuffer();
        if (govde.byteLength <= EN_FAZLA) return new Response(govde, { headers: { ...ortakBasliklar, "Content-Type": tur } });
      }
    } catch {
      // Depo yanıt vermezse aşağıda baş harfe düşülür: sekme boş kalmasın.
    }
  }

  return new Response(harfSimgesiSvg(marka.name, marka.primary_color), {
    headers: {
      ...ortakBasliklar,
      "Content-Type": "image/svg+xml; charset=utf-8",
      // SVG yalnızca şekil ve tek harf taşıyor; yine de doğrudan açılırsa hiçbir şey yüklemesin.
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
    },
  });
}
