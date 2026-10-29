import type { DirectoryRow } from "@/lib/member-directory";
import { productName } from "@/lib/products";
import { formatPersonName } from "@/lib/format-name";
import { roleNames } from "../../hr/role-names";

/*
  Kullanıcılar listesi ile kişi sayfasının ORTAK kişi modeli (29.10.2026,
  kişi sayfası eklenirken page.tsx'ten taşındı). İki ekran aynı kişiyi
  aynı kurala göre birleştirmeli: biri e-postayla, öteki kimlikle
  birleştirseydi listede tek görünen kişi sayfada iki parça olurdu.
*/

/*
  Pasifliğin sebebi. Sıra önemli: en DAR açıklama kazanıyor. Kurumu
  pasife aldıysa lisans da askıda olabilir; kurucuya söylenmesi gereken
  ilk şey kişiye özel olanıdır.
*/
export function pasiflikSebebi(satir: DirectoryRow): string {
  if (satir.membershipActive === false) return "Kurum pasife aldı";
  const durum = (satir.status ?? "").toLocaleLowerCase("tr-TR");
  if (durum.includes("suspend") || durum.includes("askı")) return "Lisans askıya alındı";
  if (durum.includes("past_due") || durum.includes("gecik")) return "Ödeme gecikti";
  if (durum.includes("cancel") || durum.includes("iptal")) return "Abonelik iptal edildi";
  if (durum.includes("lisans yok") || durum.includes("abonelik yok")) return "Lisans/abonelik yok";
  if (satir.periodEnd && Date.parse(satir.periodEnd) < Date.now()) return "Dönem doldu";
  return "Erişim kapalı";
}

/*
  KİŞİ BAŞINA TEK SATIR (14.10.2026, "tablo çok kötü gözüküyor"). Eskiden
  satır kişi × kurumdu: üç kurumda olan kurucu üç ayrı satırda, sağda üç
  ayrı ham rol koduyla ("owner", "system_admin") görünüyordu. Şimdi kişi
  bir kez; kurumları satırın altında rozet (kurum · ürünler), erişimi açık
  olan kurum yeşil, kapalı olan soluk. Sağda kişinin EN YETKİLİ rolü
  Türkçe adıyla ve kaç kurumda olduğu.

  Kişi e-postaya göre birleşiyor: ArvoLab'ın kullanıcı kimliği ArvoOS'unkiyle
  aynı değil (lib/member-directory'deki kuralın aynısı).
*/
/** rol: kurumdaki ArvoOS rolü; yoksa (yalnızca ArvoLab'daysa) ArvoLab rolü — rolUrunu hangisi olduğunu söyler. */
export type Uyelik = { kapsam: string; urunler: string[]; rol: string | null; rolUrunu: string | null; acik: boolean; sebep: string | null; bireysel: boolean };
export type Kisi = {
  anahtar: string;
  ad: string;
  email: string | null;
  telefon: string | null;
  unvan: string | null;
  uyelikler: Uyelik[];
  /** Bir kurumda bile girebiliyorsa AKTİF; pasif = hiçbir yere giremiyor. */
  acik: boolean;
  sebep: string | null;
  bireysel: boolean;
  /*
    Kişi sayfasının adresi (/panel/platform/kullanicilar/<kimlik>). E-posta
    adrese yazılmıyor: adres sunucu günlüğüne, tarayıcı geçmişine ve
    paylaşılan ekran görüntüsüne düşüyor. ArvoOS kimliği varsa o (kişinin
    asıl hesabı), yoksa ilk satırın kimliği (yalnızca ArvoLab'daysa).
  */
  kimlik: string;
  /** Kişiyi oluşturan bütün ürün satırları: kişi sayfası bunları tek tek gösteriyor. */
  satirlar: DirectoryRow[];
};

/*
  ROL = KURUMDAKİ ArvoOS ROLÜ, panelin kendi adıyla (app/panel/hr/role-names).
  İlk sürümde (14.10.2026) "en yetkili rol" ArvoOS ve ArvoLab rolleri
  arasından seçiliyordu: ArvoLab'da teknik olarak "system_admin" olan
  Gizem Atar, panelde Operasyon Personeli iken "Sistem yöneticisi"
  görünüyordu (kurum sahibi düzeltti). İki ürünün rolleri aynı şeyi
  anlatmıyor; kişinin kurumdaki görevi ArvoOS rolü. ArvoLab rolü yalnızca
  kişinin hiç ArvoOS üyeliği yoksa yazılıyor, kendi adlarıyla.
*/
const ARVOOS_ROL_SIRASI = ["owner", "admin", "manager", "operasyoncu", "member"];
const ARVOLAB_ROL_ADI: Record<string, string> = {
  founder: "Kurucu", system_admin: "Sistem yöneticisi", academic_manager: "Akademik yönetici",
  controller: "Kontrolör", expert: "Uzman", client: "Üye / öğrenci",
};
export const rolAdi = (rol: string | null, urun: string | null) => {
  if (!rol) return "—";
  const ad = urun === "arvoos" ? roleNames[rol] : ARVOLAB_ROL_ADI[rol];
  return ad ?? rol.replace(/_/g, " ").replace(/^./, (h) => h.toLocaleUpperCase("tr-TR"));
};
const arvoosSirasi = (rol: string | null) => {
  const i = ARVOOS_ROL_SIRASI.indexOf(rol ?? "");
  return i < 0 ? ARVOOS_ROL_SIRASI.length : i;
};

export function kisilereTopla(satirlar: DirectoryRow[]): Kisi[] {
  const harita = new Map<string, Kisi>();
  for (const satir of satirlar) {
    const anahtar = satir.email?.toLocaleLowerCase("tr-TR") ?? `uid:${satir.userId}`;
    const urun = productName(satir.product as Parameters<typeof productName>[0]);
    let kisi = harita.get(anahtar);
    if (!kisi) {
      kisi = {
        anahtar,
        ad: formatPersonName(satir.name) || satir.email || "Adsız kullanıcı",
        email: satir.email, telefon: satir.phone, unvan: satir.title,
        uyelikler: [], acik: false, sebep: null, bireysel: false, kimlik: satir.userId, satirlar: [],
      };
      harita.set(anahtar, kisi);
    }
    // Adı olan kayıt adsız olanı ezer (ArvoLab satırında ad boş olabiliyor).
    if (kisi.ad === kisi.email && satir.name) kisi.ad = formatPersonName(satir.name) || kisi.ad;
    kisi.satirlar.push(satir);
    if (satir.product === "arvoos" && !kisi.satirlar.some((x) => x !== satir && x.product === "arvoos")) kisi.kimlik = satir.userId;
    kisi.telefon ??= satir.phone;
    kisi.unvan ??= satir.title;

    const kapsam = satir.individual ? "Bireysel" : satir.scope;
    let uyelik = kisi.uyelikler.find((u) => u.kapsam === kapsam);
    if (!uyelik) {
      uyelik = { kapsam, urunler: [], rol: null, rolUrunu: null, acik: false, sebep: null, bireysel: satir.individual };
      kisi.uyelikler.push(uyelik);
    }
    if (!uyelik.urunler.includes(urun)) uyelik.urunler.push(urun);
    /* ArvoOS rolü her zaman kazanır; öteki ürünün rolü yalnızca boşluğu doldurur. */
    if (satir.role && (satir.product === "arvoos" || (uyelik.rolUrunu !== "arvoos" && !uyelik.rol))) {
      uyelik.rol = satir.role;
      uyelik.rolUrunu = satir.product;
    }
    /* Bir üründe bile girebiliyorsa o kurumda açık. */
    if (satir.access) { uyelik.acik = true; uyelik.sebep = null; }
    else if (!uyelik.acik) uyelik.sebep = pasiflikSebebi(satir);
  }
  for (const kisi of harita.values()) {
    kisi.acik = kisi.uyelikler.some((u) => u.acik);
    kisi.sebep = kisi.acik ? null : kisi.uyelikler.find((u) => u.sebep)?.sebep ?? "Erişim kapalı";
    kisi.bireysel = kisi.uyelikler.every((u) => u.bireysel);
    kisi.uyelikler.sort((a, b) => Number(b.acik) - Number(a.acik) || a.kapsam.localeCompare(b.kapsam, "tr-TR"));
  }
  return [...harita.values()].sort((a, b) => a.ad.localeCompare(b.ad, "tr-TR"));
}

/** Kişinin rolü: ArvoOS üyeliği varsa kurumları arasındaki en yetkili ArvoOS rolü, yoksa ilk ürün rolü. */
export const kisininRolu = (kisi: Kisi) => {
  const arvoos = kisi.uyelikler.filter((u) => u.rolUrunu === "arvoos").sort((a, b) => arvoosSirasi(a.rol) - arvoosSirasi(b.rol))[0];
  const secilen = arvoos ?? kisi.uyelikler.find((u) => u.rol) ?? null;
  return rolAdi(secilen?.rol ?? null, secilen?.rolUrunu ?? null);
};
