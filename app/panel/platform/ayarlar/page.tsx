import { konsolAlaniniAc } from "../konsol-alani";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { mesajAyarlari } from "@/lib/platform-mesaj-ayarlari";
import { paymentCredentialsConfigured } from "@/lib/payment-credentials";
import { getPaytrStatus } from "@/lib/paytr-status";
import { pushYapilandi } from "@/lib/anlik-bildirim-gonder";
import { getArvolabBridgeHealth } from "@/lib/arvolab";
import { getArcBridgeHealth } from "@/lib/arc-bridge";
import { getRandevuBridgeHealth } from "@/lib/randevu-bridge";
import { KNot } from "../konsol-ui";
import { konsolKaydiCumlesi } from "@/lib/konsol-degisiklik";
import { alanAdi, KONSOL_ALANLARI } from "@/lib/konsol-alanlari";
import { kurucuAlanlariniKaydet } from "./actions";
import { basHarfleri, KURULUM_ADI, KURULUM_ISLEMI, para, tarihSaat } from "../bicim";
import { MobilSatir } from "../../crm/table-cells";
import { TalepAkis } from "../../crm/kayit-detay/kayit-akis";
import { IstatistikKarti } from "../../crm/istatistik-karti";
import { roleNames } from "../../hr/role-names";
import "../platform.css";
import "../../hr/hr.css";
import "../../crm/crm.css";
import "../../crm/kayit-detay/kayit-detay.css";
import "../finans.css";

/*
  SİSTEM AYARLARI (14.10.2026, Kurucu Konsolu'nun ana menüsü).

  Üç bölüm (02.11.2026'ya kadar dört: Entegrasyonlar ve Güvenlik ayrıydı,
  ikisi de "hangi anahtar tanımlı" sorusunun yanıtıydı ve birleşti),
  hepsi GERÇEK durumdan okunuyor:

    1. Kurucu yetkileri — konsola kim girebiliyor. Kural tek: ArvoOS'un
       kendi kurumunun (slug arvo-os) etkin Kurum Sahibi (uygulamada
       panel-context isPlatformOwner, veritabanında
       private.is_arvoos_founder). 02.11.2026'ya kadar kademeli rol yoktu;
       artık tam yetkili kurucu ötekileri alanlara sınırlayabiliyor
       (lib/konsol-alanlari, platform_kurucu_alanlari).
    2. Bağlantılar ve sırlar — üstte entegrasyonlar: ödeme, WhatsApp, anlık bildirim, ürün köprüleri,
       e-fatura. Ortam değişkenlerinin yalnızca VAR/YOK bilgisi okunuyor,
       değeri asla (AGENTS.md: sırlar NEXT_PUBLIC_ ile başlamaz, ekrana da
       çıkmaz).
       Altta sunucu sırlarının tanımlı olup olmadığı ve yetkinin nerede
       uygulandığı. Sistem sağlığının "Platform ayarları" sekmesi de buraya
       katıldı (eksik ayarın bedeli ve son posta gönderim hatası).
    3. İşlem kayıtları — kurucu işlemlerinin tek akışı: kurulum adımları,
       ödeme ve sözleşme kararları, fiyat değişiklikleri, üye erişimi.
       Lisans, modül ve kurum ayarı düzenlemeleri 02.11.2026'ya kadar
       kayıt bırakmıyordu (yalnızca updated_by); artık "önce → sonra"
       ile yazılıyor (app/panel/platform/konsol-kaydi.ts).

  Sistem Sağlığı (köprü kopyaları, kota, kurulum hataları) bu menünün
  alt bölümü; ayrıntı orada.
*/

/* Durum rozetinin tonları (panelin status-pill data-tone değerleri). */
type Ton = "success" | "warning" | "danger" | "info" | "neutral";
/* "hata": anahtar tanımlı ama son gönderim düştü — ekranın yeşili işin
   yapıldığı anlamına gelmeli. bedel: eksikken ne OLMADIĞI. */
type Entegrasyon = { ad: string; grup: string; durum: "bagli" | "eksik" | "hata" | "yok"; not: string; bedel?: string; hata?: string };
type Kayit = { anahtar: string; zaman: string; tur: string; ton: Ton; ne: string; kim: string | null };

const var_ = (ad: string) => Boolean(process.env[ad]);

/*
  TEK EKRAN (14.10.2026, "kompakt, sade, premium"): dört bölüm alt alta
  2.600 piksel tutuyordu. Artık özet şeridindeki dört sayı aynı zamanda
  sekme (?bolum=); her seferinde tek bölüm açık, sayfa İşler gibi tek ekran.
*/
const BOLUMLER = ["yetkiler", "baglantilar", "kayitlar"] as const;
type Bolum = (typeof BOLUMLER)[number];
/* Eski bölüm adları (dock, yer imleri, bildirimler) birleşik bölümü açar. */
const ESKI_BOLUM: Record<string, Bolum> = { entegrasyonlar: "baglantilar", guvenlik: "baglantilar" };

export default async function SistemAyarlariPage({ searchParams }: { searchParams: Promise<{ bolum?: string; tur?: string }> }) {
  const { bolum: istenen, tur: istenenTur } = await searchParams;
  const bolum: Bolum = (BOLUMLER as readonly string[]).includes(istenen ?? "") ? (istenen as Bolum) : ESKI_BOLUM[istenen ?? ""] ?? "baglantilar";
  const sekme = (kod: Bolum) => ({ className: bolum === kod ? "is-active" : undefined });
  const sekmeBag = (kod: Bolum) => ({ href: `/panel/platform/ayarlar?bolum=${kod}`, "aria-current": bolum === kod ? ("page" as const) : undefined });
  const { supabase, isPlatformOwner, konsolKapsami, organization, userId } = await getPanelContext();
  if (!isPlatformOwner) notFound();
  konsolAlaniniAc(konsolKapsami, "sistem");
  const admin = createAdminClient();

  const [uyelikSonucu, paytr, arvolab, arc, randevu, kapsamSonucu] = await Promise.all([
    supabase.from("organization_memberships").select("user_id,role,is_active").eq("organization_id", organization.id),
    getPaytrStatus(organization.id),
    getArvolabBridgeHealth(),
    getArcBridgeHealth(),
    getRandevuBridgeHealth(),
    /* Kademeli kurucu yetkisi (02.11.2026): satırı olmayan tam yetkili. */
    supabase.from("platform_kurucu_alanlari").select("user_id,alanlar"),
  ]);
  /* Tablo henüz yoksa (migration öncesi) herkes tam yetkili ve düzenleme
     kapalı; başka bir hata ekranda yazıyor — "herkes tam yetkili" demek
     okunamamış bir kısıtı gizlemek olurdu. */
  const kapsamTablosuYok = kapsamSonucu.error?.code === "42P01" || kapsamSonucu.error?.code === "PGRST205";
  const kapsamHatasi = kapsamSonucu.error && !kapsamTablosuYok ? kapsamSonucu.error.message : null;
  const kurucuAlanlari = new Map(((kapsamSonucu.data ?? []) as { user_id: string; alanlar: string[] }[]).map((k) => [k.user_id, k.alanlar]));
  const tamYetkili = konsolKapsami === null;
  if (uyelikSonucu.error) throw new Error("Konsol üyeleri okunamadı: " + uyelikSonucu.error.message);
  const uyeler = (uyelikSonucu.data ?? []) as { user_id: string; role: string; is_active: boolean }[];
  const kurucular = uyeler.filter((u) => u.role === "owner" && u.is_active).map((u) => u.user_id);
  /* Profil adı boş olabiliyor (davetle gelen hesap); kurumun personel
     kaydındaki ad yedek. */
  // hata-tamam: kurucu adlarının eşlemesi; düşerse ad yerine e-posta/kimlik görünür, kurucu SAYISI üyelik sorgusundan geliyor
  const { data: calisanlar } = await supabase.from("hr_employees").select("user_id,full_name").eq("organization_id", organization.id).not("user_id", "is", null);
  const calisanAdi = new Map(((calisanlar ?? []) as { user_id: string; full_name: string }[]).map((c) => [c.user_id, c.full_name]));

  /* İşlem kayıtları: her kaynaktan son otuz, birleşik akışta son altmış.
     Kurulum günlüğü ve üye erişimi yalnızca sunucu anahtarıyla okunuyor;
     anahtar yoksa bölüm "okunamadı" diyor, boş liste göstermiyor. */
  const SON = 30;
  const [kurulum, erisim, fiyat, odeme, sozlesme] = admin ? await Promise.all([
    admin.from("provisioning_audit_logs").select("id,organization_id,actor_user_id,action,state,result,created_at").order("created_at", { ascending: false }).limit(SON),
    /* Yalnızca KONSOLUN yazdığı kayıtlar (metadata.by = founder_console).
       Kurucunun kiracı panelindeki günlük işleri (adım atama vb.) de
       activity_logs'a düşüyor; onlar konsol işlemi değil. */
    admin.from("activity_logs").select("id,organization_id,actor_user_id,action,entity_type,metadata,created_at").eq("metadata->>by", "founder_console").order("created_at", { ascending: false }).limit(SON),
    admin.from("platform_fiyat_gecmisi").select("id,kod,islem,yeni_kurus,kim,zaman").order("id", { ascending: false }).limit(SON),
    admin.from("organization_payment_requests").select("id,organization_id,status,amount,currency,payment_method,reviewed_by,reviewed_at").not("reviewed_by", "is", null).order("reviewed_at", { ascending: false }).limit(SON),
    admin.from("platform_subscription_requests").select("id,customer_name,contract_no,status,reviewed_by,reviewed_at").not("reviewed_at", "is", null).order("reviewed_at", { ascending: false }).limit(SON),
  ]) : [null, null, null, null, null];

  /*
    "TANIMLI" İLE "ÇALIŞIYOR" AYNI ŞEY DEĞİL (Sistem sağlığından taşındı,
    02.11.2026). Ortam değişkeninin varlığı iptal edilmiş bir anahtarı da
    "Bağlı" gösterir. Tek gerçek kanıt YAPILMIŞ bir gönderim: otomatik
    proforma her denemenin sonucunu satıra yazıyor, en yeni hata buradan.
  */
  const postaHatasi = admin
    ? await admin.from("platform_proformalari")
        .select("proforma_no,gonderim_hatasi,duzenleme_tarihi")
        .not("gonderim_hatasi", "is", null)
        .order("duzenleme_tarihi", { ascending: false })
        .limit(1)
    : null;
  const sonPostaHatasi = ((postaHatasi?.data ?? []) as { proforma_no: string | null; gonderim_hatasi: string }[])[0] ?? null;

  /* Okunamayan gönderim kaydı "gönderim sorunsuz" değil: Dikkat listesinde yazar. */
  const postaOkunamadi = postaHatasi?.error?.message ?? null;
  const okumaHatalari = [kurulum, erisim, fiyat, odeme, sozlesme].flatMap((s) => (s?.error ? [s.error.message] : []));
  const kisiIdleri = new Set<string>(kurucular);
  const kurumIdleri = new Set<string>();
  for (const s of (kurulum?.data ?? []) as { actor_user_id: string | null; organization_id: string | null }[]) {
    if (s.actor_user_id) kisiIdleri.add(s.actor_user_id);
    if (s.organization_id) kurumIdleri.add(s.organization_id);
  }
  for (const s of (erisim?.data ?? []) as { actor_user_id: string | null; organization_id: string }[]) { if (s.actor_user_id) kisiIdleri.add(s.actor_user_id); kurumIdleri.add(s.organization_id); }
  for (const s of (fiyat?.data ?? []) as { kim: string | null }[]) if (s.kim) kisiIdleri.add(s.kim);
  for (const s of (odeme?.data ?? []) as { reviewed_by: string | null; organization_id: string }[]) { if (s.reviewed_by) kisiIdleri.add(s.reviewed_by); kurumIdleri.add(s.organization_id); }
  for (const s of (sozlesme?.data ?? []) as { reviewed_by: string | null }[]) if (s.reviewed_by) kisiIdleri.add(s.reviewed_by);

  // hata-tamam: ikisi de yalnızca AD eşlemesi (işlem kaydında kim/hangi kurum);
  // düşerse ad yerine kimlik görünür, işlem kaydının kendisi yerinde kalır.
  const [{ data: kisiler }, { data: kurumlar }] = await Promise.all([
    kisiIdleri.size ? (admin ?? supabase).from("profiles").select("id,full_name").in("id", [...kisiIdleri]) : Promise.resolve({ data: [] }),
    kurumIdleri.size ? supabase.from("organizations").select("id,name,display_name").in("id", [...kurumIdleri]) : Promise.resolve({ data: [] }),
  ]);
  const kisiAdi = new Map(((kisiler ?? []) as { id: string; full_name: string | null }[]).map((k) => [k.id, k.full_name || "—"]));
  const kurumAdi = new Map(((kurumlar ?? []) as { id: string; name: string; display_name: string | null }[]).map((k) => [k.id, k.display_name || k.name]));
  const kim = (id: string | null) => (id ? kisiAdi.get(id) ?? "—" : null);

  const kayitlar: Kayit[] = [
    ...((kurulum?.data ?? []) as { id: string; organization_id: string | null; actor_user_id: string | null; action: string; state: string; result: string; created_at: string }[]).map((s) => ({
      anahtar: `kurulum-${s.id}`, zaman: s.created_at, tur: "Kurulum", ton: (s.result === "failed" ? "danger" : s.result === "success" ? "success" : "info") as Ton,
      ne: `${s.organization_id ? kurumAdi.get(s.organization_id) ?? "Kurum" : "Kurum"} · ${KURULUM_ISLEMI[s.action] ?? s.action} · ${KURULUM_ADI[s.state] ?? s.state}${s.result === "failed" ? " · HATA" : ""}`,
      kim: kim(s.actor_user_id),
    })),
    /* Konsolun activity_logs kayıtları: üye erişimi ve 02.11.2026'dan beri
       lisans, modül, köprü ve kurum ayarı değişiklikleri ("önce → sonra"). */
    ...((erisim?.data ?? []) as { id: number; organization_id: string; actor_user_id: string | null; action: string; entity_type: string; metadata: Record<string, unknown> | null; created_at: string }[]).map((s) => {
      const c = konsolKaydiCumlesi(s);
      const uyelik = s.entity_type === "organization_membership";
      return {
        anahtar: `erisim-${s.id}`, zaman: s.created_at, tur: uyelik ? "Üye erişimi" : "Lisans ve ayar", ton: c.ton as Ton,
        ne: [kurumAdi.get(s.organization_id) ?? "Kurum", c.olay, c.ayrinti].filter(Boolean).join(" · "), kim: kim(s.actor_user_id),
      };
    }),
    ...((fiyat?.data ?? []) as { id: number; kod: string; islem: string; yeni_kurus: number | null; kim: string | null; zaman: string }[]).map((s) => ({
      anahtar: `fiyat-${s.id}`, zaman: s.zaman, tur: "Fiyat", ton: (s.islem === "yayim" ? "success" : "neutral") as Ton,
      ne: `${s.kod} · ${({ taslak: "taslak", taslak_iptal: "taslak geri alındı", yayim: "yayımlandı", koda_donus: "koda döndü" } as Record<string, string>)[s.islem] ?? s.islem}${s.yeni_kurus !== null && s.islem !== "koda_donus" ? ` · ${para(Number(s.yeni_kurus))}` : ""}`,
      kim: kim(s.kim),
    })),
    ...((odeme?.data ?? []) as { id: string; organization_id: string; status: string; amount: number; currency: string; reviewed_by: string | null; reviewed_at: string | null }[]).map((s) => ({
      anahtar: `odeme-${s.id}`, zaman: s.reviewed_at ?? "", tur: "Ödeme kararı", ton: (s.status === "approved" ? "success" : "danger") as Ton,
      ne: `${kurumAdi.get(s.organization_id) ?? "Kurum"} · ${para(Number(s.amount), s.currency)} · ${s.status === "approved" ? "onaylandı" : "reddedildi"}`,
      kim: kim(s.reviewed_by),
    })),
    ...((sozlesme?.data ?? []) as { id: string; customer_name: string | null; contract_no: string | null; status: string; reviewed_by: string | null; reviewed_at: string | null }[]).map((s) => ({
      anahtar: `sozlesme-${s.id}`, zaman: s.reviewed_at ?? "", tur: "Sözleşme onayı", ton: (s.status === "approved" ? "success" : "danger") as Ton,
      ne: `${s.customer_name ?? "Müşteri"} · ${s.contract_no ?? ""} · ${s.status === "approved" ? "onaylandı" : "reddedildi"}`,
      kim: kim(s.reviewed_by),
    })),
  ].filter((k) => k.zaman).sort((a, b) => b.zaman.localeCompare(a.zaman)).slice(0, 60);

  const sunucuAnahtari = var_("SUPABASE_SECRET_KEY") || var_("SUPABASE_SERVICE_ROLE_KEY");
  const kopruNotu = (h: { ok: boolean; missing: string[] }) => (h.ok ? "Bağlı, yanıt veriyor" : h.missing.length ? `Eksik ayar: ${h.missing.join(", ")}` : "Yanıt vermiyor");
  const entegrasyonlar: Entegrasyon[] = [
    {
      ad: "PayTR (kartla ödeme)", grup: "Ödeme",
      durum: paytr.available && paytr.connected && paytr.enabled ? "bagli" : paytr.available ? "eksik" : "yok",
      not: !paytr.available ? "Sunucu anahtarı ya da şifreleme anahtarı (PAYMENT_CREDENTIALS_KEY) tanımlı değil"
        : !paytr.connected ? "Mağaza bilgileri girilmemiş" : !paytr.enabled ? "Kayıtlı ama kapalı"
        : `Mağaza ${paytr.merchantHint ?? ""}${paytr.lastPaymentAt ? ` · son ödeme ${tarihSaat(paytr.lastPaymentAt)}` : " · henüz ödeme yok"}`,
    },
    { ad: "Garanti BBVA sanal POS", grup: "Ödeme", durum: "yok", not: "Kimlik saklanabiliyor ama ödeme akışı bağlı değil" },
    { ad: "Havale / EFT", grup: "Ödeme", durum: "bagli", not: "Kiracı dekontla bildiriyor, Ödeme onaylarında karar veriliyor" },
    /* Mesaj ve bildirim ayarları ORTAK MODÜLDEN (lib/platform-mesaj-ayarlari):
       aynı liste Sistem sağlığı ekranında da sayılıyor ve eksik bir anahtar
       orada "açık sorun" oluyor. İki yerde iki ayrı liste tutmak, birinin
       sapması demekti. */
    ...mesajAyarlari(var_, pushYapilandi()).map((a) => {
      const dustu = a.ad.startsWith("E-posta") && a.bagli && sonPostaHatasi;
      return {
        ad: a.ad, grup: "Mesaj ve bildirim", not: a.not, bedel: a.bedel,
        durum: (dustu ? "hata" : a.bagli ? "bagli" : "eksik") as Entegrasyon["durum"],
        hata: dustu ? `Son deneme düştü${sonPostaHatasi.proforma_no ? ` (${sonPostaHatasi.proforma_no})` : ""}: ${sonPostaHatasi.gonderim_hatasi}` : undefined,
      };
    }),
    { ad: "ArvoARC köprüsü", grup: "Ürün köprüsü", durum: arc.ok ? "bagli" : "eksik", not: kopruNotu(arc) },
    { ad: "ArvoCal köprüsü", grup: "Ürün köprüsü", durum: randevu.ok ? "bagli" : "eksik", not: kopruNotu(randevu) },
    { ad: "ArvoLab köprüsü", grup: "Ürün köprüsü", durum: arvolab && !arvolab.broken ? "bagli" : "eksik", not: !arvolab ? "ARVOLAB_SUPABASE_URL / anahtar eksik" : arvolab.broken ? "Yanıt vermiyor" : "Bağlı, yanıt veriyor" },
    { ad: "E-fatura / e-arşiv (Paraşüt)", grup: "Fatura", durum: "yok", not: "Bağlı değil; planlandı. Platform faturası bugün kesilmiyor" },
  ];
  const DURUM_ADI = { bagli: "Bağlı", eksik: "Eksik", hata: "Gönderim hatası", yok: "Yok" } as const;
  const DURUM_TONU: Record<Entegrasyon["durum"], Ton> = { bagli: "success", eksik: "warning", hata: "danger", yok: "neutral" };

  const sirlar = [
    { ad: "Supabase sunucu anahtarı", var: sunucuAnahtari, not: "Konsolun kiracılar arası okuması, köprüler ve zamanlanmış işler bunu kullanır" },
    { ad: "Zamanlanmış işlerin anahtarı (CRON_SECRET)", var: var_("CRON_SECRET"), not: "Yoksa hatırlatma ve eşitleme işleri reddedilir" },
    { ad: "Ödeme kimliği şifreleme anahtarı", var: paymentCredentialsConfigured(), not: "Mağaza sırları veritabanında bununla şifreli" },
    { ad: "Anlık bildirim webhook sırrı", var: var_("PUSH_WEBHOOK_SECRET"), not: "Veritabanındaki tetikleyici bildirim gönderirken kullanır" },
    { ad: "Ürün köprüsü sırrı", var: var_("PRODUCT_BRIDGE_SECRET"), not: "ArvoLab ve ArvoARC'ın ArvoOS'a çağrıları" },
    { ad: "Randevu köprüsü sırrı", var: var_("RANDEVU_BRIDGE_SECRET"), not: "Randevu'nun ArvoOS'a çağrıları" },
  ];

  /* Gönderim hatası da eksik sayılır: Sistem sağlığının "açık sorun" sayısıyla aynı kural. */
  const eksikEntegrasyon = entegrasyonlar.filter((e) => e.durum === "eksik" || e.durum === "hata").length;
  const KAYIT_TURLERI = ["Kurulum", "Lisans ve ayar", "Üye erişimi", "Fiyat", "Ödeme kararı", "Sözleşme onayı"];
  const seciliTur = KAYIT_TURLERI.includes(istenenTur ?? "") ? istenenTur! : "";
  const gorunenKayitlar = seciliTur ? kayitlar.filter((k) => k.tur === seciliTur) : kayitlar;
  const eksikSir = sirlar.filter((s) => !s.var).length;
  const dikkat: { ad: string; not: string; bolum: Bolum; etiket: string; ton: Ton }[] = [
    ...sirlar.filter((x) => !x.var).map((x) => ({ ad: x.ad, not: x.not, bolum: "baglantilar" as Bolum, etiket: "Eksik", ton: "danger" as Ton })),
    ...entegrasyonlar.filter((e) => e.durum === "eksik" || e.durum === "hata").map((e) => ({ ad: e.ad, not: e.hata ?? e.bedel ?? e.not, bolum: "baglantilar" as Bolum, etiket: DURUM_ADI[e.durum], ton: DURUM_TONU[e.durum] })),
    ...(postaOkunamadi ? [{ ad: "Proforma gönderim kayıtları", not: postaOkunamadi, bolum: "baglantilar" as Bolum, etiket: "Okunamadı", ton: "danger" as Ton }] : []),
    ...(okumaHatalari.length ? [{ ad: "İşlem kayıtları", not: okumaHatalari.join(" · "), bolum: "kayitlar" as Bolum, etiket: "Okunamadı", ton: "danger" as Ton }] : []),
  ];

  const BOLUM_ADI: Record<Bolum, { baslik: string; alt: string }> = {
    yetkiler: { baslik: "Kurucu yetkileri", alt: "Konsola ArvoOS kurumunun etkin Kurum Sahibi girer; tam yetkili kurucu ötekileri alanlara (Müşteriler, Finans, Destek, Ürünler, Sistem) sınırlayabilir." },
    baglantilar: { baslik: "Bağlantılar ve sırlar", alt: "Entegrasyonların ve sunucu sırlarının gerçek durumu; eksikse neyin olmadığı yazıyor, sırların değeri gösterilmez." },
    kayitlar: { baslik: "İşlem kayıtları", alt: "Kurulum adımları, lisans ve ayar değişiklikleri, ödeme ve sözleşme kararları, fiyat değişiklikleri ve üye erişimi; en yeni altmış kayıt." },
  };
  const SEKME_ADI: Record<Bolum, string> = { yetkiler: "Kurucu yetkileri", baglantilar: "Bağlantılar ve sırlar", kayitlar: "İşlem kayıtları" };
  const bas = BOLUM_ADI[bolum];
  const bos = (baslik: string, aciklama: string) => (
    <div className="crm-empty-state talep-bos-kutu ek-bos"><h2>{baslik}</h2><p>{aciklama}</p></div>
  );

  /*
    PANELİN TABLOSU (29.10.2026, konsol yeniden kurulurken). Dört bölüm
    iOS satırıydı; işlem kayıtlarında işlem, kim ve zaman tek satıra
    sıkışıyordu ve "dün kim ne yaptı" sorusu satır satır okunuyordu.
    Artık hizalı tablo; bölüm seçimi Ekip listesindeki segment, şerit
    özet olarak kaldı. Satırların açılacak bir ekranı yok, ok çizilmiyor.
  */
  return <main className="plt talep cari ekip talepler teklifler liste-sayfa sistem-sayfa">
    <header className="talep-bas">
      <div className="talep-bas-metin">
        <small className="panel-kicker">SİSTEM</small>
        <h1>{bas.baslik}</h1>
        <p className="ek-alt">{bas.alt}</p>
      </div>
      <div className="talep-bas-eylem">
        <Link className="panel-secondary" href="/panel/platform/saglik">Sistem sağlığı</Link>
      </div>
    </header>

    <nav className="kayit-serit talep-serit" aria-label="Sistem özeti">
      <dl>
        <div {...sekme("yetkiler")}><dt>Kurucu</dt><dd><Link {...sekmeBag("yetkiler")}>{kurucular.length}</Link></dd><small>konsola girebilen kişi</small></div>
        <div {...sekme("baglantilar")}>
          <dt>Entegrasyon</dt>
          <dd><Link {...sekmeBag("baglantilar")}>{entegrasyonlar.filter((e) => e.durum === "bagli").length} / {entegrasyonlar.length}</Link></dd>
          <small>{eksikEntegrasyon ? `${eksikEntegrasyon} eksik ayar` : "bağlı olanlar çalışıyor"}</small>
        </div>
        <div {...sekme("baglantilar")}>
          <dt>Sunucu sırları</dt>
          <dd className={eksikSir ? "talep-uyari" : undefined}><Link {...sekmeBag("baglantilar")}>{sirlar.filter((s) => s.var).length} / {sirlar.length}</Link></dd>
          <small>{eksikSir ? "eksik sır var" : "hepsi tanımlı"}</small>
        </div>
        <div {...sekme("kayitlar")}><dt>İşlem kaydı</dt><dd><Link {...sekmeBag("kayitlar")}>{kayitlar.length}</Link></dd><small>son kurucu işlemleri</small></div>
      </dl>
    </nav>

    {/* Bölüm kimlikleri (#yetkiler, #baglantilar, #kayitlar) şeritteki
        bağlantıların hedefi. */}
    <div className="talep-izgara personel-iki ekip-izgara">
    <section className="panel-card talep-bilgi" id={bolum} aria-label={bas.baslik}>
      <div className="ekip-suzgec talep-suzgec ek-arac">
        <nav className="ek-segment" aria-label="Bölüm">
          {BOLUMLER.map((kod) => (
            <Link key={kod} {...sekmeBag(kod)} {...sekme(kod)}>{SEKME_ADI[kod]}</Link>
          ))}
        </nav>
      </div>

      {bolum === "yetkiler" ? <>
        {kapsamHatasi ? <KNot ton="tehlike">Kurucu alanları okunamadı ({kapsamHatasi}); aşağıdaki &quot;Tam yetki&quot; yazıları doğru olmayabilir.</KNot> : null}
        <div className="talep-tablo">
          <table className="crm-data-table" data-cols="sy-yetki">
            <thead><tr><th>Kişi</th><th>Kurumdaki rolü</th><th>Konsol</th></tr></thead>
            <tbody>
              {uyeler.filter((u) => u.is_active).map((u) => {
                const ad = kisiAdi.get(u.user_id) ?? calisanAdi.get(u.user_id) ?? "—";
                const kurucu = u.role === "owner";
                const alanlar = kurucuAlanlari.get(u.user_id) ?? null;
                const konsol = !kurucu ? { etiket: "Giremez", ton: "neutral" }
                  : alanlar ? { etiket: "Kısıtlı", ton: "warning" } : { etiket: "Tam yetki", ton: "success" };
                const alanYazisi = alanlar ? alanlar.map(alanAdi).join(", ") : null;
                /* Düzenleme: yalnızca tam yetkili, kendisi dışındaki kurucular (kural actions.ts'te). */
                const duzenlenir = kurucu && tamYetkili && u.user_id !== userId && !kapsamTablosuYok && !kapsamHatasi;
                return (
                  <tr key={u.user_id} className={kurucu ? undefined : "is-pasif"}>
                    <td data-label="Kişi"><span className="ek-kisi"><span className="ek-avatar" data-tur="bireysel" aria-hidden="true">{basHarfleri(ad)}</span><span className="ek-kisi-metin"><span className="crm-table-title">{ad}</span>{u.user_id === userId ? <span className="crm-table-sub">siz</span> : null}</span></span></td>
                    <td data-label="Kurumdaki rolü"><span className="crm-table-title">{roleNames[u.role] ?? u.role}</span></td>
                    <td data-label="Konsol">
                      <span className="status-pill" data-tone={konsol.ton}>{konsol.etiket}</span>
                      {alanYazisi ? <small>{alanYazisi}</small> : null}
                      {duzenlenir ? (
                        <details className="sy-alan-duzen">
                          <summary>Yetkiyi değiştir</summary>
                          <form action={kurucuAlanlariniKaydet} className="sy-alan-formu">
                            <input type="hidden" name="user_id" value={u.user_id} />
                            <label><input type="checkbox" name="tam" value="1" defaultChecked={!alanlar} /> Tam yetki</label>
                            {KONSOL_ALANLARI.map((a) => (
                              <label key={a.kod} title={a.aciklama}><input type="checkbox" name="alan" value={a.kod} defaultChecked={Boolean(alanlar?.includes(a.kod))} /> {a.ad}</label>
                            ))}
                            <button className="panel-secondary" type="submit">Kaydet</button>
                          </form>
                        </details>
                      ) : null}
                    </td>
                    <MobilSatir baslik={ad} durum={konsol} alt={[roleNames[u.role] ?? u.role, alanYazisi]} />
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <KNot>
          Konsola ArvoOS kurumunun Kurum Sahipleri girer. Kısıtlı kurucu yalnızca işaretli alanları görür ve açar
          (menü, sayfa ve işlemler); ana ekranda yalnızca kendi alanlarının girişleri çıkar. &quot;Tam yetki&quot;
          işaretliyse alan seçimi yok sayılır. Yetkiyi yalnızca tam yetkili kurucu değiştirir ve kimse kendi yetkisini
          değiştiremez — böylece en az bir tam yetkili kurucu her zaman kalır. Sınır panelde uygulanıyor; veritabanı
          politikaları kısıtlı kurucuyu hâlâ kurucu sayıyor, yani bu bir iş bölümü, güven sınırı değil.
        </KNot>
      </> : null}

      {bolum === "baglantilar" ? <>
        <div className="talep-tablo">
          <table className="crm-data-table" data-cols="sy-entegrasyon">
            <thead><tr><th>Bağlantı</th><th>Grup</th><th>Ayrıntı</th><th>Durum</th></tr></thead>
            <tbody>
              {/* Gruba göre, grubun içinde önce eksik (bakılacak olan) en üstte. */}
              {[...entegrasyonlar].sort((a, b) => a.grup.localeCompare(b.grup, "tr") || Number(a.durum !== "eksik" && a.durum !== "hata") - Number(b.durum !== "eksik" && b.durum !== "hata")).map((e) => {
                const durum = { etiket: DURUM_ADI[e.durum], ton: DURUM_TONU[e.durum] };
                return (
                  <tr key={e.ad} className={e.durum === "yok" ? "is-pasif" : undefined}>
                    <td data-label="Bağlantı"><span className="crm-table-title">{e.ad}</span></td>
                    <td data-label="Grup"><span className="crm-table-sub">{e.grup}</span></td>
                    <td data-label="Ayrıntı">
                      <span className="crm-table-sub" title={e.not}>{e.not}</span>
                      {/* Bedel BAĞLIYKEN DE yazılıyor: anahtarı kaldırmayı düşünen
                          kişinin görmesi gereken şey ne işe yaradığı. */}
                      {e.bedel ? <small>Eksikse: {e.bedel}</small> : null}
                      {e.hata ? <small className="sy-posta-hatasi">{e.hata}</small> : null}
                    </td>
                    <td data-label="Durum"><span className="status-pill" data-tone={durum.ton} title={e.hata}>{durum.etiket}</span></td>
                    <MobilSatir baslik={e.ad} durum={durum} alt={[e.hata ?? e.not]} />
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="talep-tablo">
          <table className="crm-data-table" data-cols="sy-sir">
            <thead><tr><th>Sır</th><th>Ne için</th><th>Durum</th></tr></thead>
            <tbody>
              {sirlar.map((s) => {
                const durum = { etiket: s.var ? "Tanımlı" : "Eksik", ton: s.var ? "success" : "danger" };
                return (
                  <tr key={s.ad}>
                    <td data-label="Sır"><span className="crm-table-title">{s.ad}</span></td>
                    <td data-label="Ne için"><span className="crm-table-sub" title={s.not}>{s.not}</span></td>
                    <td data-label="Durum"><span className="status-pill" data-tone={durum.ton}>{durum.etiket}</span></td>
                    <MobilSatir baslik={s.ad} durum={durum} alt={[s.not]} />
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <KNot ton={eksikSir ? "uyari" : "bilgi"}>
          Konsolun her sayfası ve her işlemi kurucu yetkisini sunucuda yeniden doğruluyor; fiyat listesi,
          fiyat geçmişi ve ödeme kararları ayrıca veritabanı politikalarıyla korunuyor.
        </KNot>
      </> : null}

      {bolum === "kayitlar" ? (
        !admin ? bos("Kayıtlar okunamıyor", "Sunucu anahtarı tanımlı olmadığı için kayıtlar okunamıyor — kayıt yok demek değil.") : <>
          {okumaHatalari.length ? <KNot ton="tehlike">Bazı kayıtlar okunamadı: {okumaHatalari.join(" · ")}</KNot> : null}
          {/* Tür süzgeci (?tur=, 29.10.2026): altmış kaydın içinde "son ödeme
              kararlarını kim verdi" sorusu kaydırarak aranıyordu. */}
          <div className="ekip-suzgec talep-suzgec ek-arac sy-tur">
            <nav className="ek-segment" aria-label="Kayıt türü">
              {[["", "Tümü"], ...KAYIT_TURLERI.map((t) => [t, t])].map(([kod, ad]) => (
                <Link key={kod || "tumu"} href={`/panel/platform/ayarlar?bolum=kayitlar${kod ? `&tur=${encodeURIComponent(kod)}` : ""}`}
                  className={seciliTur === kod ? "is-active" : undefined} aria-current={seciliTur === kod ? "page" : undefined}>
                  {ad} <small>{kod ? kayitlar.filter((k) => k.tur === kod).length : kayitlar.length}</small>
                </Link>
              ))}
            </nav>
          </div>
          {gorunenKayitlar.length ? (
            <div className="talep-tablo">
              <table className="crm-data-table" data-cols="sy-kayit">
                <thead><tr><th>İşlem</th><th>Tür</th><th>Kim</th><th className="crm-col-date">Zaman</th></tr></thead>
                <tbody>
                  {gorunenKayitlar.map((k) => (
                    <tr key={k.anahtar}>
                      <td data-label="İşlem"><span className="crm-table-title" title={k.ne}>{k.ne}</span></td>
                      <td data-label="Tür"><span className="status-pill" data-tone={k.ton}>{k.tur}</span></td>
                      <td data-label="Kim"><span className="crm-table-title">{k.kim ?? "Sistem"}</span></td>
                      <td className="crm-col-date" data-label="Zaman">{tarihSaat(k.zaman)}</td>
                      <MobilSatir baslik={k.ne} durum={{ etiket: k.tur, ton: k.ton }} alt={[k.kim ?? "Sistem", tarihSaat(k.zaman)]} />
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : bos(seciliTur ? `“${seciliTur}” türünde kayıt yok` : "Henüz kurucu işlemi kaydı yok", "Konsoldan yapılan kurum, lisans ve ödeme işlemleri burada tarihiyle birikir.")}
          <KNot>
            Lisans, modül, köprü ve kurum ayarı değişiklikleri 2 Kasım 2026&apos;dan beri önceki ve yeni
            değeriyle kaydediliyor; daha eskilerinde yalnızca son düzenleyen tutuluyordu.
          </KNot>
        </>
      ) : null}
    </section>

    {/*
      Sağ sütun (29.10.2026): dört bölümün DİKKAT İSTEYEN satırları tek
      listede, her biri kendi bölümüne bağlı. Eskiden eksik bir ayarı
      görmek için dört bölümü tek tek açmak gerekiyordu; şerit yalnızca
      "1 eksik ayar" diyordu, hangisi olduğunu söylemiyordu.
    */}
    <div className="liste-sag">
      <TalepAkis kimlik="ayar-sag" sinif="ek-sag" etiket="Dikkat ve istatistik"
        sekmeler={[dikkat.length ? `Dikkat · ${dikkat.length}` : "Dikkat", "İstatistikler"]}>
        <section className="ek-panel" aria-label="Dikkat isteyenler">
          {dikkat.length ? (
            <ul className="pu-liste">
              {dikkat.map((d) => (
                <li key={d.ad}>
                  <Link href={`/panel/platform/ayarlar?bolum=${d.bolum}`}>
                    <span className="pu-govde"><b>{d.ad}</b><small title={d.not}>{d.not}</small></span>
                    <span className="status-pill" data-tone={d.ton}>{d.etiket}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : <p className="ek-bos-kucuk">Eksik ayar yok: bağlantılar ve sunucu sırları tamam.</p>}
        </section>
        <IstatistikKarti
          kapsam="kurucu konsolu"
          kutular={[
            { ad: "Kurucu", deger: String(kurucular.length), alt: "konsola girebilen" },
            { ad: "Bağlı entegrasyon", deger: `${entegrasyonlar.filter((e) => e.durum === "bagli").length} / ${entegrasyonlar.length}`, alt: eksikEntegrasyon ? `${eksikEntegrasyon} eksik` : "eksik yok" },
            { ad: "Sunucu sırrı", deger: `${sirlar.filter((x) => x.var).length} / ${sirlar.length}`, alt: eksikSir ? "eksik var" : "hepsi tanımlı", ton: eksikSir ? "uyari" : undefined },
            { ad: "İşlem kaydı", deger: String(kayitlar.length), alt: "en yeni altmış" },
          ]}
          gruplar={[{ baslik: "Kayıt türüne göre", satirlar: KAYIT_TURLERI.map((t) => ({ ad: t, adet: kayitlar.filter((k) => k.tur === t).length })).filter((x) => x.adet) }]}
        />
      </TalepAkis>
    </div>
    </div>
  </main>;
}
