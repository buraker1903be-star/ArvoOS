import Link from "next/link";
import { notFound } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { paymentCredentialsConfigured } from "@/lib/payment-credentials";
import { getPaytrStatus } from "@/lib/paytr-status";
import { pushYapilandi } from "@/lib/anlik-bildirim-gonder";
import { getArvolabBridgeHealth } from "@/lib/arvolab";
import { getArcBridgeHealth } from "@/lib/arc-bridge";
import { getRandevuBridgeHealth } from "@/lib/randevu-bridge";
import { KBos, KKart, KListe, KNot, KOge } from "../konsol-ui";
import { KURULUM_ADI, KURULUM_ISLEMI, para, tarihSaat } from "../bicim";
import { roleNames } from "../../hr/role-names";
import "../platform.css";

/*
  SİSTEM AYARLARI (14.10.2026, Kurucu Konsolu'nun ana menüsü).

  Dört bölüm, dördü de GERÇEK durumdan okunuyor:

    1. Kurucu yetkileri — konsola kim girebiliyor. Kural tek: ArvoOS'un
       kendi kurumunun (slug arvo-os) etkin Kurum Sahibi (uygulamada
       panel-context isPlatformOwner, veritabanında
       private.is_arvoos_founder). Kademeli kurucu rolü YOK; bölüm bunu
       açıkça söylüyor.
    2. Entegrasyonlar — ödeme, WhatsApp, anlık bildirim, ürün köprüleri,
       e-fatura. Ortam değişkenlerinin yalnızca VAR/YOK bilgisi okunuyor,
       değeri asla (AGENTS.md: sırlar NEXT_PUBLIC_ ile başlamaz, ekrana da
       çıkmaz).
    3. Güvenlik — sunucu sırlarının tanımlı olup olmadığı ve yetkinin
       nerede uygulandığı.
    4. İşlem kayıtları — kurucu işlemlerinin tek akışı: kurulum adımları,
       ödeme ve sözleşme kararları, fiyat değişiklikleri, üye erişimi.
       Lisans ve modül düzenlemeleri bugün ayrı bir kayıt bırakmıyor
       (yalnızca updated_by); bölüm bunu da yazıyor.

  Sistem Sağlığı (köprü kopyaları, kota, kurulum hataları) bu menünün
  alt bölümü; ayrıntı orada.
*/

/* Durum rozetinin tonları (panelin status-pill data-tone değerleri). */
type Ton = "success" | "warning" | "danger" | "info" | "neutral";
type Entegrasyon = { ad: string; durum: "bagli" | "eksik" | "yok"; not: string };
type Kayit = { anahtar: string; zaman: string; tur: string; ton: Ton; ne: string; kim: string | null };

const var_ = (ad: string) => Boolean(process.env[ad]);

/*
  TEK EKRAN (14.10.2026, "kompakt, sade, premium"): dört bölüm alt alta
  2.600 piksel tutuyordu. Artık özet şeridindeki dört sayı aynı zamanda
  sekme (?bolum=); her seferinde tek bölüm açık, sayfa İşler gibi tek ekran.
*/
const BOLUMLER = ["yetkiler", "entegrasyonlar", "guvenlik", "kayitlar"] as const;
type Bolum = (typeof BOLUMLER)[number];

export default async function SistemAyarlariPage({ searchParams }: { searchParams: Promise<{ bolum?: string }> }) {
  const { bolum: istenen } = await searchParams;
  const bolum: Bolum = (BOLUMLER as readonly string[]).includes(istenen ?? "") ? (istenen as Bolum) : "entegrasyonlar";
  const sekme = (kod: Bolum) => ({ className: bolum === kod ? "is-active" : undefined });
  const sekmeBag = (kod: Bolum) => ({ href: `/panel/platform/ayarlar?bolum=${kod}`, "aria-current": bolum === kod ? ("page" as const) : undefined });
  const { supabase, isPlatformOwner, organization } = await getPanelContext();
  if (!isPlatformOwner) notFound();
  const admin = createAdminClient();

  const [uyelikSonucu, paytr, arvolab, arc, randevu] = await Promise.all([
    supabase.from("organization_memberships").select("user_id,role,is_active").eq("organization_id", organization.id),
    getPaytrStatus(organization.id),
    getArvolabBridgeHealth(),
    getArcBridgeHealth(),
    getRandevuBridgeHealth(),
  ]);
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
    ...((erisim?.data ?? []) as { id: number; organization_id: string; actor_user_id: string | null; action: string; entity_type: string; metadata: { is_active?: boolean } | null; created_at: string }[]).map((s) => ({
      anahtar: `erisim-${s.id}`, zaman: s.created_at, tur: "Üye erişimi", ton: "info" as Ton,
      ne: `${kurumAdi.get(s.organization_id) ?? "Kurum"} · ${s.entity_type === "organization_membership" ? `üye erişimi ${(s as { metadata?: { is_active?: boolean } }).metadata?.is_active ? "açıldı" : "kapatıldı"}` : s.action}`, kim: kim(s.actor_user_id),
    })),
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
      ad: "PayTR (kartla ödeme)",
      durum: paytr.available && paytr.connected && paytr.enabled ? "bagli" : paytr.available ? "eksik" : "yok",
      not: !paytr.available ? "Sunucu anahtarı ya da şifreleme anahtarı (PAYMENT_CREDENTIALS_KEY) tanımlı değil"
        : !paytr.connected ? "Mağaza bilgileri girilmemiş" : !paytr.enabled ? "Kayıtlı ama kapalı"
        : `Mağaza ${paytr.merchantHint ?? ""}${paytr.lastPaymentAt ? ` · son ödeme ${tarihSaat(paytr.lastPaymentAt)}` : " · henüz ödeme yok"}`,
    },
    { ad: "Garanti BBVA sanal POS", durum: "yok", not: "Kimlik saklanabiliyor ama ödeme akışı bağlı değil" },
    { ad: "Havale / EFT", durum: "bagli", not: "Kiracı dekontla bildiriyor, Ödeme onaylarında karar veriliyor" },
    { ad: "WhatsApp (Meta)", durum: var_("WHATSAPP_PHONE_ID") && var_("WHATSAPP_TOKEN") ? "bagli" : "eksik", not: var_("WHATSAPP_PHONE_ID") && var_("WHATSAPP_TOKEN") ? "Arvo numarası tanımlı" : "WHATSAPP_PHONE_ID / WHATSAPP_TOKEN eksik" },
    { ad: "Anlık bildirim (web push)", durum: pushYapilandi() ? "bagli" : "eksik", not: pushYapilandi() ? "VAPID anahtarları tanımlı" : "VAPID anahtarları eksik" },
    { ad: "ArvoARC köprüsü", durum: arc.ok ? "bagli" : "eksik", not: kopruNotu(arc) },
    { ad: "Arvo Randevu köprüsü", durum: randevu.ok ? "bagli" : "eksik", not: kopruNotu(randevu) },
    { ad: "ArvoLab köprüsü", durum: arvolab && !arvolab.broken ? "bagli" : "eksik", not: !arvolab ? "ARVOLAB_SUPABASE_URL / anahtar eksik" : arvolab.broken ? "Yanıt vermiyor" : "Bağlı, yanıt veriyor" },
    { ad: "E-fatura / e-arşiv (Paraşüt)", durum: "yok", not: "Bağlı değil; planlandı. Platform faturası bugün kesilmiyor" },
  ];
  const DURUM_ADI = { bagli: "Bağlı", eksik: "Eksik", yok: "Yok" } as const;
  const DURUM_TONU: Record<Entegrasyon["durum"], Ton> = { bagli: "success", eksik: "warning", yok: "neutral" };

  const sirlar = [
    { ad: "Supabase sunucu anahtarı", var: sunucuAnahtari, not: "Konsolun kiracılar arası okuması, köprüler ve zamanlanmış işler bunu kullanır" },
    { ad: "Zamanlanmış işlerin anahtarı (CRON_SECRET)", var: var_("CRON_SECRET"), not: "Yoksa hatırlatma ve eşitleme işleri reddedilir" },
    { ad: "Ödeme kimliği şifreleme anahtarı", var: paymentCredentialsConfigured(), not: "Mağaza sırları veritabanında bununla şifreli" },
    { ad: "Anlık bildirim webhook sırrı", var: var_("PUSH_WEBHOOK_SECRET"), not: "Veritabanındaki tetikleyici bildirim gönderirken kullanır" },
    { ad: "Ürün köprüsü sırrı", var: var_("PRODUCT_BRIDGE_SECRET"), not: "ArvoLab ve ArvoARC'ın ArvoOS'a çağrıları" },
    { ad: "Randevu köprüsü sırrı", var: var_("RANDEVU_BRIDGE_SECRET"), not: "Randevu'nun ArvoOS'a çağrıları" },
  ];

  const eksikEntegrasyon = entegrasyonlar.filter((e) => e.durum === "eksik").length;
  const eksikSir = sirlar.filter((s) => !s.var).length;

  return <main className="plt talep cari">
    <header className="talep-bas">
      <div className="talep-bas-metin">
        <small className="panel-kicker">PLATFORM · SİSTEM AYARLARI</small>
        <h1>Sistem Ayarları</h1>
      </div>
      <div className="talep-bas-eylem">
        <Link className="panel-secondary" href="/panel/platform/saglik">Sistem sağlığı</Link>
      </div>
    </header>

    <nav className="kayit-serit talep-serit" aria-label="Sistem özeti">
      <dl>
        <div {...sekme("yetkiler")}><dt>Kurucu</dt><dd><Link {...sekmeBag("yetkiler")}>{kurucular.length}</Link></dd><small>konsola girebilen kişi</small></div>
        <div {...sekme("entegrasyonlar")}>
          <dt>Entegrasyon</dt>
          <dd><Link {...sekmeBag("entegrasyonlar")}>{entegrasyonlar.filter((e) => e.durum === "bagli").length} / {entegrasyonlar.length}</Link></dd>
          <small>{eksikEntegrasyon ? `${eksikEntegrasyon} eksik ayar` : "bağlı olanlar çalışıyor"}</small>
        </div>
        <div {...sekme("guvenlik")}>
          <dt>Sunucu sırları</dt>
          <dd className={eksikSir ? "talep-uyari" : undefined}><Link {...sekmeBag("guvenlik")}>{sirlar.filter((s) => s.var).length} / {sirlar.length}</Link></dd>
          <small>{eksikSir ? "eksik sır var" : "hepsi tanımlı"}</small>
        </div>
        <div {...sekme("kayitlar")}><dt>İşlem kaydı</dt><dd><Link {...sekmeBag("kayitlar")}>{kayitlar.length}</Link></dd><small>son kurucu işlemleri</small></div>
      </dl>
    </nav>

    {/* Bölüm kimlikleri (#yetkiler, #entegrasyonlar, #guvenlik, #kayitlar)
        dock'taki ve şeritteki bağlantıların hedefi: değiştirilmez.
        Satırların açılacak bir ekranı yok; ok bu yüzden yok (href verilmiyor).
        iOS LİSTESİ (14.10.2026, "iOS gibi olmalı"): dört bölüm de sütun
        başlıksız tek satır — başlık, altında tek satır özet, sağda durum.
        Eskiden üç-dört sütunlu tablolardı (KTablo + MobilSatir). */}
    {bolum === "yetkiler" ? (
    <KKart id="yetkiler" baslik="Konsola kim girebiliyor"
      aciklama="Kural tek: ArvoOS kurumunun etkin Kurum Sahibi. Hem sunucu işlemleri hem veritabanı politikaları aynı kuralı uyguluyor.">
      <KListe>
        {uyeler.filter((u) => u.is_active).map((u) => {
          const ad = kisiAdi.get(u.user_id) ?? calisanAdi.get(u.user_id) ?? "—";
          const rol = roleNames[u.role] ?? u.role;
          const konsol = { etiket: u.role === "owner" ? "Tam yetki" : "Giremez", ton: u.role === "owner" ? "success" : "neutral" };
          return <KOge key={u.user_id} simge={ad} baslik={ad} alt={rol} durum={konsol} />;
        })}
      </KListe>
      <KNot>Kademeli kurucu rolü (yalnızca finans, yalnızca kurulum gibi) henüz yok; konsola giren herkes tam yetkili.</KNot>
    </KKart>
    ) : null}

    {bolum === "entegrasyonlar" ? (
    <KKart id="entegrasyonlar" baslik="Bağlantıların durumu"
      aciklama="Ortam değişkenlerinin ve kayıtlı bağlantıların gerçek durumu; sırların değeri gösterilmez.">
      <KListe>
        {entegrasyonlar.map((e) => (
          <KOge key={e.ad} baslik={e.ad} alt={e.not} durum={{ etiket: DURUM_ADI[e.durum], ton: DURUM_TONU[e.durum] }} />
        ))}
      </KListe>
    </KKart>
    ) : null}

    {bolum === "guvenlik" ? (
    <KKart id="guvenlik" baslik="Sunucu sırları ve yetki"
      aciklama="Sırlar yalnızca sunucuda; burada yalnızca tanımlı olup olmadıkları yazıyor.">
      <KListe>
        {sirlar.map((s) => (
          <KOge key={s.ad} baslik={s.ad} alt={s.not} durum={{ etiket: s.var ? "Tanımlı" : "Eksik", ton: s.var ? "success" : "danger" }} />
        ))}
      </KListe>
      <KNot ton={eksikSir ? "uyari" : "bilgi"}>
        Konsolun her sayfası ve her işlemi kurucu yetkisini sunucuda yeniden doğruluyor; fiyat listesi,
        fiyat geçmişi ve ödeme kararları ayrıca veritabanı politikalarıyla korunuyor.
      </KNot>
    </KKart>
    ) : null}

    {bolum === "kayitlar" ? (
    <KKart id="kayitlar" baslik="Kurucu işlemleri"
      aciklama="Kurulum adımları, ödeme ve sözleşme kararları, fiyat değişiklikleri ve üye erişimi; en yeni altmış kayıt.">
      {!admin ? (
        <KBos baslik="Kayıtlar okunamıyor" aciklama="Sunucu anahtarı tanımlı olmadığı için kayıtlar okunamıyor — kayıt yok demek değil." />
      ) : (
        <>
          {okumaHatalari.length ? <KNot ton="tehlike">Bazı kayıtlar okunamadı: {okumaHatalari.join(" · ")}</KNot> : null}
          {kayitlar.length ? (
            <KListe>
              {/* İlk sütun eskiden zamandı; panel listelerinde ilk hücre
                  kaydın kendisi. Artık tek satır: işlem, altında kim; sağda
                  türün tonlu rozeti (hata kırmızı, onay yeşil) ve zaman —
                  tür rozette olduğu için alt satırda tekrar edilmiyor.
                  Eskiden dört sütunlu tabloydu. */}
              {kayitlar.map((k) => (
                <KOge key={k.anahtar} baslik={k.ne} alt={k.kim ?? "Sistem"}
                  durum={{ etiket: k.tur, ton: k.ton }} deger={tarihSaat(k.zaman)} />
              ))}
            </KListe>
          ) : <KBos baslik="Henüz kurucu işlemi kaydı yok" aciklama="Konsoldan yapılan kurum, lisans ve ödeme işlemleri burada tarihiyle birikir." />}
          <KNot>
            Lisans, modül ve deneme düzenlemeleri bugün ayrı bir kayıt bırakmıyor (yalnızca son düzenleyen
            tutuluyor); genel işlem günlüğü sonraki adım.
          </KNot>
        </>
      )}
    </KKart>
    ) : null}
  </main>;
}
