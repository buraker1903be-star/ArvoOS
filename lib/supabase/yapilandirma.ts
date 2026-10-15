/*
  SUPABASE BAĞLANTI BİLGİSİ VAR MI? (15.10.2026)

  Anahtarlar her yerde `process.env.NEXT_PUBLIC_SUPABASE_URL!` kalıbıyla
  okunuyordu. Eksik olduklarında `createServerClient` fırlatıyor; ara
  katmanda bu, eşleştiği HER yolun 500 vermesi demekti — oturum
  gerektirmeyen pazarlama sayfaları, SEO dosyaları ve /login dahil. Yani
  tek bir eksik değişken bütün siteyi kapatıyordu, oysa AGENTS.md'nin
  kuralı bunun tersi: eksik ortam değişkeni uygulamayı düşürmez, ilgili
  özelliği kapalı gösterir ve nedenini kullanıcıya yazar.

  Karar tek yerde: dört çağıran (ara katman, giriş işlemi, giriş markası,
  şifre oluşturma ekranı) aynı soruyu soruyor ve aynı cevabı almalı.
  İkisi ayrışırsa, biri "ayarlı" deyip istemci kurmaya kalkarken öteki
  "ayarsız" diye atlar.

  Değerleri birlikte döndürüyor: çağıranın ayrıca `!` ile okumasına gerek
  kalmasın, yani bu denetim ile istemcinin kurulduğu satır arasında
  anahtarın varlığı konusunda ikinci bir varsayım doğmasın.
*/
export function supabaseAyarlari(): { adres: string; anahtar: string } | null {
  const adres = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anahtar = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  return adres && anahtar ? { adres, anahtar } : null;
}
