import Link from "next/link";
import { notFound } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";
import { getMemberDirectory, type MemberProduct } from "@/lib/member-directory";
import { UyeListesi } from "./uye-listesi";
import { KBos, KKart, KListe, KNot, KOge } from "../konsol-ui";
import { sayi } from "../bicim";
import "../platform.css";
// Panelin liste sayfası kalıbı (talep-bas, kayit-serit, talep-izgara) ve
// tablosunun CSS'i konsol-ui.tsx'in import ettiği dosyalardan geliyor.

const URUN_ADI: Record<MemberProduct, string> = {
  arvoos: "ArvoOS", arvolab: "ArvoLab", arc: "ArvoARC", randevu: "Randevu",
};

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
  /*
    Gruplama listedeki kuralın aynısı (uye-listesi.tsx): kurum kimliği
    olanlar grubu kuruyor, ArvoLab satırları (kimliksiz) adı tutan gruba
    katılıyor. Kişi ise E-POSTAYA göre birleşiyor — ArvoLab'ın kullanıcı
    kimliği ArvoOS'unkiyle aynı değil. İki yerde iki ayrı kural, iki ayrı
    sayı demekti: ekranda beş grup, widget'ta altı kurum yazıyordu.
  */
  const isimdenGrup = new Map<string, string>();
  for (const row of rows) if (row.organizationId) isimdenGrup.set(row.scope, row.organizationId);
  for (const row of rows) {
    const grup = row.individual ? "bireysel" : row.organizationId ?? isimdenGrup.get(row.scope) ?? `ad:${row.scope}`;
    const anahtar = `${grup}:${row.email?.toLocaleLowerCase("tr-TR") ?? `uid:${row.userId}`}`;
    uyelikler.set(anahtar, (uyelikler.get(anahtar) ?? false) || row.access);
  }
  const acikSayisi = [...uyelikler.values()].filter(Boolean).length;
  const blocked = uyelikler.size - acikSayisi;
  /* Sağ kartın ürün dağılımı zaten okunmuş satırlardan sayılıyor: ürün
     kaydı başına bir, yeni sorgu yok. */
  const urunSayisi = (urun: MemberProduct) => rows.filter((row) => row.product === urun).length;

  /*
    Eksik veriyle dolu bir liste, dolu bir liste gibi görünür. Uyarı
    listenin ÜSTÜNDE duruyor; altta soluk bir kutuydu ve kimse okumuyordu.
    (14.10.2026: sayfanın üstündeki renkli şeritten listenin kendi
    kartına, okunduğu yere taşındı.)

    Kullanıcı listesi auth yönetim API'sinden sayfa sayfa çekiliyor ve
    sınırı 10 × 1000. Sınıra dayanıldığında kalan kişilerin e-postası
    eksik kalıyor, satırlar "Adı kayıtlı değil" diye çiziliyor ve "Kişi"
    sayacı e-postasızları ayrı kişi sayıp şişiyordu — hiçbir yerde
    görünmeden. Eksik olduğunu bilmediğimiz liste, dolu bir liste gibi
    görünür.
  */
  const uyarilar = <>
    {!arvolabReachable ? (
      <KNot ton="uyari">
        <b>ArvoLab veritabanına ulaşılamadı.</b> Aşağıdaki listede ArvoLab üyeleri eksik; sayılar da eksik olanı göstermiyor. Vercel&apos;de ArvoLab bağlantı ayarlarını kontrol edin.
      </KNot>
    ) : null}
    {!kullanicilarTam ? (
      <KNot ton="uyari">
        <b>Kullanıcı listesi eksiksiz alınamadı.</b> Ad ve e-posta bilgileri bir kısım kişide boş olabilir; &quot;Kişi&quot; sayısı da olduğundan yüksek çıkar. Betikteki sayfa sınırının artırılması gerekiyor (lib/member-directory.ts).
      </KNot>
    ) : null}
    <KNot>
      Liste kiracı bazında: her kurum bir grup, her kişi grupta tek satır. Erişim anahtarı kişinin O KURUMDAKİ üyeliğini açıp kapatır; kurumun bütün ürünlerini birden etkiler. Aynı e-posta ArvoOS ve ArvoARC&apos;ta ortak hesaptır, ArvoLab ayrı veritabanında kendi hesabını kullanır.
    </KNot>
  </>;

  return <main className="plt talep cari ekip liste-sayfa">
    <header className="talep-bas">
      <div className="talep-bas-metin">
        <small className="panel-kicker">PLATFORM · ÜYELER</small>
        <h1>Tüm Üyeler</h1>
      </div>
      <div className="talep-bas-eylem">
        <Link className="panel-secondary" href="/panel/platform/subscribers">Bireysel aboneler</Link>
      </div>
    </header>

    {/*
      13.10.2026: StgWidget kutuları yerine panelin özet şeridi. Konsol
      kendi tasarım dilini kullanıyordu; aynı kurucunun gün içinde gidip
      geldiği panel ekranları şerit kullanıyor ve iki dil arasında geçiş
      sayıları her seferinde yeniden aramak demekti.

      Hepsi her zaman çiziliyor: sıfır da bir cevaptır ve satırın hiç
      olmamasından daha çok şey söyler.
    */}
    <nav className="kayit-serit talep-serit" aria-label="Üye özeti">
      <dl>
        <div><dt>Kişi</dt><dd>{people.size}</dd><small>{uyelikler.size} kurum üyeliği · {rows.length} ürün kaydı</small></div>
        <div><dt>Erişimi açık</dt><dd className="cari-arti">{acikSayisi}</dd><small>En az bir ürüne girebiliyor</small></div>
        <div><dt>Bireysel</dt><dd>{individuals.size}</dd><small>{individuals.size ? "Kuruma bağlı değil" : "Bireysel abone yok"}</small></div>
        <div><dt>Erişimi kapalı</dt><dd className={blocked ? "talep-uyari" : undefined}>{blocked}</dd><small>{blocked ? "Lisans, abonelik ya da üyelik kapalı" : "Kapalı üyelik yok"}</small></div>
      </dl>
    </nav>

    <div className="talep-izgara personel-iki ekip-izgara">
      {rows.length ? (
        <UyeListesi satirlar={rows} ust={uyarilar} />
      ) : (
        <section className="panel-card talep-bilgi" aria-label="Üyeler">
          {uyarilar}
          <KBos baslik="Henüz üye yok" aciklama="Bir kuruma sahip daveti gönderildiğinde ya da bir ürüne ilk giriş yapıldığında burada görünür." />
        </section>
      )}

      {/* 14.10.2026: İstatistik kartının dört kutusu (kişi, açık,
          bireysel, kapalı) şeritteki sayıların AYNISIYDI. Yerine yalnızca
          şeritte olmayan ürün kaydı dağılımı, iOS listesiyle. */}
      <div className="liste-sag">
        <KKart baslik="Ürün kayıtları" aciklama={`Süzgeçten bağımsız, bütün üyeler${!arvolabReachable || !kullanicilarTam ? " · liste eksik olabilir" : ""}`}>
          <KListe>
            {(Object.keys(URUN_ADI) as MemberProduct[]).map((urun) => (
              <KOge key={urun} baslik={URUN_ADI[urun]} deger={sayi(urunSayisi(urun))} />
            ))}
          </KListe>
        </KKart>
      </div>
    </div>
  </main>;
}
