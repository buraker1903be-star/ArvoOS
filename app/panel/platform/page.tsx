import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { notFound } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { getArvolabBridgeHealth } from "@/lib/arvolab";
import { getArcBridgeHealth } from "@/lib/arc-bridge";
import { getRandevuBridgeHealth } from "@/lib/randevu-bridge";
import { kotaDurumu } from "@/lib/kota-durumu";
import { KBos, KKart, KListe, KNot, KOge } from "./konsol-ui";
import { KURULUM_ADI, KURULUM_TONU, depolama, para, tarihSaat } from "./bicim";
import { DAVET_DURUM_ADLARI } from "../hr/davet-durumu";
import { PanelDrawer } from "../components/panel-drawer";
import { createCustomerOrganization } from "./actions";
import { NewOrganizationWizard } from "./new-organization-wizard";
import { KiraciDosyasi, type DosyaDaveti, type DosyaKurumu, type DosyaUyeligi } from "./kiraci-dosyasi";
// Panel listesi ve kayıt detayının CSS'i konsol-ui'den geliyor; burada
// sihirbaz (.plw) ve kiracı dosyasının kalan plt-* sınıfları.
import "./platform.css";

/*
  Kiracı listesi ve tek kiracının dosyası.

  İkisi aynı yolda ama aynı anda değil: ?organization= varsa dosya, yoksa
  liste. Eskiden liste solda dar bir sütunda, dosya sağda duruyordu;
  kurucu bir kiracının paketine mi bakıyor yoksa hangi kiracıya
  bakacağını mı arıyor — ikisi aynı ekranda birbirini kısıtlıyordu.
  Liste artık tam genişlikte bir tablo: kiracı başına paket, durum, kota
  ve ücret tek bakışta yan yana. Kolon kolon karşılaştırmak, kartları tek
  tek açmaktan hızlı.

  Eski ?organization= bağlantıları olduğu gibi çalışıyor; konsolun her
  ekranından kiracı dosyasına o bağlantıyla giriliyor.
*/

type ManagedOrganization = DosyaKurumu;
type Invitation = DosyaDaveti;
/* Görünümün satırı: kurum + lisans + aktif üye + en son davet. */
type KiraciSatiri = DosyaKurumu & {
  user_limit: number | null;
  storage_limit_mb: number | null;
  monthly_fee: number | null;
  current_period_end: string | null;
  license_status: string | null;
  trial_ends_at: string | null;
  aktif_uye: number;
  davet_eposta: string | null;
  davet_durumu: string | null;
  davet_gonderildi: string | null;
  davet_kabul: string | null;
  davet_hatasi: string | null;
};
/* Sütunlar sayılı: `*` yan sorguları boşuna işletir (AGENTS.md). */
const KIRACI_SUTUNLARI = [
  "id", "name", "display_name", "slug", "status", "plan_code", "sector", "kind",
  "custom_domain", "custom_domain_status", "provisioning_state", "logo_url", "contact_phone", "grup_markasi",
  "user_limit", "storage_limit_mb", "monthly_fee", "current_period_end", "license_status", "trial_ends_at",
  "aktif_uye", "davet_eposta", "davet_durumu", "davet_gonderildi", "davet_kabul", "davet_hatasi",
].join(",");


const PENDING_STATES = new Set(["creating", "inviting_owner", "waiting_owner"]);


/** Türkçe duyarsız arama: "İş" ile "is" eşleşsin. */
const sadelestir = (value: string) =>
  value.replace(/İ/g, "i").replace(/I/g, "ı").toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i").replace(/ş/g, "s").replace(/ğ/g, "g")
    .replace(/ü/g, "u").replace(/ö/g, "o").replace(/ç/g, "c").trim();

export default async function PlatformPage({ searchParams }: { searchParams: Promise<{ organization?: string; provisioned?: string; filtre?: string; ara?: string }> }) {
  const { supabase, isPlatformOwner } = await getPanelContext();
  if (!isPlatformOwner) notFound();
  const params = await searchParams;

  /*
    TEK GÖRÜNÜM, KİRACI BAŞINA TEK SATIR (12.10.2026).

    Eskiden üç tablo ayrı ayrı ve BÜTÜN kiracılar için okunuyordu:
    organizations, bütün zamanların bütün davetleri ve bütün
    kiracıların bütün üyelikleri. Son ikisi iş hacmiyle büyüyor
    (personel giriş çıkışı); satır tavanına çarpıldığı gün kurulum
    rozetleri ve kota sayıları sessizce yanlışlanırdı — hem de lisans
    kararının okunduğu yerde.

    platform_kiraci_liste kiracı başına tek satır veriyor: lisans,
    aktif üye sayısı ve EN SON davet yan sorgularla. Kiracı sayısı
    bilerek sınırlanmıyor; o, Arvo'nun müşteri sayısı kadar ve
    Türkçe duyarsız arama ekranda kalabiliyor.
  */
  const [{ data: organizationData, error: organizationError }, { data: plans }] = await Promise.all([
    supabase.from("platform_kiraci_liste").select(KIRACI_SUTUNLARI).order("name"),
    supabase.from("plans").select("code,name").eq("is_active", true).order("created_at"),
  ]);
  if (organizationError) throw new Error("Kurum listesi okunamadı.");
  const kiracilar = (organizationData ?? []) as unknown as KiraciSatiri[];
  const organizations: ManagedOrganization[] = kiracilar;
  const latestInvitation = new Map<string, Invitation>(
    kiracilar
      .filter((satir) => satir.davet_eposta)
      .map((satir) => [satir.id, {
        organization_id: satir.id,
        email: satir.davet_eposta!,
        status: satir.davet_durumu ?? "pending",
        sent_at: satir.davet_gonderildi,
        accepted_at: satir.davet_kabul,
        error_message: satir.davet_hatasi,
      }]),
  );
  const planList = (plans ?? []).map((plan) => ({ code: String(plan.code), name: String(plan.name) }));
  const planNames = new Map(planList.map((plan) => [plan.code, plan.name]));

  /*
    Dosya modu yalnızca adres bir kiracıyı gösteriyorsa. Eskiden hiçbir
    kiracı seçilmemişken kurucunun KENDİ kurumunun dosyası açılıyordu:
    konsolu her açışta Arvo'nun kendi kaydı karşılıyordu, oysa aranan
    soru "hangi müşteriye bakmalıyım" idi.
  */
  const selected = params.organization ? organizations.find((item) => item.id === params.organization) ?? null : null;
  if (params.organization && !selected) notFound();

  const admin = createAdminClient();

  /*
    Kiracı listesindeki kota rozeti için tüm kurumların ölçümü. Kurum başına
    ayrı sayım sorgusu, kurum sayısı kadar gidiş dönüş demekti; satırlar
    zaten az, bellekte gruplanıyor.
  */
  const [{ data: tumUyelikler }, { data: depolamalar }] = await Promise.all([
    /* Üyelik SATIRLARI yalnızca açık olan kiracı için: dosya listeyi
       kişi kişi gösteriyor, liste ekranı yalnızca SAYIYI istiyor ve o
       görünümden geliyor. Eskiden bütün kiracıların bütün üyelikleri
       okunuyordu. */
    selected
      ? supabase.from("organization_memberships").select("organization_id,user_id,role,is_active")
          .eq("organization_id", selected.id)
      : Promise.resolve({ data: [] }),
    /*
      Depolama kullanımı storage.objects'ten geliyor; o tablo PostgREST'e
      açık değil ve olmamalı. Fonksiyon yalnızca kurum başına TOPLAM
      döndürüyor (dosya adı ve yolu dışarı çıkmıyor) ve yalnızca
      service_role çağırabiliyor.
    */
    admin ? admin.rpc("arvo_storage_usage") : Promise.resolve({ data: [] }),
  ]);
  const depolamaBayt = new Map(
    ((depolamalar ?? []) as { organization_id: string; bytes: number }[]).map((row) => [row.organization_id, Number(row.bytes ?? 0)]),
  );
  const aktifUyeSayisi = new Map(kiracilar.map((satir) => [satir.id, Number(satir.aktif_uye)]));
  /* Lisans alanları görünümde; lisansı olmayan kiracı için satır YOK
     (eskiden de yoktu, kota hesabı bunu bekliyor). */
  const lisansById = new Map(
    kiracilar
      .filter((satir) => satir.user_limit !== null && satir.storage_limit_mb !== null)
      .map((satir) => [satir.id, {
        organization_id: satir.id,
        user_limit: Number(satir.user_limit),
        storage_limit_mb: Number(satir.storage_limit_mb),
        monthly_fee: satir.monthly_fee,
        current_period_end: satir.current_period_end,
        license_status: satir.license_status ?? "trial",
        trial_ends_at: satir.trial_ends_at,
      }]),
  );
  const kotaById = new Map(
    [...lisansById.entries()].map(([id, lisans]) => [id, kotaDurumu({
      organizationId: id,
      kullaniciSayisi: aktifUyeSayisi.get(id) ?? 0,
      kullaniciLimiti: lisans.user_limit,
      depolamaBayt: depolamaBayt.get(id) ?? 0,
      depolamaLimitiMb: lisans.storage_limit_mb,
    })]),
  );

  // ArvoLab ayrı veritabanında; köprü koparsa tek iz orada kalır (lib/arvolab.ts).
  const bridge = await getArvolabBridgeHealth();
  // ArvoARC köprüsü sessiz çalışıyor; durumu yalnızca burada görünür (lib/arc-bridge.ts).
  const [arcBridge, randevuBridge] = await Promise.all([getArcBridgeHealth(), getRandevuBridgeHealth()]);


  // ---- Genel özet
  /*
    Sayaçlar yalnızca müşteri kurumları sayar. Kendi markalarımız listede
    görünür ama "kaç müşterim var" sorusunu bulandırmasın.
  */
  const customers = organizations.filter((item) => item.kind !== "internal");
  const activeCount = customers.filter((item) => item.provisioning_state === "active").length;
  const pendingCount = customers.filter((item) => PENDING_STATES.has(item.provisioning_state)).length;
  const sorunluMu = (item: ManagedOrganization) =>
    item.provisioning_state === "failed"
    || item.provisioning_state === "suspended"
    || item.status === "suspended"
    // Kota aşımı da "dikkat" sayılıyor: kurucunun bakması gereken kiracı.
    || kotaById.get(item.id)?.durum === "asildi";
  const issueCount = customers.filter(sorunluMu).length;

  /*
    Listeyi süzme. Kurucu sabah konsolu açtığında "bugün kime bakmam
    gerek" diye soruyor; cevabı listeyi taramakla değil tek tıkla
    gelmeli — süzgeç hem menüden hem tablonun üstündeki formdan
    geliyor. Süzgeç kendi markalarımızı dışarıda tutuyor: kurulum
    bekleyen ya da sorunlu olan biz değiliz.
  */
  const filtre = params.filtre === "kurulum" || params.filtre === "dikkat" ? params.filtre : null;
  const ara = (params.ara ?? "").trim();
  const anahtar = sadelestir(ara);
  const listelenen = (filtre === "kurulum"
    ? customers.filter((item) => PENDING_STATES.has(item.provisioning_state))
    : filtre === "dikkat"
      ? customers.filter(sorunluMu)
      : organizations)
    .filter((item) => !anahtar
      || sadelestir(item.display_name || item.name).includes(anahtar)
      || sadelestir(item.name).includes(anahtar)
      || sadelestir(item.slug).includes(anahtar));


  /* Süzgeci değiştirirken arama korunuyor: kurucu daralttığı listeden
     şeride tıklayınca aramasını kaybetmesin (panelin liste kuralı). */
  const adres = (ek: { filtre?: string; ara?: string }) => {
    const q = new URLSearchParams();
    const yeniFiltre = ek.filtre ?? filtre ?? "";
    const yeniAra = ek.ara ?? ara;
    if (yeniAra) q.set("ara", yeniAra);
    if (yeniFiltre) q.set("filtre", yeniFiltre);
    const metin = q.toString();
    return metin ? `/panel/platform?${metin}` : "/panel/platform";
  };

  const invitation = selected ? latestInvitation.get(selected.id) ?? null : null;
  const label = selected ? selected.display_name || selected.name : null;

  /* İstatistik kartının dağılımları: yukarıdaki sınırsız kiracı
     listesinden, yalnızca müşteri kurumları (sayaçlarla aynı kural). */
  const kurulumDagilimi = [...new Set(customers.map((item) => item.provisioning_state))]
    .map((durum) => ({ ad: KURULUM_ADI[durum] ?? durum, adet: customers.filter((item) => item.provisioning_state === durum).length }))
    .sort((a, b) => b.adet - a.adet);
  const paketDagilimi = [...new Set(customers.map((item) => item.plan_code))]
    .map((kod) => ({ ad: planNames.get(kod) ?? kod, adet: customers.filter((item) => item.plan_code === kod).length }))
    .sort((a, b) => b.adet - a.adet);

  /*
    PANEL GİBİ (14.10.2026). Liste panelin liste düzeninde (solda liste
    kartı, sağda istatistik), dosya panelin kayıt detayı düzeninde.
    Dosyada .stg kalıyor: erişim anahtarlarının (.plt-switch) panel düğme
    boyutundan korunması platform.css'te .stg.plt kapsamında.
  */
  return <main className={selected ? "stg plt talep cari" : "plt talep cari ekip liste-sayfa"}>
    <header className="talep-bas">
      <div className="talep-bas-metin">
        <small className="panel-kicker">{selected ? "KİRACI DOSYASI" : "YALNIZCA ARVOOS KURUCU ERİŞİMİ"}</small>
        <h1>{selected ? label : "Kiracılar"}</h1>
      </div>
      <div className="talep-bas-eylem">
        {selected
          ? <Link className="panel-secondary" href="/panel/platform">← Kiracı listesi</Link>
          : (
            <PanelDrawer triggerLabel="+ Yeni müşteri" kicker="YENİ MÜŞTERİ" title="Yeni müşteri kurulumu" description="Dört adımda kurum, paket ve sahip hesabı hazırlanır; davet otomatik gönderilir.">
              <NewOrganizationWizard action={createCustomerOrganization} plans={planList} existingSlugs={organizations.map((item) => item.slug)} />
            </PanelDrawer>
          )}
      </div>
    </header>

    {/* Köprü uyarıları renkli şerit (.plt-banner) yerine panelin sade notu. */}
    {bridge?.broken ? (
      <KNot ton="tehlike">
        <b>ArvoLab köprüsü yanıt vermiyor{bridge.permanent ? " · yapılandırma hatası" : ""}.</b>{" "}
        {bridge.permanent
          ? "Anahtar eksik ya da iki tarafta farklı. ArvoLab abonelik durumunu soramıyor ve kimseyi engellemediği için bireysel kullanıcılar şu an ücretsiz kullanıyor. Vercel'de PRODUCT_BRIDGE_SECRET'in iki projede de aynı olduğunu kontrol edin."
          : "ArvoLab, ArvoOS'a ulaşamıyor. Kullanıcılar engellenmiyor; sorun sürerse bireysel abonelikler denetlenemez."}
        {bridge.lastErrorAt ? ` Son hata: ${tarihSaat(bridge.lastErrorAt)}.` : ""}
        {bridge.lastOkAt ? ` Son başarılı bağlantı: ${tarihSaat(bridge.lastOkAt)}.` : " Hiç başarılı bağlantı kaydı yok."}
      </KNot>
    ) : null}

    {!arcBridge.ok ? (
      <KNot ton={arcBridge.error ? "tehlike" : "uyari"}>
        <b>{arcBridge.error ? "ArvoARC köprüsü bağlanamıyor." : "ArvoARC köprüsü kapalı."}</b>{" "}
        {arcBridge.error
          ? `ArvoARC veritabanına bağlanılamadı: ${arcBridge.error}. Anahtarın yeni ArvoARC projesinin secret anahtarı olduğunu kontrol edin.`
          : `Bu dağıtımda tanımlı olmayan değişkenler: ${arcBridge.missing.join(", ")}. Vercel'de ArvoOS projesine Production ortamı için ekleyip yeniden dağıtın.`}
      </KNot>
    ) : null}

    {!randevuBridge.ok ? (
      <KNot ton={randevuBridge.error ? "tehlike" : "uyari"}>
        <b>{randevuBridge.error ? "Randevu köprüsü bağlanamıyor." : "Randevu köprüsü kapalı."}</b>{" "}
        {randevuBridge.error
          ? `Randevu veritabanına bağlanılamadı: ${randevuBridge.error}. Anahtarın ArvoRandevu projesinin secret anahtarı olduğunu kontrol edin.`
          : `Bu dağıtımda tanımlı olmayan değişkenler: ${randevuBridge.missing.join(", ")}. Vercel'de ArvoOS projesine Production ortamı için ekleyip yeniden dağıtın. Tanımlanana kadar salon lisansları Randevu'ya yansımaz.`}
      </KNot>
    ) : null}

    {params.provisioned === "1" ? (
      <KNot ton="basari">
        <b>{selected ? label : "Kurum"} kuruldu.</b>{" "}
        Davet {invitation?.email ?? "sahibin e-posta adresine"} gönderildi. E-posta gelmezse “Kurulum durumu” bölümünden giriş bağlantısı oluşturup WhatsApp’tan gönderin.
      </KNot>
    ) : null}

    {/*
      Platform geneli sayılar kiracı panelindeki widget şeridiyle aynı dilde.
      Eskiden tek satırlık sıkışık bir şeritti: geniş bir kutunun sol
      köşesinde duruyor, boş alanı açıklamıyordu.

      Dördü de her zaman çiziliyor. Sıfır da bir cevaptır: "kurulum bekleyen
      yok" demek, satırın hiç olmamasından daha çok şey söyler.
    */}

    {/* Platform geneli sayılar yalnızca listede. Tek kiracının dosyası
        açıkken "kaç müşterim var" bir şey anlatmıyor; dosyanın kendi
        özeti hemen altında duruyor. */}
    {/*
      ŞERİT SÜZGECİN KENDİSİ (12.10.2026). Eskiden dört sayı kart
      olarak duruyordu: "Kurulum bekliyor 3" yazıyor ama o üçünü
      görmek için menüye ya da aşağıdaki seçime gitmek gerekiyordu.
      Panelin altı listesinde sayı zaten bağlantıdır; kurucu
      konsolunda da öyle. Sıfır da bir cevap olduğu için dördü de her
      zaman çiziliyor.
    */}
    {selected ? null : (
      <nav className="kayit-serit talep-serit" aria-label="Kiracı özeti">
        <dl>
          <div className={!filtre ? "is-active" : undefined}>
            <dt>Müşteri kurum</dt>
            <dd><Link href={adres({ filtre: "" })} aria-current={!filtre ? "page" : undefined}>{customers.length}</Link></dd>
          </div>
          <div>
            <dt>Kullanımda</dt>
            <dd className="cari-arti">{activeCount}</dd>
          </div>
          <div className={filtre === "kurulum" ? "is-active" : undefined}>
            <dt>Kurulum bekliyor</dt>
            <dd className={pendingCount ? "talep-uyari" : undefined}>
              <Link href={adres({ filtre: "kurulum" })} aria-current={filtre === "kurulum" ? "page" : undefined}>{pendingCount}</Link>
            </dd>
          </div>
          <div className={filtre === "dikkat" ? "is-active" : undefined}>
            <dt>Dikkat gerektiren</dt>
            <dd className={issueCount ? "cari-eksi" : undefined}>
              <Link href={adres({ filtre: "dikkat" })} aria-current={filtre === "dikkat" ? "page" : undefined}>{issueCount}</Link>
            </dd>
          </div>
          <div><dt>Kendi markamız</dt><dd>{organizations.length - customers.length}</dd></div>
        </dl>
      </nav>
    )}

    {selected ? (
      <KiraciDosyasi
        supabase={supabase}
        selected={selected}
        invitation={invitation}
        planList={planList}
        tumUyelikler={((tumUyelikler ?? []) as DosyaUyeligi[]).filter((satir) => satir.organization_id === selected.id)}
        seciliKota={kotaById.get(selected.id) ?? null}
        seciliLisans={lisansById.get(selected.id) ?? null}
      />
    ) : (
      <div className="talep-izgara personel-iki ekip-izgara">
        <section className="panel-card talep-bilgi" aria-label="Kiracılar">
          {/*
            Süzgeç menüden de geliyor (Kurulum bekleyenler) ama tek giriş
            yolu olmamalı: kurucu tabloya bakarken aradığını buradan
            daraltıyor. "Dikkat gerektirenler" ayrı bir menü öğesiydi;
            listenin kendi süzgeci olunca menüde ikinci bir yol tutmanın
            karşılığı kalmadı.

            Görünüm seçimi (filtre) eskiden bir açılır listeydi ve
            "Filtrele" düğmesiyle gönderiliyordu; artık panel listelerindeki
            gibi çip. Arama kutusu aynı ara/filtre parametrelerini yolluyor.
          */}
          <div className="ekip-suzgec talep-suzgec">
            <Link href={adres({ filtre: "" })} className={!filtre ? "is-active" : undefined} aria-current={!filtre ? "page" : undefined}>Tüm kurumlar <small>{organizations.length}</small></Link>
            <Link href={adres({ filtre: "kurulum" })} className={filtre === "kurulum" ? "is-active" : undefined} aria-current={filtre === "kurulum" ? "page" : undefined}>Kurulum bekleyenler <small>{pendingCount}</small></Link>
            <Link href={adres({ filtre: "dikkat" })} className={filtre === "dikkat" ? "is-active" : undefined} aria-current={filtre === "dikkat" ? "page" : undefined}>Dikkat gerektirenler <small>{issueCount}</small></Link>
            <form action="/panel/platform" className="talep-ara" role="search">
              {filtre ? <input type="hidden" name="filtre" value={filtre} /> : null}
              <input type="search" name="ara" defaultValue={ara} placeholder="Ad ya da çalışma alanı" aria-label="Kurum ara" />
            </form>
          </div>

          {listelenen.length ? (
            /*
              TABLO DEĞİL, IZGARA LİSTE (eski not; 14.10.2026'dan beri yine
              tablo — aşağıya bakın).

              Satırın tamamını tıklanabilir yapmak için <tr> üzerine
              position:relative + ::after kaplaması konmuştu. Bu, birleşik
              kenarlıklı bir tabloda (border-collapse: collapse) WebKit'te
              çalışmıyor: <tr> kuşatan blok üretmiyor, kaplama en yakın
              konumlandırılmış ataya — yani sayfaya — yayılıyor ve DOM'daki
              SON satırın kaplaması bütün listeyi örtüyordu. Hangi kuruma
              tıklanırsa tıklansın en alttaki kurum açılıyordu.

              Satırın kendisi bir <a> yapılmıştı. Panel tablosu (KTablo)
              artık kaplama kullanmıyor: tabloya tek bir tıklama dinleyicisi
              bağlı ve satırın ilk hücresindeki gerçek bağlantıya gidiyor
              (crm/satir-tiklama.tsx). Klavye, orta tık ve "yeni sekmede
              aç" o bağlantı üzerinden çalışıyor; konsol bu yüzden panelin
              tablosuna dönebildi.

              iOS LİSTESİ (14.10.2026, "iOS gibi olmalı"): sekiz sütunlu
              tablo yerine tek satır. Solda simge ve ad; altında tek satır
              paket · depolama · son davet · çalışma alanı; sağda kurulum
              durumu ve aylık ücret, ücretin altında kullanıcı kotası.
              Satır gerçek bir <a> (KOge), kaplama ya da tıklama dinleyicisi
              yok. Kota aşımı ve gönderilemeyen davet yine uyarı renginde.
            */
            <KListe>
              {listelenen.map((item) => {
                const kota = kotaById.get(item.id) ?? null;
                const lisans = lisansById.get(item.id) ?? null;
                const ad = item.display_name || item.name;
                const itemInvite = latestInvitation.get(item.id);
                const href = `/panel/platform?organization=${item.id}`;
                const durumAdi = KURULUM_ADI[item.provisioning_state] ?? item.provisioning_state;
                const durumTonu = KURULUM_TONU[item.provisioning_state] ?? "neutral";
                const davetAdi = itemInvite ? DAVET_DURUM_ADLARI[itemInvite.status] ?? itemInvite.status : null;
                /* Satırın tek satırlık özeti; parçalar " · " ile. Kota
                   aşımı uyarı renginde: "dikkat gerektiren" uyarısı ayrı
                   bir menü öğesi değil, satırın kendisi söylüyor. Son
                   davet: kurulum bekleyen kiracıda kurucunun ilk sorusu
                   "davet gitti mi, kabul edildi mi"; hata varsa uyarı
                   renginde — sebebi dosyada yazılı. */
                const davetTarihi = itemInvite?.accepted_at ? tarihSaat(itemInvite.accepted_at)
                  : itemInvite?.sent_at ? tarihSaat(itemInvite.sent_at) : null;
                const ozet: ReactNode[] = [
                  planNames.get(item.plan_code) ?? item.plan_code,
                  kota ? <span className={kota.depolama.asildi ? "talep-uyari" : undefined}>{depolama(kota.depolama.kullanilan)} / {depolama(kota.depolama.limit)}</span> : null,
                  itemInvite ? <span className={itemInvite.status === "failed" ? "talep-uyari" : undefined}>Davet: {davetAdi}{davetTarihi ? ` ${davetTarihi}` : ""}</span> : null,
                  item.provisioning_state === "waiting_owner" && itemInvite?.email ? itemInvite.email : null,
                  item.kind === "internal" ? "kendi markamız" : null,
                  item.slug,
                ].filter(Boolean);
                return (
                  <KOge
                    key={item.id}
                    href={href}
                    simge={ad}
                    baslik={ad}
                    alt={ozet.map((parca, sira) => <Fragment key={sira}>{sira ? " · " : ""}{parca}</Fragment>)}
                    durum={{ etiket: durumAdi, ton: durumTonu }}
                    /* Ücreti girilmemiş müşteri lisansı ₺0 yazmıyor: eksik
                       kayıt, ücretsiz değil. Kendi markamızda ücret beklenmiyor. */
                    deger={lisans?.monthly_fee ? para(Number(lisans.monthly_fee))
                      : item.kind === "internal" ? "—" : <span className="k-ios-eksik">Ücret yok</span>}
                    degerAlt={kota
                      ? <span className={kota.kullanici.asildi ? "talep-uyari" : undefined}>{kota.kullanici.kullanilan} / {kota.kullanici.limit} kullanıcı</span>
                      : undefined}
                  />
                );
              })}
            </KListe>
          ) : (
            <KBos baslik={
              filtre === "kurulum" ? "Kurulum bekleyen kurum yok."
                : filtre === "dikkat" ? "Dikkat gerektiren kurum yok; kotalar ve kurulumlar yolunda."
                : ara ? `“${ara}” ile eşleşen kurum yok.`
                : "Henüz kurum yok. “+ Yeni müşteri” ile ilk kurumu kurun."
            } />
          )}
        </section>

        {/* Kart süzgeçten bağımsız: "kaç müşterim var" sorusunun yanıtı
            seçili çipe göre değişmesin. Sayılar şeritle aynı hesaptan.

            SAĞ SÜTUN SADE (14.10.2026, "iOS gibi"): İstatistik kartının
            dört kutusu şeritteki dört sayının AYNISIYDI. Kalanlar yalnızca
            şeritte olmayan iki dağılım, iOS listesi olarak. */}
        <div className="liste-sag">
          <KKart baslik="Kurulum durumu" aciklama="Müşteri kurumları; kendi markalarımız hariç">
            <KListe>
              {kurulumDagilimi.map((d) => (
                <KOge key={d.ad} baslik={d.ad} deger={String(d.adet)} />
              ))}
            </KListe>
          </KKart>
          <KKart baslik="Paketler">
            <KListe>
              {paketDagilimi.map((d) => (
                <KOge key={d.ad} baslik={d.ad} deger={String(d.adet)} />
              ))}
            </KListe>
          </KKart>
        </div>
      </div>
    )}
  </main>;
}
