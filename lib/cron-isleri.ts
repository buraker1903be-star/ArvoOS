/*
  ZAMANLANMIŞ İŞLERİN SAĞLIĞI (14.10.2026) — saf kural.

  Ekosistemi beş zamanlanmış iş taşıyor: ortak posta kutularının
  eşitlemesi (iki dakikada bir), ArvoARC ve Arvo Randevu köprülerinin tam
  eşitlemesi (on dakikada), iş adımı terminleri ve abonelik hatırlatması
  (her sabah). Hiçbiri KOŞTUĞUNU kaydetmiyordu: biri sessizce dursa —
  anahtar değişti, dağıtım rotayı kırdı, zamanlayıcı girdisi silindi —
  kurucuya hiçbir yerden haber gitmiyor. Belirti kullanıcıda çıkıyor
  ("postalar gelmiyor"), üstelik ne zaman durduğu da bilinmiyor.

  BEKLENEN ARALIK VERCEL.JSON'DAN TÜRETİLİYOR, elle yazılmıyor. Aynı
  bilgiyi iki yere yazmanın bedeli bu depoda görüldü: posta eşitlemesinin
  rotasındaki yorum "on dakikada bir" diyor, zamanlayıcı ise iki
  dakikada bir çağırıyor — zamanlama 13.10.2026'da sıklaştırıldı, yorum
  kaldı. Bir ekran o yorumu kaynak alsaydı "gecikme yok" derken işin
  beş katı geciktiğini örtecekti.

  Ayrıştırıcı BİLEREK DAR: yalnızca bu depoda kullanılan iki biçimi
  tanıyor — dakika alanı "yıldız bölü N" olan (N dakikada bir) ve dakika
  ile saati sabit olan (her gün). Tanımadığı bir ifadede aralık
  için null dönüyor ve ekran "aralık çıkarılamadı" yazıyor; uydurulmuş
  bir aralıkla "gecikme yok" demekten iyidir. Birim testi
  (tests/unit/cron-isleri.test.ts) vercel.json'daki her girdinin
  ayrıştırılabildiğini sabitliyor: egzotik bir zamanlama eklendiğinde
  test düşüyor, ekran sessizce yanlış söylemiyor.
*/
import vercelConfig from "../vercel.json" with { type: "json" };

export type CronSonucu = "tamam" | "eksik" | "hata";

export type CronIsi = {
  /** vercel.json'daki yol: işin kimliği. Kayıtlar da bu anahtarla yazılıyor. */
  yol: string;
  ad: string;
  aciklama: string;
  zamanlama: string;
  /** Beklenen aralık, dakika. Zamanlama ayrıştırılamazsa null. */
  aralikDk: number | null;
};

/*
  İnsan okunur ad ve "durursa ne olur" cümlesi. Ekranda gecikme uyarısının
  yanında duruyor: kurucu işin adından değil sonucundan karar veriyor.
*/
const TANIM: Record<string, { ad: string; aciklama: string }> = {
  "/api/cron/posta-esitleme": {
    ad: "Posta eşitlemesi",
    aciklama: "Durursa ortak kutulara gelen e-posta panele düşmez.",
  },
  "/api/cron/arc-sync": {
    ad: "ArvoARC köprüsü",
    aciklama: "Durursa ARC'taki kurum, lisans ve personel kopyası eskir.",
  },
  "/api/cron/randevu-sync": {
    ad: "Arvo Randevu köprüsü",
    aciklama: "Durursa Randevu'daki salon ve lisans kopyası eskir.",
  },
  "/api/cron/adim-terminleri": {
    ad: "İş adımı terminleri",
    aciklama: "Durursa yaklaşan ve geçen adım terminleri bildirilmez.",
  },
  "/api/cron/arvolab-kredi": {
    ad: "AI kredisi yüklemesi",
    aciklama: "Durursa ödenen kredi ArvoLab'a yüklenmeden kalır; müşteri ödediği hâlde asistanda durdurulur.",
  },
  "/api/cron/abonelik-hatirlatma": {
    ad: "Abonelik hatırlatması",
    aciklama: "Durursa dönemi dolan kiracıya hatırlatma gitmez ve gecikenler işaretlenmez.",
  },
};

/**
 * Cron ifadesinden beklenen aralığı (dakika) çıkarır. Yalnızca iki biçim:
 * dakika alanı "yıldız bölü N" ise N dakikada bir, dakika ve saat sabitse
 * her gün (1440 dk). Ötekiler için null — uydurulmuş bir aralıkla
 * "gecikme yok" demektense ekran "aralık çıkarılamadı" yazıyor.
 */
export function cronAraligiDk(zamanlama: string): number | null {
  const alanlar = zamanlama.trim().split(/\s+/);
  if (alanlar.length !== 5) return null;
  const [dakika, saat, ayinGunu, ay, haftaninGunu] = alanlar;
  if (ayinGunu !== "*" || ay !== "*" || haftaninGunu !== "*") return null;

  const nDakikada = /^\*\/(\d{1,2})$/.exec(dakika);
  if (nDakikada && saat === "*") {
    const n = Number(nDakikada[1]);
    return n >= 1 && n <= 59 ? n : null;
  }
  if (/^\d{1,2}$/.test(dakika) && /^\d{1,2}$/.test(saat)) return 24 * 60;
  return null;
}

/** vercel.json'daki zamanlanmış işler, beklenen aralıklarıyla. */
export function cronIsleri(): CronIsi[] {
  const crons = (vercelConfig as { crons?: { path: string; schedule: string }[] }).crons ?? [];
  return crons.map((c) => ({
    yol: c.path,
    ad: TANIM[c.path]?.ad ?? c.path.replace("/api/cron/", ""),
    aciklama: TANIM[c.path]?.aciklama ?? "",
    zamanlama: c.schedule,
    aralikDk: cronAraligiDk(c.schedule),
  }));
}

/*
  GECİKME EŞİĞİ = aralık + tolerans, tolerans = aralığın kendisi ama en az
  5, en çok 60 dakika. İki dakikalık işte 7 dakika (bir atlama gürültü
  sayılır), on dakikalıkta 20, günlükte 25 saat. Toleransı aralığın katı
  olarak yazmak günlük işi iki güne kadar sessiz bırakıyordu; sabit bir
  tolerans ise iki dakikalık işi her dağıtımda "gecikti" gösteriyordu.
*/
export function gecikmeEsigiDk(aralikDk: number) {
  return aralikDk + Math.min(60, Math.max(5, aralikDk));
}

export type CronKaydi = {
  /** vercel.json yolu. */
  is_adi: string;
  son_calisma: string;
  son_basarili: string | null;
  sonuc: CronSonucu;
  sure_ms: number | null;
  ayrinti: unknown;
};

export type CronDurumu = CronIsi & {
  /** "hic": kayıt yok · "gecikti": son koşma eşiği aştı · "dustu": son koşma başarısız · "tamam" */
  durum: "hic" | "gecikti" | "dustu" | "tamam";
  sonCalisma: Date | null;
  sonBasarili: Date | null;
  sonSonuc: CronSonucu | null;
  sureMs: number | null;
  gecikmeDk: number | null;
  /** Son koşmanın sayaçları ve hata cümlesi; ekran gecikme satırında gösteriyor. */
  ayrinti: unknown;
};

/*
  KAYIT YOKLUĞU "DURDU" DEMEK DEĞİL. Kayıt tutma bu depoya 14.10.2026'da
  girdi: ondan önce koşan hiçbir iş kayıt yazmadı ve günlük iki iş ilk
  kaydını ertesi sabah yazacak. Kaydı olmayan işi "gecikti" göstermek,
  ekranı açıldığı gün beş kırmızı satırla karşılamak olurdu — ve bir
  sağlık ekranının ilk günden yanlış alarm vermesi, sonraki gerçek
  alarmın da okunmamasına yol açar. "Henüz kaydı yok" nötr durumdur.
*/
export function cronDurumlari(kayitlar: CronKaydi[], simdi: Date): CronDurumu[] {
  const haritada = new Map(kayitlar.map((k) => [k.is_adi, k]));
  return cronIsleri().map((is) => {
    const kayit = haritada.get(is.yol);
    if (!kayit) {
      return { ...is, durum: "hic" as const, sonCalisma: null, sonBasarili: null, sonSonuc: null, sureMs: null, gecikmeDk: null, ayrinti: null };
    }
    const sonCalisma = new Date(kayit.son_calisma);
    const sonBasarili = kayit.son_basarili ? new Date(kayit.son_basarili) : null;
    /* Gecikme SON BAŞARILI koşmaya göre: her on dakikada bir düşen bir iş
       "yeni koştu" diye yeşil görünürdü, oysa iş hiç yapılmıyor. */
    const dayanak = sonBasarili ?? sonCalisma;
    const gecikmeDk = Math.floor((simdi.getTime() - dayanak.getTime()) / 60000);
    const gecikti = is.aralikDk !== null && gecikmeDk > gecikmeEsigiDk(is.aralikDk);
    return {
      ...is,
      durum: gecikti ? ("gecikti" as const) : kayit.sonuc !== "tamam" ? ("dustu" as const) : ("tamam" as const),
      sonCalisma, sonBasarili, sonSonuc: kayit.sonuc, sureMs: kayit.sure_ms, ayrinti: kayit.ayrinti,
      gecikmeDk: Math.max(0, Math.floor((simdi.getTime() - sonCalisma.getTime()) / 60000)),
    };
  });
}

/** Sorunlu işler (ekranda uyarı yazdıracaklar); "henüz kaydı yok" sorun sayılmaz. */
export const cronSorunlari = (durumlar: CronDurumu[]) => durumlar.filter((d) => d.durum === "gecikti" || d.durum === "dustu");

/** "2 dakikada bir" / "her gün" — ekran ve bildirim aynı cümleyi kuruyor. */
export const cronAralikMetni = (dk: number | null) =>
  dk === null ? "aralık çıkarılamadı" : dk >= 24 * 60 ? "her gün" : `${dk} dakikada bir`;

/*
  Kurucuya gidecek uyarının metni. Saat yazılmıyor, GEÇEN SÜRE yazılıyor:
  bildirim telefonda saatler sonra okunabiliyor ve "17:50'de düştü" o anda
  ne kadar eski olduğunu söylemiyor. Gövdenin ilk cümlesi "durursa ne olur"
  — kurucu işin adından değil sonucundan karar veriyor.
*/
export function cronUyarisi(durum: CronDurumu): { baslik: string; metin: string } {
  const sure = (dk: number | null) =>
    dk === null ? "bilinmiyor"
      : dk < 60 ? `${dk} dakika`
      : dk < 48 * 60 ? `${Math.floor(dk / 60)} saat`
      : `${Math.floor(dk / 1440)} gün`;
  const basariliDk = durum.sonBasarili
    ? Math.floor((Date.now() - durum.sonBasarili.getTime()) / 60000)
    : null;
  return {
    baslik: durum.durum === "gecikti" ? `${durum.ad} gecikti` : `${durum.ad} düştü`,
    metin: durum.durum === "gecikti"
      ? `${durum.aciklama} Beklenen: ${cronAralikMetni(durum.aralikDk)}. ` +
        (durum.sonBasarili
          ? `En son başarılı koşma ${sure(basariliDk)} önce.`
          : "Hiç başarılı koşması yok.")
      : `${durum.aciklama} Son koşma hata verdi.`,
  };
}
