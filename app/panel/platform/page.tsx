import Link from "next/link";
import { notFound } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { getArvolabBridgeHealth } from "@/lib/arvolab";
import { getArcBridgeHealth } from "@/lib/arc-bridge";
import { getRandevuBridgeHealth } from "@/lib/randevu-bridge";
import { kotaDurumu } from "@/lib/kota-durumu";
import { StgIcon, StgWidget } from "../settings/settings-ui";
import { KURULUM_ADI, KURULUM_TONU, basHarfleri, depolama, para, tarihSaat } from "./bicim";
import { PanelDrawer } from "../components/panel-drawer";
import { createCustomerOrganization } from "./actions";
import { NewOrganizationWizard } from "./new-organization-wizard";
import { KiraciDosyasi, type DosyaDaveti, type DosyaKurumu, type DosyaUyeligi } from "./kiraci-dosyasi";
import "../settings/settings.css";
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

  const [{ data: organizationData, error: organizationError }, { data: invitationData }, { data: plans }] = await Promise.all([
    supabase.from("organizations").select("id,name,display_name,slug,status,plan_code,sector,custom_domain,custom_domain_status,provisioning_state,logo_url,kind,contact_phone").order("name"),
    supabase.from("organization_invitations").select("organization_id,email,status,sent_at,accepted_at,error_message").order("created_at", { ascending: false }),
    supabase.from("plans").select("code,name").eq("is_active", true).order("created_at"),
  ]);
  if (organizationError) throw new Error("Kurum listesi okunamadı.");
  const organizations = (organizationData ?? []) as ManagedOrganization[];
  const latestInvitation = new Map<string, Invitation>();
  for (const invitation of (invitationData ?? []) as Invitation[]) {
    if (!latestInvitation.has(invitation.organization_id)) latestInvitation.set(invitation.organization_id, invitation);
  }
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
  const [{ data: tumUyelikler }, { data: tumLisanslar }, { data: depolamalar }] = await Promise.all([
    supabase.from("organization_memberships").select("organization_id,user_id,role,is_active"),
    supabase.from("organization_licenses").select("organization_id,user_limit,storage_limit_mb,ai_credit_limit,ai_credits_used,monthly_fee,current_period_end,license_status,trial_ends_at"),
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
  const aktifUyeSayisi = new Map<string, number>();
  for (const satir of (tumUyelikler ?? []) as { organization_id: string; is_active: boolean }[]) {
    if (satir.is_active) aktifUyeSayisi.set(satir.organization_id, (aktifUyeSayisi.get(satir.organization_id) ?? 0) + 1);
  }
  const lisansById = new Map(
    ((tumLisanslar ?? []) as { organization_id: string; user_limit: number; storage_limit_mb: number; ai_credit_limit: number; ai_credits_used: number; monthly_fee: number | null; current_period_end: string | null; license_status: string; trial_ends_at: string | null }[])
      .map((row) => [row.organization_id, row]),
  );
  const kotaById = new Map(
    [...lisansById.entries()].map(([id, lisans]) => [id, kotaDurumu({
      organizationId: id,
      kullaniciSayisi: aktifUyeSayisi.get(id) ?? 0,
      kullaniciLimiti: lisans.user_limit,
      aiKullanilan: lisans.ai_credits_used,
      aiLimiti: lisans.ai_credit_limit,
      depolamaBayt: depolamaBayt.get(id) ?? 0,
      depolamaLimitiMb: lisans.storage_limit_mb,
    })]),
  );

  // ArvoLab ayrı veritabanında; köprü koparsa tek iz orada kalır (lib/arvolab.ts).
  const bridge = await getArvolabBridgeHealth();
  // ARC köprüsü sessiz çalışıyor; durumu yalnızca burada görünür (lib/arc-bridge.ts).
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


  const invitation = selected ? latestInvitation.get(selected.id) ?? null : null;
  const label = selected ? selected.display_name || selected.name : null;

  return <div className="stg plt">
    <div className="panel-pagehead">
      <div>
        <small className="panel-kicker">{selected ? "KİRACI DOSYASI" : "YALNIZCA ARVOOS KURUCU ERİŞİMİ"}</small>
        <h1>{selected ? label : "Kiracılar"}</h1>
        <p>{selected ? "Paket, modüller, üyeler ve kurulum durumu tek dosyada." : "Müşteri kurumlarını kurun, sahiplerini panele alın, paket ve modüllerini yönetin."}</p>
      </div>
      <div className="panel-page-actions">
        {selected
          ? <Link className="panel-secondary" href="/panel/platform">← Kiracı listesi</Link>
          : (
            <PanelDrawer triggerLabel="+ Yeni müşteri" kicker="YENİ MÜŞTERİ" title="Yeni müşteri kurulumu" description="Dört adımda kurum, paket ve sahip hesabı hazırlanır; davet otomatik gönderilir.">
              <NewOrganizationWizard action={createCustomerOrganization} plans={planList} existingSlugs={organizations.map((item) => item.slug)} />
            </PanelDrawer>
          )}
      </div>
    </div>

    {bridge?.broken ? (
      <div className="plt-banner" data-tone="danger" role="alert">
        <span className="plt-banner-icon"><StgIcon name="shield" size={18} /></span>
        <div>
          <b>ArvoLab köprüsü yanıt vermiyor{bridge.permanent ? " · yapılandırma hatası" : ""}</b>
          <p>
            {bridge.permanent
              ? "Anahtar eksik ya da iki tarafta farklı. ArvoLab abonelik durumunu soramıyor ve kimseyi engellemediği için bireysel kullanıcılar şu an ücretsiz kullanıyor. Vercel'de PRODUCT_BRIDGE_SECRET'in iki projede de aynı olduğunu kontrol edin."
              : "ArvoLab, ArvoOS'a ulaşamıyor. Kullanıcılar engellenmiyor; sorun sürerse bireysel abonelikler denetlenemez."}
            {bridge.lastErrorAt ? ` Son hata: ${tarihSaat(bridge.lastErrorAt)}.` : ""}
            {bridge.lastOkAt ? ` Son başarılı bağlantı: ${tarihSaat(bridge.lastOkAt)}.` : " Hiç başarılı bağlantı kaydı yok."}
          </p>
        </div>
      </div>
    ) : null}

    {!arcBridge.ok ? (
      <div className="plt-banner" data-tone={arcBridge.error ? "danger" : undefined} role="status">
        <span className="plt-banner-icon"><StgIcon name="shield" size={18} /></span>
        <div>
          <b>{arcBridge.error ? "ARC köprüsü bağlanamıyor" : "ARC köprüsü kapalı"}</b>
          <p>
            {arcBridge.error
              ? `ARC veritabanına bağlanılamadı: ${arcBridge.error}. Anahtarın yeni ARC projesinin secret anahtarı olduğunu kontrol edin.`
              : `Bu dağıtımda tanımlı olmayan değişkenler: ${arcBridge.missing.join(", ")}. Vercel'de ArvoOS projesine Production ortamı için ekleyip yeniden dağıtın.`}
          </p>
        </div>
      </div>
    ) : null}

    {!randevuBridge.ok ? (
      <div className="plt-banner" data-tone={randevuBridge.error ? "danger" : undefined} role="status">
        <span className="plt-banner-icon"><StgIcon name="shield" size={18} /></span>
        <div>
          <b>{randevuBridge.error ? "Randevu köprüsü bağlanamıyor" : "Randevu köprüsü kapalı"}</b>
          <p>
            {randevuBridge.error
              ? `Randevu veritabanına bağlanılamadı: ${randevuBridge.error}. Anahtarın ArvoRandevu projesinin secret anahtarı olduğunu kontrol edin.`
              : `Bu dağıtımda tanımlı olmayan değişkenler: ${randevuBridge.missing.join(", ")}. Vercel'de ArvoOS projesine Production ortamı için ekleyip yeniden dağıtın. Tanımlanana kadar salon lisansları Randevu'ya yansımaz.`}
          </p>
        </div>
      </div>
    ) : null}

    {params.provisioned === "1" ? (
      <div className="plt-banner" role="status">
        <span className="plt-banner-icon"><StgIcon name="check" size={18} /></span>
        <div>
          <b>{selected ? label : "Kurum"} kuruldu</b>
          <p>Davet {invitation?.email ?? "sahibin e-posta adresine"} gönderildi. E-posta gelmezse “Kurulum durumu” bölümünden giriş bağlantısı oluşturup WhatsApp’tan gönderin.</p>
        </div>
      </div>
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
    {selected ? null : (
      <div className="stg-widgets" aria-label="Platform özeti">
        <StgWidget tone="info" icon="building" label="Müşteri kurum" value={customers.length} note={`${customers.length + 1} kurum kaydı`} />
        <StgWidget tone="success" icon="check" label="Kullanımda" value={activeCount} note="Sahibi panele girmiş" />
        <StgWidget tone={pendingCount ? "warning" : "neutral"} icon="users" label="Kurulum bekliyor" value={pendingCount} note={pendingCount ? "Sahip daveti tamamlanmadı" : "Bekleyen yok"} />
        <StgWidget tone={issueCount ? "danger" : "neutral"} icon="shield" label="Dikkat gerektiren" value={issueCount} note={issueCount ? "Kurulum hatası ya da kota aşımı" : "Sorun yok"} />
      </div>
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
      <>
        {/*
          Süzgeç menüden de geliyor (Kurulum bekleyenler) ama tek giriş
          yolu olmamalı: kurucu tabloya bakarken aradığını buradan
          daraltıyor. "Dikkat gerektirenler" ayrı bir menü öğesiydi;
          listenin kendi süzgeci olunca menüde ikinci bir yol tutmanın
          karşılığı kalmadı.
        */}
        <section className="panel-card plt-suzgec">
          <form action="/panel/platform" className="plt-suzgec-form">
            <label>
              <span>Kurum ara</span>
              <input name="ara" defaultValue={ara} placeholder="Ad ya da çalışma alanı" />
            </label>
            <label>
              <span>Görünüm</span>
              <select name="filtre" defaultValue={filtre ?? ""}>
                <option value="">Tüm kurumlar</option>
                <option value="kurulum">Kurulum bekleyenler</option>
                <option value="dikkat">Dikkat gerektirenler</option>
              </select>
            </label>
            <div>
              <button className="panel-primary" type="submit">Filtrele</button>
              {filtre || ara ? <Link className="panel-secondary" href="/panel/platform">Temizle</Link> : null}
            </div>
          </form>
        </section>

        {listelenen.length ? (
          <section className="panel-card plt-kiracilar" aria-label="Kiracılar">
            {/*
              TABLO DEĞİL, IZGARA LİSTE.

              Satırın tamamını tıklanabilir yapmak için <tr> üzerine
              position:relative + ::after kaplaması konmuştu. Bu, birleşik
              kenarlıklı bir tabloda (border-collapse: collapse) WebKit'te
              çalışmıyor: <tr> kuşatan blok üretmiyor, kaplama en yakın
              konumlandırılmış ataya — yani sayfaya — yayılıyor ve DOM'daki
              SON satırın kaplaması bütün listeyi örtüyordu. Hangi kuruma
              tıklanırsa tıklansın en alttaki kurum açılıyordu.

              Satırın kendisi artık bir <a>: kaplama yok, hile yok. Klavye,
              orta tık ve "yeni sekmede aç" doğal olarak çalışıyor.
              Hizalama ızgaradan geliyor; başlık satırı aynı şablonu
              kullandığı için sütunlar tabloyla aynı şekilde hizalı.
            */}
            <div className="plt-kiraci-baslik" aria-hidden="true">
              <span>Kurum</span>
              <span>Paket</span>
              <span>Durum</span>
              <span>Kullanıcı</span>
              <span>Depolama</span>
              <span>Aylık ücret</span>
              <span />
            </div>

            <div className="plt-kiraci-liste">
              {listelenen.map((item) => {
                const kota = kotaById.get(item.id) ?? null;
                const lisans = lisansById.get(item.id) ?? null;
                const ad = item.display_name || item.name;
                const itemInvite = latestInvitation.get(item.id);
                return (
                  <Link
                    key={item.id}
                    className="plt-kiraci-satir"
                    href={`/panel/platform?organization=${item.id}`}
                  >
                    <span className="plt-kiraci-kim">
                      <span className="plt-kiraci-avatar" data-tone={KURULUM_TONU[item.provisioning_state] ?? "neutral"}>{basHarfleri(ad)}</span>
                      <span>
                        <b>{ad}</b>
                        <small className="plt-substatus">
                          {item.slug}
                          {item.kind === "internal" ? " · kendi markamız" : ""}
                          {item.provisioning_state === "waiting_owner" && itemInvite?.email ? ` · ${itemInvite.email}` : ""}
                        </small>
                      </span>
                    </span>

                    <span data-etiket="Paket">{planNames.get(item.plan_code) ?? item.plan_code}</span>

                    <span data-etiket="Durum">
                      <span className="status-pill" data-tone={KURULUM_TONU[item.provisioning_state] ?? "neutral"}>
                        {KURULUM_ADI[item.provisioning_state] ?? item.provisioning_state}
                      </span>
                    </span>

                    {/* Kota hücreleri aşımda kırmızı: "dikkat gerektiren"
                        uyarısı ayrı bir menü öğesi değil, satırın kendisi
                        söylüyor. */}
                    <span data-etiket="Kullanıcı" data-tone={kota?.kullanici.asildi ? "danger" : undefined}>
                      {kota ? `${kota.kullanici.kullanilan} / ${kota.kullanici.limit}` : "—"}
                    </span>
                    <span data-etiket="Depolama" data-tone={kota?.depolama.asildi ? "danger" : undefined}>
                      {kota ? `${depolama(kota.depolama.kullanilan)} / ${depolama(kota.depolama.limit)}` : "—"}
                    </span>
                    <span data-etiket="Aylık ücret">{lisans?.monthly_fee ? para(Number(lisans.monthly_fee)) : "—"}</span>

                    <span className="plt-kiracilar-uc" aria-hidden="true">›</span>
                  </Link>
                );
              })}
            </div>
          </section>
        ) : (
          <div className="stg-empty">
            <StgIcon name="building" size={22} />
            <p>
              {filtre === "kurulum" ? "Kurulum bekleyen kurum yok."
                : filtre === "dikkat" ? "Dikkat gerektiren kurum yok; kotalar ve kurulumlar yolunda."
                : ara ? `“${ara}” ile eşleşen kurum yok.`
                : "Henüz kurum yok. “+ Yeni müşteri” ile ilk kurumu kurun."}
            </p>
          </div>
        )}
      </>
    )}
  </div>;
}
