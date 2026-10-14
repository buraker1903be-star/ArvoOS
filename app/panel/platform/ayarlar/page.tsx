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
import { MobilSatir } from "../../crm/table-cells";
import { KBaslik, KBos, KDurum, KKart, KNot, KTablo } from "../konsol-ui";
import { KURULUM_ADI, para, tarihSaat } from "../bicim";
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

export default async function SistemAyarlariPage() {
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
      ne: `${s.organization_id ? kurumAdi.get(s.organization_id) ?? "Kurum" : "Kurum"} · ${s.action} · ${KURULUM_ADI[s.state] ?? s.state}${s.result === "failed" ? " · HATA" : ""}`,
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
        <p>Konsola kimin girebildiği, entegrasyonların durumu, sunucu sırları ve kurucu işlemlerinin kaydı.</p>
      </div>
      <div className="talep-bas-eylem">
        <Link className="panel-secondary" href="/panel/platform/saglik">Sistem sağlığı</Link>
      </div>
    </header>

    <nav className="kayit-serit talep-serit" aria-label="Sistem özeti">
      <dl>
        <div><dt>Kurucu</dt><dd><a href="#yetkiler">{kurucular.length}</a></dd><small>konsola girebilen kişi</small></div>
        <div>
          <dt>Entegrasyon</dt>
          <dd><a href="#entegrasyonlar">{entegrasyonlar.filter((e) => e.durum === "bagli").length} / {entegrasyonlar.length}</a></dd>
          <small>{eksikEntegrasyon ? `${eksikEntegrasyon} eksik ayar` : "bağlı olanlar çalışıyor"}</small>
        </div>
        <div>
          <dt>Sunucu sırları</dt>
          <dd className={eksikSir ? "talep-uyari" : undefined}><a href="#guvenlik">{sirlar.filter((s) => s.var).length} / {sirlar.length}</a></dd>
          <small>{eksikSir ? "eksik sır var" : "hepsi tanımlı"}</small>
        </div>
        <div><dt>İşlem kaydı</dt><dd><a href="#kayitlar">{kayitlar.length}</a></dd><small>son kurucu işlemleri</small></div>
      </dl>
    </nav>

    {/* Bölüm kimlikleri (#yetkiler, #entegrasyonlar, #guvenlik, #kayitlar)
        dock'taki ve şeritteki bağlantıların hedefi: değiştirilmez.
        Satırların açılacak bir ekranı yok; ok sütunu bu yüzden konmadı. */}
    <KKart id="yetkiler" baslik="Konsola kim girebiliyor"
      aciklama="Kural tek: ArvoOS kurumunun etkin Kurum Sahibi. Hem sunucu işlemleri hem veritabanı politikaları aynı kuralı uyguluyor.">
      <KTablo kolonlar={[{ ad: "Kişi" }, { ad: "ArvoOS kurumundaki rolü" }, { ad: "Konsol" }]}>
        {uyeler.filter((u) => u.is_active).map((u) => {
          const ad = kisiAdi.get(u.user_id) ?? calisanAdi.get(u.user_id) ?? "—";
          const rol = roleNames[u.role] ?? u.role;
          const konsol = { etiket: u.role === "owner" ? "Tam yetki" : "Giremez", ton: u.role === "owner" ? "success" : "neutral" };
          return (
            <tr key={u.user_id}>
              <KBaslik etiket="Kişi" baslik={ad} />
              <td data-label="ArvoOS kurumundaki rolü">{rol}</td>
              <KDurum baslik="Konsol" etiket={konsol.etiket} ton={konsol.ton} />
              <MobilSatir baslik={ad} durum={konsol} alt={[rol]} />
            </tr>
          );
        })}
      </KTablo>
      <KNot>Kademeli kurucu rolü (yalnızca finans, yalnızca kurulum gibi) henüz yok; konsola giren herkes tam yetkili.</KNot>
    </KKart>

    <KKart id="entegrasyonlar" baslik="Bağlantıların durumu"
      aciklama="Ortam değişkenlerinin ve kayıtlı bağlantıların gerçek durumu; sırların değeri gösterilmez.">
      <KTablo kolonlar={[{ ad: "Entegrasyon" }, { ad: "Durum" }, { ad: "Ayrıntı" }]}>
        {entegrasyonlar.map((e) => (
          <tr key={e.ad}>
            <KBaslik etiket="Entegrasyon" baslik={e.ad} />
            <KDurum etiket={DURUM_ADI[e.durum]} ton={DURUM_TONU[e.durum]} />
            <td data-label="Ayrıntı">{e.not}</td>
            <MobilSatir baslik={e.ad} durum={{ etiket: DURUM_ADI[e.durum], ton: DURUM_TONU[e.durum] }} alt={[e.not]} />
          </tr>
        ))}
      </KTablo>
    </KKart>

    <KKart id="guvenlik" baslik="Sunucu sırları ve yetki"
      aciklama="Sırlar yalnızca sunucuda; burada yalnızca tanımlı olup olmadıkları yazıyor.">
      <KTablo kolonlar={[{ ad: "Sır" }, { ad: "Durum" }, { ad: "Ne için" }]}>
        {sirlar.map((s) => (
          <tr key={s.ad}>
            <KBaslik etiket="Sır" baslik={s.ad} />
            <KDurum etiket={s.var ? "Tanımlı" : "Eksik"} ton={s.var ? "success" : "danger"} />
            <td data-label="Ne için">{s.not}</td>
            <MobilSatir baslik={s.ad} durum={{ etiket: s.var ? "Tanımlı" : "Eksik", ton: s.var ? "success" : "danger" }} alt={[s.not]} />
          </tr>
        ))}
      </KTablo>
      <KNot ton={eksikSir ? "uyari" : "bilgi"}>
        Konsolun her sayfası ve her işlemi kurucu yetkisini sunucuda yeniden doğruluyor; fiyat listesi,
        fiyat geçmişi ve ödeme kararları ayrıca veritabanı politikalarıyla korunuyor.
      </KNot>
    </KKart>

    <KKart id="kayitlar" baslik="Kurucu işlemleri"
      aciklama="Kurulum adımları, ödeme ve sözleşme kararları, fiyat değişiklikleri ve üye erişimi; en yeni altmış kayıt.">
      {!admin ? (
        <KBos baslik="Kayıtlar okunamıyor" aciklama="Sunucu anahtarı tanımlı olmadığı için kayıtlar okunamıyor — kayıt yok demek değil." />
      ) : (
        <>
          {okumaHatalari.length ? <KNot ton="tehlike">Bazı kayıtlar okunamadı: {okumaHatalari.join(" · ")}</KNot> : null}
          {kayitlar.length ? (
            <KTablo kolonlar={[{ ad: "İşlem" }, { ad: "Tür" }, { ad: "Zaman", sinif: "crm-col-date" }, { ad: "Kim" }]}>
              {kayitlar.map((k) => (
                <tr key={k.anahtar}>
                  {/* İlk sütun eskiden zamandı; panel listelerinde ilk hücre
                      kaydın kendisi, zaman tarih sütununda. */}
                  <KBaslik etiket="İşlem" baslik={k.ne} />
                  <KDurum baslik="Tür" etiket={k.tur} ton={k.ton} />
                  <td data-label="Zaman" className="crm-col-date">{tarihSaat(k.zaman)}</td>
                  <td data-label="Kim">{k.kim ?? "Sistem"}</td>
                  <MobilSatir baslik={k.ne} durum={{ etiket: k.tur, ton: k.ton }} alt={[tarihSaat(k.zaman), k.kim ?? "Sistem"]} />
                </tr>
              ))}
            </KTablo>
          ) : <KBos baslik="Henüz kurucu işlemi kaydı yok" />}
          <KNot>
            Lisans, modül ve deneme düzenlemeleri bugün ayrı bir kayıt bırakmıyor (yalnızca son düzenleyen
            tutuluyor); genel işlem günlüğü sonraki adım.
          </KNot>
        </>
      )}
    </KKart>
  </main>;
}
