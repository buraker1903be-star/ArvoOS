import Link from "next/link";
import { getPanelContext, panelModules } from "@/lib/panel-context";

/*
  KAPALI MODÜL / YETKİSİZ BÖLÜM EKRANI (16.10.2026).

  Sayfalar kapıyı `throw new Error("… erişiminiz yok")` ile tutuyordu ve
  bu, Next'in hata sınırına düşüyor: kullanıcı "İŞLEM TAMAMLANAMADI ·
  Bir sorun oluştu · Hata kodu: 3223241041" ekranını görüyordu. Üretimde
  hata metni soyulduğu için ekran sebebi de söyleyemiyor — kullanıcı
  ürünün bozulduğunu sanıyor, oysa olan şey "bu modül sizde kapalı".

  Başlangıç paketindeki bir kurumda canlıda görüldü: Finans → Raporlar
  sekmesi menüde doğru biçimde gizleniyor (reporting modülü kapalı) ama
  adrese doğrudan gidilince ya da eski bir bağlantı tıklanınca çökme
  ekranı çıkıyordu.

  Kiracı modülü kendisi açamıyor: Ayarlar'da yalnızca listeleniyor,
  açma kararı kurucudadır. Bu yüzden metin "şuraya tıkla aç" demiyor,
  kime başvurulacağını söylüyor.
*/
export default async function ModulKapali({
  searchParams,
}: {
  searchParams: Promise<{ modul?: string; sebep?: string }>;
}) {
  const { modul = "", sebep = "" } = await searchParams;
  const { organization, membership, modules } = await getPanelContext();
  const yonetici = membership.role === "owner" || membership.role === "admin";
  const katalog = panelModules[modul];
  const ad = katalog?.name ?? "Bu bölüm";
  const yetkiSorunu = sebep === "yetki";

  return (
    <main>
      <header className="panel-pagehead">
        <div>
          <small className="panel-kicker">ERİŞİM</small>
          <h1>{yetkiSorunu ? "Bu bölüm için yetkiniz yok" : `${ad} kurumunuzda kapalı`}</h1>
          <p>
            {yetkiSorunu
              ? "Sayfa duruyor; sizin rolünüze açık değil. Yetkileri kurum sahibi belirler."
              : `${organization.display_name || organization.name} için bu modül açık değil. Verileriniz etkilenmez; yalnızca bu bölüm görünmüyor.`}
          </p>
        </div>
        <div className="panel-page-actions">
          <Link className="panel-secondary" href="/panel">Panele dön</Link>
        </div>
      </header>

      <section className="panel-card">
        {yetkiSorunu ? (
          <p className="panel-empty">
            {yonetici
              ? <>Rol ve kişi yetkilerini <Link href="/panel/settings?bolum=yetkilendirme">Ayarlar → Yetkilendirme</Link>&apos;den değiştirebilirsiniz.</>
              : "Bu bölüme ihtiyacınız varsa kurum sahibinize ya da yöneticinize söyleyin; yetkiyi Ayarlar → Yetkilendirme'den açabilirler."}
          </p>
        ) : (
          <p className="panel-empty">
            {yonetici
              ? <>Modüller pakete bağlıdır ve panelden açılmaz. Açtırmak için <Link href="/panel/support">destek kaydı</Link> oluşturun ya da <Link href="/panel/billing">abonelik</Link> ekranından paketinizi görün.</>
              : "Modüller pakete bağlıdır. Bu bölüme ihtiyacınız varsa kurum sahibinize söyleyin."}
          </p>
        )}
      </section>

      {/* Hangi bölümlerin açık olduğunu yazmak, kapalı olanı aramayı bitiriyor. */}
      <section className="panel-card">
        <small className="panel-kicker">PAKETİNİZDE AÇIK</small>
        <h2>{modules.length} modül</h2>
        <p className="panel-empty">{modules.map((m) => m.name).join(" · ")}</p>
      </section>
    </main>
  );
}
