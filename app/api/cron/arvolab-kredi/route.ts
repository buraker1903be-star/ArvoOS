import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { cronRotasi, type CronKosusu } from "@/lib/cron-kaydi";
import { bekleyenKredileriYukle } from "@/lib/ai-kredi-yukleme";
import { kurucuyaBildir } from "@/lib/kurucu-bildirimi";

/*
  ÖDENMİŞ AMA YÜKLENEMEMİŞ AI KREDİSİNİ YÜKLER (14.10.2026).

  Ödeme anında ArvoLab'a ulaşılamazsa kredi yüklenemiyor ve sipariş
  satırı loaded_at'siz kalıyor (lib/ai-kredi-yukleme'de tam gerekçe).
  Müşteri parasını ödemiş olduğu hâlde asistanda "krediniz bitti"
  duvarına çarpıyordu ve bunu kimse görmüyordu.

  NEDEN AYRI BİR CRON, NEDEN GÜNLÜK İŞİN İÇİNDE DEĞİL: müşteri O AN
  engelleniyor. Günlük hatırlatmaya eklemek kurtarmayı yirmi dört saate
  kadar geciktirirdi; on dakika, ArvoLab'ın kısa bir kesintisinden sonra
  kimsenin fark etmeyeceği kadar kısa. Ayrı bir yol olması aynı zamanda
  işin kendi sağlığının izlenmesini sağlıyor: vercel.json'a girdiği anda
  Sistem Sağlığı'nın "Zamanlanmış işler" kartında kendi satırı oluyor ve
  durursa koşma nöbeti haber veriyor (lib/cron-isleri).

  YÜKLEME TEKİLLEŞTİRİLMİŞ: ArvoLab aynı ödeme kimliğiyle ikinci kez
  kredi eklemiyor, bu yüzden her on dakikada bir denemek güvenli.

  Vercel isteğe "Authorization: Bearer <CRON_SECRET>" ekler. CRON_SECRET
  tanımlı değilse uç kapalıdır (kapalı başarısızlık).
*/

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function yetkili(istek: Request) {
  const sir = process.env.CRON_SECRET;
  const baslik = istek.headers.get("authorization") ?? "";
  if (!sir || !baslik.startsWith("Bearer ")) return false;
  const beklenen = Buffer.from(sir);
  const gelen = Buffer.from(baslik.slice("Bearer ".length));
  return beklenen.length === gelen.length && timingSafeEqual(beklenen, gelen);
}

// Koşma kaydı lib/cron-kaydi ile; yetkisiz istek kaydedilmez.
export async function GET(istek: Request) {
  if (!yetkili(istek)) return new Response("Yetkisiz", { status: 401 });
  return cronRotasi("/api/cron/arvolab-kredi", kosu);
}

async function kosu(): Promise<CronKosusu> {
  const admin = createAdminClient();
  if (!admin) return {
    yanit: Response.json({ hata: "sunucu anahtarı yok" }, { status: 500 }),
    sonuc: "hata", ayrinti: { hata: "sunucu anahtarı yok" },
  };

  const sonuc = await bekleyenKredileriYukle(admin);

  /*
    SİPARİŞ BAŞINA TEK BİLDİRİM (gün değil). Bu, tekrarlayan bir durum
    değil tek bir olay: belirli bir ödemenin kredisi yüklenemedi. Gün
    anahtarı kullansaydık aynı arıza her gün yeniden bildirilirdi; oysa
    kurucunun bir kez görmesi ve takip etmesi gerekiyor — devam eden
    durumu Sistem Sağlığı kartı gösteriyor.

    Uyarı HEMEN yazılmıyor: ilk tur çoğu zaman krediyi yüklüyor. Yalnızca
    yüklenemeden kalanlar bildiriliyor.
  */
  for (const kayit of sonuc.kalanlar) {
    await kurucuyaBildir(admin, {
      kategori: "kredi_yuklenmedi",
      anahtar: `kredi:${kayit.siparisId}`,
      baslik: "Ödenen AI kredisi yüklenemedi",
      metin: `${kayit.kredi} kredi ödendi ama ArvoLab'a yüklenemedi. Müşteri parasını ödediği hâlde asistanda durdurulur. `
        + "ArvoLab köprüsü düzelince kendiliğinden yüklenir; düzelmiyorsa Sistem Sağlığı'na bakın.",
      adres: "/panel/platform/saglik",
      ek: { siparis: kayit.siparisId, kurum: kayit.organizationId, kredi: kayit.kredi, odeme: kayit.merchantOid },
    });
  }

  /* Kalan varsa "eksik": iş koştu ama yapacağını yapamadı. Sağlık kartı
     da bunu gösteriyor; ikisi aynı şeyi söylemeli. */
  return {
    yanit: Response.json(sonuc, { headers: { "Cache-Control": "no-store" } }),
    sonuc: sonuc.kalanlar.length ? "eksik" : "tamam",
    ayrinti: { denenen: sonuc.denenen, yuklenen: sonuc.yuklenen, kalan: sonuc.kalanlar.length },
  };
}
