/*
  ZAMANLANMIŞ İŞİN KOŞMA KAYDI (14.10.2026) — yazan taraf.

  Tablo ve budama: supabase/migrations/20261014173724_cron_kayitlari.sql.
  Ekranın okuduğu kural: lib/cron-isleri.ts. Gerekçe (hangi iş durursa ne
  olur) iki dosyada da yazılı.

  KAYIT YAZMA İŞİ DÜŞÜRMEZ. Buradaki hiçbir yol fırlatmıyor: günlük
  tutmanın işin kendisini bozması, günlük tutmamaktan kötüdür — posta
  eşitlemesi iki dakikada bir koşuyor ve kayıt tablosundaki bir sorun
  bütün kutuları durdurabilirdi. Yazılamayan kayıt sunucu günlüğüne
  düşüyor; ekranda da "henüz kaydı yok" diye görünür, "sorun yok" diye
  değil (lib/cron-isleri'ndeki "hic" durumu).

  TEK ÇIKIŞ NOKTASI, TİPLE ZORLANIYOR. cronRotasi'nın gövdesi Response
  değil CronKosusu döndürüyor: sonucu ve ayrıntıyı söylemeyen bir çıkış
  derlemede hata veriyor. Rotaların altısı aşkın erken dönüşü var (sunucu
  anahtarı yok, okuma düştü, aday yok) ve bir çıkışta kaydı atlamak işi
  "durmuş" göstermenin en kolay yoluydu — gecikme son BAŞARILI koşmaya
  göre ölçülüyor.
*/
import { createAdminClient } from "./supabase/admin";
import { cronDurumlari, cronSorunlari, cronUyarisi, type CronKaydi, type CronSonucu } from "./cron-isleri";
import { todayInIstanbul } from "./istanbul-date";
import { kurucuyaBildir } from "./kurucu-bildirimi";

export type CronKosusu = {
  yanit: Response;
  sonuc: CronSonucu;
  /** İşin kendi sayaçları; kurum kimliği YAZILMAZ (tablo kiracı verisi tutmuyor). */
  ayrinti?: Record<string, unknown>;
};

async function kaydet(yol: string, basladi: Date, sonuc: CronSonucu, ayrinti: Record<string, unknown>) {
  try {
    const admin = createAdminClient();
    if (!admin) return;
    const { error } = await admin.rpc("platform_cron_kaydet", {
      p_is_adi: yol,
      p_basladi: basladi.toISOString(),
      p_sonuc: sonuc,
      p_ayrinti: ayrinti,
    });
    if (error) {
      console.error("[cron] koşma kaydı yazılamadı", yol, error.message);
      /* Kayıt yazılamadıysa nöbet de tutulmuyor: görünüm bu turun
         satırını görmeyecek ve işin kendisi için yanlış uyarı yazardı. */
      return;
    }
    await nobet(admin);
  } catch (hata) {
    console.error("[cron] koşma kaydı yazılamadı", yol, hata instanceof Error ? hata.message : hata);
  }
}

type Admin = NonNullable<ReturnType<typeof createAdminClient>>;

/*
  NÖBET: her koşu ÖTEKİ işleri de denetliyor ve gecikeni kurucuya
  bildiriyor.

  Kayıt tutmak tek başına yetmiyordu: duran bir işi görmek için Sistem
  Sağlığı ekranını AÇMAK gerekiyor, oysa sorun tam da kimsenin bakmadığı
  zaman ortaya çıkıyor. Kurucu bildirim kanalı (audience = 'founder')
  zil rozetiyle, canlı akışıyla ve liste ekranıyla hazırdı ama hiçbir yer
  satır yazmıyordu — zil hep boştu.

  DENETİMİ HER İŞ YAPIYOR, bir tanesi değil. Günlük hatırlatma işine
  koymak en az iş yapan çözümdü ama ölen iş O olduğunda kimse haber
  vermezdi; iki dakikada bir koşan posta eşitlemesine koymak da onu tek
  dayanak yapardı. Böylece hangi iş ölürse ölsün, ayakta kalan herhangi
  biri ötekileri söylüyor. Bedeli koşu başına iki hafif sorgu: bu işler
  zaten her turda onlarca sorgu atıyor.

  GÜNDE EN FAZLA BİR BİLDİRİM (iş başına). Posta eşitlemesi iki dakikada
  bir koşuyor: anahtarsız bir uyarı aynı arızayı günde 720 kez
  bildirirdi ve zil okunmaz olurdu. Gün anahtarı Türkiye gününe göre
  (AGENTS.md); sorun sürüyorsa ertesi gün yeniden bildiriliyor. Tekrar
  engelinin kendisi lib/kurucu-bildirimi'nde — ikinci bir üretici
  eklenirken o kuralı yeniden kurmak unutulmasın diye.

  Kendi sonucunu da bildiriyor: koşu kaydı az önce yazıldığı için
  görünüm taze satırı görüyor, düşen iş kendi arızasını da söylüyor.
*/
async function nobet(admin: Admin) {
  const { data, error } = await admin
    .from("platform_cron_durumu")
    .select("is_adi,son_calisma,son_basarili,sonuc,sure_ms,ayrinti");
  if (error) {
    console.error("[cron] nöbet okunamadı", error.message);
    return;
  }
  const sorunlar = cronSorunlari(cronDurumlari((data ?? []) as unknown as CronKaydi[], new Date()));
  if (!sorunlar.length) return;

  const gun = todayInIstanbul();
  for (const durum of sorunlar) {
    const { baslik, metin } = cronUyarisi(durum);
    await kurucuyaBildir(admin, {
      kategori: "cron_gecikti",
      anahtar: `cron:${durum.yol}:${durum.durum}:${gun}`,
      baslik,
      metin,
      adres: "/panel/platform/saglik",
      ek: { yol: durum.yol, durum: durum.durum, aralik_dk: durum.aralikDk },
    });
  }
}

/**
 * Rotanın gövdesini sarar: tek çıkış noktasından kayıt yazar.
 *
 * Fırlatma da kaydediliyor ve SONRA yeniden fırlatılıyor: Next'in 500'ü
 * değişmiyor ama iş "hiç koşmamış" görünmüyor — kurucu ekranda hata
 * metnini görüyor.
 *
 * @param yol vercel.json'daki yol; işin kimliği bu (lib/cron-isleri).
 */
export async function cronRotasi(yol: string, govde: () => Promise<CronKosusu>): Promise<Response> {
  const basladi = new Date();
  try {
    const { yanit, sonuc, ayrinti } = await govde();
    await kaydet(yol, basladi, sonuc, ayrinti ?? {});
    return yanit;
  } catch (hata) {
    await kaydet(yol, basladi, "hata", { hata: hata instanceof Error ? hata.message : String(hata) });
    throw hata;
  }
}
