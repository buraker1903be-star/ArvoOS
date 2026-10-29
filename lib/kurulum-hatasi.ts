/*
  KURULUM HATASININ TÜRKÇESİ (30.10.2026).

  Yeni müşteri sihirbazı düşen kurulumu olduğu gibi ekrana yazıyordu:
  kenar fonksiyonu Postgres'in mesajını aynen döndürüyor, konsol da
  onu "Kurum oluşturulamadı: …" cümlesinin arkasına yapıştırıyor.
  Kurucunun gördüğü:

    Kurum oluşturulamadı: duplicate key value violates unique
    constraint "organizations_slug_key"

  Bu cümle ne olduğunu söylüyor ama NE YAPILACAĞINI söylemiyor — hem
  de ilk gerçek müşterinin açıldığı anda. Sihirbaz kısa ad çakışmasını
  formda zaten denetliyor; buraya düşen hâller sayfanın açıldığı andan
  sonra oluşanlar: aynı anda açılan ikinci kurum, aynı e-postaya
  verilmiş açık davet, başka kuruma bağlanmış alan adı.

  BİLİNMEYEN HATA GİZLENMİYOR. Tanınmayan mesaj olduğu gibi
  gösteriliyor: anlaşılmaz bir cümle, yanlış bir cümleden iyidir ve
  ekran görüntüsü kurucudan bize gelen tek kanıt.

  Saf modül; testi tests/unit/kurulum-hatasi.test.ts.
*/

type Kural = { desen: RegExp; cumle: string };

/* Sıra önemli: alan adı kısıtı da "duplicate key" içeriyor, önce o
   bakılıyor ki genel kural onu yutmasın. */
const KURALLAR: Kural[] = [
  {
    desen: /organizations_slug_key|unique constraint.*slug/i,
    cumle: "Bu kısa ad başka bir kurumda kullanılıyor. Kısa adı değiştirip tekrar deneyin.",
  },
  {
    desen: /organizations_custom_domain_key|unique constraint.*custom_domain/i,
    cumle: "Bu alan adı başka bir kuruma bağlı. Alan adını boş bırakıp kurulumu tamamlayın, sonra Kurum ayarlarından bağlayın.",
  },
  {
    desen: /organization_invitations_organization_id_email_key|unique constraint.*invitation/i,
    cumle: "Bu e-posta adresine bu kurumda zaten açık bir davet var. Kurulumlar ekranından daveti iptal edip yeniden gönderin.",
  },
  {
    /* Supabase Auth: e-posta başka bir hesapta kayıtlı. */
    desen: /user already registered|email.*already.*(registered|exists)/i,
    cumle: "Bu e-posta adresiyle açılmış bir hesap var. Kişi mevcut şifresiyle giriş yapabilir; kurulumu başka bir yönetici e-postasıyla tamamlayın.",
  },
  {
    desen: /row-level security|permission denied/i,
    cumle: "Bu işlem için yetki reddedildi. Kurucu hesabıyla giriş yaptığınızdan emin olun; sorun sürerse Sistem sağlığı ekranına bakın.",
  },
  {
    /* Sunucu anahtarı yoksa kenar fonksiyonu hiç başlamıyor. */
    desen: /service role|SUPABASE_SERVICE_ROLE|secret key/i,
    cumle: "Sunucu anahtarı tanımlı olmadığı için kurulum başlatılamadı (Sistem ayarları → Güvenlik).",
  },
];

/**
 * Ham hata mesajını kurucunun okuyacağı cümleye çevirir.
 * Tanınmayan mesaj OLDUĞU GİBİ döner.
 */
export function kurulumHatasiCumlesi(ham: string): string {
  const metin = (ham ?? "").trim();
  if (!metin) return "Kurulum tamamlanamadı; sebebi sunucudan gelmedi.";
  return KURALLAR.find((k) => k.desen.test(metin))?.cumle ?? metin;
}

/** Tanınan bir hata mı — ekran ham metni ayrıca göstersin mi diye. */
export const kurulumHatasiTaninir = (ham: string) => KURALLAR.some((k) => k.desen.test(ham ?? ""));
