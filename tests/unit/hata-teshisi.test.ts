import assert from "node:assert/strict";
import test from "node:test";
import { hataTeshisi } from "@/lib/hata-teshisi";

/* Hata teşhisi (lib/hata-teshisi.ts, 02.11.2026). Gerçekte görülen metinlerle. */
const tur = (m: string | null) => hataTeshisi(m)?.tur ?? null;

test("bilinen hatalar doğru türe düşer", () => {
  assert.equal(tur("Could not find the table 'public.hr_hakedisler' in the schema cache"), "migration-tablo");
  assert.equal(tur("PGRST205"), "migration-tablo");
  assert.equal(tur('column "closed_at" does not exist'), "migration-sutun");
  assert.equal(tur("function public.platform_tahsilat_aylik(integer) does not exist"), "migration-islev");
  assert.equal(tur("permission denied for table user_presence"), "veritabani-yetkisi");
  assert.equal(tur("ARC köprüsü 401 döndü"), "kimlik");
  assert.equal(tur("Bağlanılamadı: fetch failed"), "ulasilamadi");
  assert.equal(tur("The operation was aborted due to timeout"), "zaman-asimi");
  assert.equal(tur("429 Too Many Requests"), "hiz-siniri");
  assert.equal(tur("E-posta gönderimi ayarlı değil (RESEND_API_KEY tanımlı değil)."), "eposta-anahtari");
  assert.equal(tur("invalid_grant: Token has been expired or revoked."), "posta-baglantisi");
  assert.equal(tur('new row violates check constraint "platform_duyurulari_hedef_check"'), "kisit");
  assert.equal(tur("Tanımlı olmayan değişkenler: ARC_BRIDGE_URL"), "ayar-eksik");
  assert.equal(tur("502 Bad Gateway"), "karsi-sunucu");
  // Sistem sağlığının köprü satırlarındaki kendi cümleleri de tanınıyor.
  assert.equal(tur("Tanımsız değişken: RANDEVU_BRIDGE_SECRET"), "ayar-eksik");
  assert.equal(tur("Anahtar eksik ya da iki tarafta farklı"), "kimlik");
  assert.equal(tur("ArvoLab ArvoOS'a ulaşamıyor"), "ulasilamadi");
});

test("özel kural genel kuraldan önce: Resend 401 genel yetki hatası sayılmaz", () => {
  assert.equal(tur("Resend: 401 API key is invalid"), "eposta-anahtari");
});

test("tanınmayan ya da boş metin teşhis uydurmaz", () => {
  assert.equal(tur("beklenmedik bir şey oldu"), null);
  assert.equal(tur(""), null);
  assert.equal(tur(null), null);
});
