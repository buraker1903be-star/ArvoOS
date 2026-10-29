import { isManagementDepartmentName } from "@/lib/management-department";
import { departmanTuru } from "@/lib/yetki-profilleri";

/*
  DEPARTMAN KURALLARI (29.10.2026) — saf.

  Departmanın ADI yetki taşıyor: adı "Yönetim/Yönetici" ile başlayan
  departmandaki aktif personel Kurum Sahibi sayılıyor
  (lib/management-department.ts, veritabanında
  private.arvo_is_management_department); "Satış"/"Operasyon" geçen
  departmana o alanın müdür profili uygulanabiliyor (lib/yetki-profilleri).

  Personeli yönetim departmanına almak yalnızca Kurum Sahibi'nin işi
  (tetikleyici: arvo_employee_management_guard). Ama o tetikleyici
  PERSONELİN departmanı değişince çalışıyor; departmanın ADINI
  "Satış"tan "Yönetim"e çevirmek içindeki herkesi aynı sonuca götürür
  ve tetikleyiciye hiç uğramaz. Yeniden adlandırma bu yüzden aynı
  kurala bağlı: yönetim adına giren ya da çıkan değişikliği yalnızca
  Kurum Sahibi yapar.

  Testi tests/unit/departman-kurali.test.ts.
*/

export function adDegisikligiEngeli(eskiAd: string, yeniAd: string, kurumSahibi: boolean): string | null {
  if (kurumSahibi) return null;
  const once = isManagementDepartmentName(eskiAd);
  const sonra = isManagementDepartmentName(yeniAd);
  if (once === sonra) return null;
  return sonra
    ? "Bir departmanı yönetim departmanına çevirmek içindeki herkesi Kurum Sahibi yapar; bunu yalnızca Kurum Sahibi yapabilir."
    : "Yönetim departmanının adını değiştirmek içindeki kişilerin Kurum Sahibi yetkisini kaldırır; bunu yalnızca Kurum Sahibi yapabilir.";
}

export type DepartmanTipi = { tur: "yonetim" | "satis" | "operasyon" | "genel"; etiket: string; aciklama: string };

/** Kartta gösterilen tür: adın taşıdığı anlam, kullanıcıya açık yazılsın. */
export function departmanTipi(ad: string): DepartmanTipi {
  if (isManagementDepartmentName(ad)) return { tur: "yonetim", etiket: "Yönetim", aciklama: "Aktif personeli Kurum Sahibi yetkisiyle çalışır" };
  const tur = departmanTuru(ad);
  if (tur === "satis") return { tur: "satis", etiket: "Satış", aciklama: "Personeline Satış Müdürü profili uygulanabilir" };
  if (tur === "operasyon") return { tur: "operasyon", etiket: "Operasyon", aciklama: "Personeline Operasyon Müdürü profili uygulanabilir" };
  return { tur: "genel", etiket: "Genel", aciklama: "Adına göre özel bir yetki taşımaz" };
}
