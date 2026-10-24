import Link from "next/link";
import { getPanelContext } from "@/lib/panel-context";
import { canSeeFinanceReports } from "../finance-navigation";
import { modulGerek, yetkiGerek } from "@/lib/modul-kapisi";
import { donemCoz, donemEtiketi } from "@/lib/rapor-donemi";
import { gorulebilenRaporlar, raporAdresi, raporBul, type RaporAnahtari } from "@/lib/rapor-tanimlari";
import { Icon } from "./rapor-parcalari";
import { RaporPenceresi } from "./rapor-penceresi";
import { KokpitRaporu } from "./kokpit-raporu";
import { SatisRaporu } from "./satis-raporu";
import { TahsilatRaporu } from "./tahsilat-raporu";
import { TeklifRaporu } from "./teklif-raporu";
import { FinansRaporu } from "./finans-raporu";
import { CrmRaporu } from "./crm-raporu";
import { OperasyonRaporu } from "./operasyon-raporu";
import { PersonelRaporu } from "./personel-raporu";
// Sayfa başlığı (talep-bas) öteki panel sayfalarıyla aynı düzen.
import "../../crm/kayit-detay/kayit-detay.css";
import "./reporting.css";

/*
  RAPOR MERKEZİ (2026-10-24, kurum sahibinin kuralı: "tek sayfa").

  Bu sayfa eskiden raporun KENDİSİYDİ: on KPI kutusu, beş kart ve
  defterler tek akışta duruyordu. Sekiz rapor aynı yere sığmaz —
  sayfa ekranın onlarca katına uzardı.

  Artık sayfa bir MERKEZ: hangi raporların olduğunu ve kullanıcının
  hangilerini açabildiğini gösteriyor; rapor adresten açılıyor
  (`?rapor=satis`) ve içeriği pencerede çiziliyor. Eski içerik
  silinmedi, "Yönetici Kokpiti" raporuna taşındı.

  ADRESTEN AÇILMANIN sebebi yerel bir durum değil: sorgular sunucuda
  kalıyor (RLS kendiliğinden uyguluyor), geri tuşu çalışıyor ve
  dönem/süzgeç raporlar arası geçişte taşınıyor. Bu depodaki
  `?pencere=` kalıbının aynısı.

  KAPI BURADA, GÖVDEDE DEĞİL. Modül + rol yetkisi bu sayfada
  soruluyor; rapor gövdeleri yalnızca veri okuyor. Her gövdeye kapı
  koymak, birinde unutulduğunda sessizce açık bir rapor bırakırdı
  (AGENTS.md "Yetki üç yerdedir").
*/

const TABAN = "/panel/finance/raporlar";

/*
  GÖVDESİ YAZILMIŞ RAPORLAR. Kart listesi sekiz raporun tamamını
  gösteriyor ama yalnızca gövdesi olan açılıyor: boş bir pencere
  açmak, kullanıcıya "rapor var" deyip hiçbir şey göstermemek olurdu.
  Bir rapor yazıldıkça buraya ekleniyor ve kart kendiliğinden
  tıklanabilir oluyor.
*/
/*
  SEKİZ RAPORUN HEPSİ HAZIR (24.10.2026). Liste yine duruyor: yeni bir
  rapor eklendiğinde gövdesi yazılana kadar kartı tıklanamaz kalsın
  diye. Boş pencere açmak, kusuru kullanıcının hatası gibi
  gösterirdi.
*/
const HAZIR = new Set<RaporAnahtari>([
  "kokpit", "satis", "crm", "tahsilat", "finans", "personel", "operasyon", "teklif",
]);

/*
  EXCEL'E AKTARILABİLEN RAPORLAR. Dışa aktarma, raporun modelini
  döndüren bir işlev gerektiriyor (ekranla dosyanın aynı sayıyı
  göstermesi için); o işlev yazılmadan düğmeyi göstermek, basınca
  hata veren bir düğme olurdu.

  Kokpit bilerek listede DEĞİL: özeti olduğu sekiz raporun kendi
  dosyaları var ve kokpitin tablosu yok, yorumu var — yorumu Excel'e
  dökmek bir hücreye paragraf yazmak olurdu.
*/
const INDIRILEBILIR = new Set<RaporAnahtari>([
  "satis", "crm", "tahsilat", "finans", "personel", "operasyon", "teklif",
]);

export default async function ReportingPage({
  searchParams,
}: {
  searchParams: Promise<{ rapor?: string; aralik?: string; baslangic?: string; bitis?: string; personel?: string; musteri?: string }>;
}) {
  const params = await searchParams;
  const { membership, organization, modules, yetkiler, izin, supabase } = await getPanelContext();
  // Finans kapısı (sahip/yönetici) layout'ta; burada Raporlar modülü ve rol yetkisi
  const access = { modules, yetkiler };
  /* Kapı iki parçalı: Raporlama modülü kurumda açık mı, rolde rapor
     yetkisi var mı. Ekran hangisinin eksik olduğunu yazsın diye ayrı
     soruluyor — "modül kapalı" ile "yetkin yok" farklı iki cevap. */
  modulGerek(modules, "reporting");
  yetkiGerek(canSeeFinanceReports(access), "reporting");

  const donem = donemCoz(params.aralik, params.baslangic, params.bitis);
  const { startKey, endKey, key } = donem;
  const donemEtiket = donemEtiketi(donem);
  const organizationId = membership.organization_id;

  const acilabilir = gorulebilenRaporlar(izin);
  /*
    ADRESTEKİ RAPOR İKİ KEZ SÜZÜLÜYOR: önce gerçek bir rapor mu
    (`raporBul`), sonra bu kullanıcının yetkisi var mı. Yetkisiz
    anahtar için pencere açmamak yetmez — açılmayan pencere sessizce
    yok sayılırsa kullanıcı neden boş sayfa gördüğünü anlamaz; kart
    listesi zaten yalnızca açabildiklerini gösteriyor.
  */
  const istenen = raporBul(params.rapor);
  const acik = istenen && acilabilir.some((r) => r.anahtar === istenen.anahtar) ? istenen : null;

  const donemAdresi = (aralik: string) => `${TABAN}?aralik=${aralik}${params.rapor ? `&rapor=${params.rapor}` : ""}`;

  /* Dosya adresi dönemi TAŞIYOR: ekranda "geçen ay" açıkken inen
     dosyanın bu ayı göstermesi, kullanıcının fark etmeyeceği bir
     yanlışlık olurdu. */
  const indirmeAdresi = (anahtar: RaporAnahtari) => {
    const p = new URLSearchParams({ rapor: anahtar, aralik: key });
    if (key === "ozel") { p.set("baslangic", startKey); p.set("bitis", endKey); }
    return `${TABAN}/indir?${p.toString()}`;
  };

  return <div className="rpt">
    <header className="talep-bas rpt-bas">
      <div className="talep-bas-metin"><small className="panel-kicker">FİNANS</small><h1>Raporlar</h1></div>
      <div className="talep-bas-eylem"><span className="status-pill rpt-range-pill" data-tone="gold">{donemEtiket}</span></div>
    </header>

    {/* Dönem MERKEZDE seçiliyor ve pencereye adresle taşınıyor: her
        raporun kendi dönem çubuğu olsaydı kullanıcı sekiz kez aynı
        aralığı kurardı ve iki rapor farklı dönemle yan yana
        karşılaştırılabilirdi. */}
    <section className="rpt-toolbar" aria-label="Rapor dönemi">
      <nav className="rpt-segment" aria-label="Hazır dönemler">
        <Link className={key === "bu_ay" ? "is-active" : undefined} aria-current={key === "bu_ay" ? "page" : undefined} href={donemAdresi("bu_ay")}>Bu Ay</Link>
        <Link className={key === "gecen_ay" ? "is-active" : undefined} aria-current={key === "gecen_ay" ? "page" : undefined} href={donemAdresi("gecen_ay")}>Geçen Ay</Link>
        <Link className={key === "bu_yil" ? "is-active" : undefined} aria-current={key === "bu_yil" ? "page" : undefined} href={donemAdresi("bu_yil")}>Bu Yıl</Link>
      </nav>
      <form className={`rpt-range-form${key === "ozel" ? " is-active" : ""}`} method="get">
        <input type="hidden" name="aralik" value="ozel"/>
        {params.rapor ? <input type="hidden" name="rapor" value={params.rapor}/> : null}
        <span className="rpt-range-label">Özel aralık</span>
        <input name="baslangic" type="date" defaultValue={key === "ozel" ? startKey : undefined} required aria-label="Başlangıç tarihi"/>
        <span className="rpt-range-sep" aria-hidden="true">–</span>
        <input name="bitis" type="date" defaultValue={key === "ozel" ? endKey : undefined} required aria-label="Bitiş tarihi"/>
        <button className="panel-secondary" type="submit">Uygula</button>
      </form>
    </section>

    <section className="rpt-merkez" aria-label="Raporlar">
      {acilabilir.map((rapor) => {
        const hazir = HAZIR.has(rapor.anahtar);
        const govde = <>
          <span className="rapor-kart-ikon" aria-hidden="true"><Icon name={rapor.ikon} size={20} /></span>
          <small className="panel-kicker">{rapor.kod}</small>
          <b>{rapor.baslik}</b>
          <p>{rapor.aciklama}</p>
          <span className="rapor-kart-alt">
            {hazir ? <>Raporu aç<i aria-hidden="true"> ›</i></> : "Hazırlanıyor"}
          </span>
        </>;
        return hazir
          ? <Link key={rapor.anahtar} className="rapor-kart" href={raporAdresi(TABAN, rapor.anahtar, params)}>{govde}</Link>
          /* Gövdesi olmayan rapor bağlantı DEĞİL: tıklanabilir
             görünüp boş pencere açmak, kullanıcıya kusuru kendi
             hatası gibi gösterirdi. */
          : <article key={rapor.anahtar} className="rapor-kart is-bekliyor">{govde}</article>;
      })}
      {acilabilir.length === 0 ? (
        <p className="rpt-empty-note">Rolünüzde açık bir rapor yetkisi yok. Ayarlar → Yetkilendirme’den rapor yetkileri verilebilir.</p>
      ) : null}
    </section>

    {acik ? (
      <RaporPenceresi
        rapor={acik}
        donemEtiket={donemEtiket}
        taban={TABAN}
        params={params}
        kurum={organization.name}
        komsular={acilabilir.filter((r) => HAZIR.has(r.anahtar))}
        indirmeAdresi={INDIRILEBILIR.has(acik.anahtar) && izin("rapor.disa_aktar") ? indirmeAdresi(acik.anahtar) : undefined}
      >
        {acik.anahtar === "kokpit" ? <KokpitRaporu supabase={supabase} organizationId={organizationId} donem={donem} /> : null}
        {acik.anahtar === "satis" ? <SatisRaporu supabase={supabase} organizationId={organizationId} donem={donem} /> : null}
        {acik.anahtar === "tahsilat" ? <TahsilatRaporu supabase={supabase} organizationId={organizationId} donem={donem} /> : null}
        {acik.anahtar === "teklif" ? <TeklifRaporu supabase={supabase} organizationId={organizationId} donem={donem} /> : null}
        {acik.anahtar === "finans" ? <FinansRaporu supabase={supabase} organizationId={organizationId} donem={donem} /> : null}
        {acik.anahtar === "crm" ? <CrmRaporu supabase={supabase} organizationId={organizationId} donem={donem} /> : null}
        {acik.anahtar === "operasyon" ? <OperasyonRaporu supabase={supabase} organizationId={organizationId} donem={donem} /> : null}
        {acik.anahtar === "personel" ? <PersonelRaporu supabase={supabase} organizationId={organizationId} donem={donem} /> : null}
      </RaporPenceresi>
    ) : null}
  </div>;
}
