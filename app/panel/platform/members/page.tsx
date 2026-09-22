import { notFound } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";
import { getMemberDirectory } from "@/lib/member-directory";
import { UyeListesi } from "./uye-listesi";
import { StgIcon, StgWidget } from "../../settings/settings-ui";
import "../../settings/settings.css";
import "../platform.css";

export default async function MembersPage() {
  const { isPlatformOwner } = await getPanelContext();
  if (!isPlatformOwner) notFound();

  const { rows, arvolabReachable, kullanicilarTam } = await getMemberDirectory();
  const people = new Set(rows.map((row) => row.email ?? row.userId));
  const individuals = new Set(rows.filter((row) => row.individual).map((row) => row.email ?? row.userId));
  /*
    Sayılar ÜRÜN KAYDI değil KİŞİ × KURUM üzerinden. Liste kiracı bazında
    ve anahtar da kişinin o kurumdaki erişimini açıp kapatıyor; widget ürün
    kaydı sayarsa ekrandaki anahtar sayısıyla tutmuyor. Aynı kişinin bir
    kurumda beş ürünü varsa bu bir erişimdir, beş değil.
  */
  const uyelikler = new Map<string, boolean>();
  for (const row of rows) {
    const grup = row.individual ? "bireysel" : row.organizationId ?? `ad:${row.scope}`;
    const anahtar = `${grup}:${row.userId}`;
    uyelikler.set(anahtar, (uyelikler.get(anahtar) ?? false) || row.access);
  }
  const acikSayisi = [...uyelikler.values()].filter(Boolean).length;
  const blocked = uyelikler.size - acikSayisi;

  return <div className="stg plt">
    <div className="panel-pagehead">
      <div><small className="panel-kicker">PLATFORM · ÜYELER</small><h1>Tüm Üyeler</h1><p>ArvoOS, ArvoLab ve Arc&apos;ı kullanan herkesin tek listesi; kurum üyeleri ve bireysel aboneler birlikte.</p></div>
    </div>

    {/*
      Eksik veriyle dolu bir liste, dolu bir liste gibi görünür. Uyarı
      listenin ÜSTÜNDE ve konsolun öbür uyarılarıyla aynı dilde duruyor;
      altta soluk bir kutuydu ve kimse okumuyordu.
    */}
    {!arvolabReachable ? (
      <div className="plt-banner" data-tone="warning" role="alert">
        <span className="plt-banner-icon"><StgIcon name="shield" size={18} /></span>
        <div>
          <b>ArvoLab veritabanına ulaşılamadı</b>
          <p>Aşağıdaki listede ArvoLab üyeleri eksik; sayılar da eksik olanı göstermiyor. Vercel&apos;de ArvoLab bağlantı ayarlarını kontrol edin.</p>
        </div>
      </div>
    ) : null}

    {/*
      Kullanıcı listesi auth yönetim API'sinden sayfa sayfa çekiliyor ve
      sınırı 10 × 1000. Sınıra dayanıldığında kalan kişilerin e-postası
      eksik kalıyor, satırlar "Adı kayıtlı değil" diye çiziliyor ve "Kişi"
      sayacı e-postasızları ayrı kişi sayıp şişiyordu — hiçbir yerde
      görünmeden. Eksik olduğunu bilmediğimiz liste, dolu bir liste gibi
      görünür.
    */}
    {!kullanicilarTam ? (
      <div className="plt-banner" data-tone="warning" role="alert">
        <span className="plt-banner-icon"><StgIcon name="shield" size={18} /></span>
        <div>
          <b>Kullanıcı listesi eksiksiz alınamadı</b>
          <p>Ad ve e-posta bilgileri bir kısım kişide boş olabilir; &quot;Kişi&quot; sayısı da olduğundan yüksek çıkar. Betikteki sayfa sınırının artırılması gerekiyor (lib/member-directory.ts).</p>
        </div>
      </div>
    ) : null}

    {/*
      Dördü de her zaman çiziliyor. Sıfır da bir cevaptır: "erişimi kapalı
      kimse yok" demek, satırın hiç olmamasından daha çok şey söyler.
    */}
    <div className="stg-widgets" aria-label="Üye özeti">
      <StgWidget tone="info" icon="users" label="Kişi" value={people.size} note={`${uyelikler.size} kurum üyeliği · ${rows.length} ürün kaydı`} />
      <StgWidget tone="success" icon="check" label="Erişimi açık" value={acikSayisi} note="En az bir ürüne girebiliyor" />
      <StgWidget tone={individuals.size ? "gold" : "neutral"} icon="box" label="Bireysel" value={individuals.size} note={individuals.size ? "Kuruma bağlı değil" : "Bireysel abone yok"} />
      <StgWidget tone={blocked ? "warning" : "neutral"} icon="lock" label="Erişimi kapalı" value={blocked} note={blocked ? "Lisans, abonelik ya da üyelik kapalı" : "Kapalı üyelik yok"} />
    </div>

    {rows.length ? (
      <UyeListesi satirlar={rows} />
    ) : (
      <div className="stg-empty"><StgIcon name="users" size={22} /><p>Henüz üye yok. Bir kuruma sahip daveti gönderildiğinde ya da bir ürüne ilk giriş yapıldığında burada görünür.</p></div>
    )}

    <p className="stg-muted">
      <StgIcon name="users" size={16} />
      Liste kiracı bazında: her kurum bir grup, her kişi grupta tek satır. Erişim anahtarı kişinin O KURUMDAKİ üyeliğini açıp kapatır; kurumun bütün ürünlerini birden etkiler. Aynı e-posta ArvoOS ve Arc&apos;ta ortak hesaptır, ArvoLab ayrı veritabanında kendi hesabını kullanır.
    </p>
  </div>;
}
