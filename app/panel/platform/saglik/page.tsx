import Link from "next/link";
import { notFound } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { arvolabKopyalari, getArvolabBridgeHealth } from "@/lib/arvolab";
import { arcKopyalari, getArcBridgeHealth } from "@/lib/arc-bridge";
import { randevuKopyalari, getRandevuBridgeHealth } from "@/lib/randevu-bridge";
import { eskiKopyalar } from "@/lib/kopya-denetimi";
import { kotaDurumu, kotayaGoreSirala } from "@/lib/kota-durumu";
import { getPaymentIncidents, incidentLabels, incidentNotes } from "@/lib/payment-incidents";
import { para, sayi, tarihSaat } from "../bicim";
import "../../settings/settings.css";
import "../platform.css";
import "../../crm/crm.css";
import "../../crm/kayit-detay/kayit-detay.css";

/*
  SİSTEM SAĞLIĞI (14.10.2026).

  Konsolun söylediği her "bir şey bozuk" uyarısı ayrı bir ekrandaydı:
  köprü kopması ana sayfada bir satır, karşılıksız ödeme Ödemeler
  sayfasında bir bölüm, kota aşımı kiracı listesinde bir rozet, bayat
  ürün kopyası yine ana sayfada tek cümle. Kurucu "bugün bir şey mi
  bozuldu" sorusunu dört ekranı gezerek yanıtlıyordu — ve üçü de
  bakılmadığında sessiz kalıyordu.

  Bu sayfa YENİ BİR ÖLÇÜM YAPMIYOR: var olan dört kaynağı tek yerde
  topluyor. Yeni bir doğruluk iddiası getirmediği için de yeni bir
  yanılma yolu açmıyor.

  Okunamayan kaynak "sorun yok" diye gösterilmez: her bölüm okunup
  okunamadığını ayrıca yazar. Bir gelen kutusunda da, bir sağlık
  ekranında da söylenebilecek en yanlış şey budur.
*/

const PENDING_STATES = new Set(["creating", "inviting_owner", "waiting_owner"]);

type Kiraci = {
  id: string; name: string; display_name: string | null; kind: string | null;
  provisioning_state: string; license_status: string | null;
  user_limit: number | null; storage_limit_mb: number | null; aktif_uye: number;
};

export default async function SistemSagligiPage() {
  const { supabase, isPlatformOwner } = await getPanelContext();
  if (!isPlatformOwner) notFound();
  const admin = createAdminClient();

  const [{ data: kiraciSatirlari }, { data: urunSatirlari }, { data: depolamalar }] = await Promise.all([
    supabase.from("platform_kiraci_liste")
      .select("id,name,display_name,kind,provisioning_state,license_status,user_limit,storage_limit_mb,aktif_uye")
      .order("name"),
    supabase.from("organization_product_licenses").select("organization_id,product,status"),
    admin ? admin.rpc("arvo_storage_usage") : Promise.resolve({ data: [] }),
  ]);

  const [arvolab, arc, randevu, labKopya, arcKopya, rdvKopya, odemeOlaylari] = await Promise.all([
    getArvolabBridgeHealth(),
    getArcBridgeHealth(),
    getRandevuBridgeHealth(),
    arvolabKopyalari(),
    arcKopyalari(),
    randevuKopyalari(),
    getPaymentIncidents(),
  ]);

  /* Kurulum günlüğü yalnızca sunucu anahtarıyla okunuyor; anahtar yoksa
     satır hiç çizilmiyor ("0 hata" yazmak okunamayanı temiz göstermek). */
  const { data: kurulumKayitlari } = admin
    ? await admin.from("provisioning_audit_logs").select("id,organization_id,action,result,state,created_at")
        .eq("result", "error").order("created_at", { ascending: false }).limit(10)
    : { data: null };

  const kiracilar = ((kiraciSatirlari ?? []) as unknown as Kiraci[]);
  const musteriler = kiracilar.filter((kurum) => kurum.kind !== "internal");
  const kurumAdi = new Map(kiracilar.map((k) => [k.id, k.display_name || k.name]));
  const depolamaBayt = new Map(
    ((depolamalar ?? []) as { organization_id: string; bytes: number }[]).map((s) => [s.organization_id, Number(s.bytes ?? 0)]),
  );

  const kotalar = kotayaGoreSirala(
    musteriler
      .filter((k) => k.user_limit !== null && k.storage_limit_mb !== null)
      .map((k) => kotaDurumu({
        organizationId: k.id,
        kullaniciSayisi: Number(k.aktif_uye),
        kullaniciLimiti: Number(k.user_limit),
        depolamaBayt: depolamaBayt.get(k.id) ?? 0,
        depolamaLimitiMb: Number(k.storage_limit_mb),
      })),
  ).filter((k) => k.durum !== "normal");

  const musteriMi = new Set(musteriler.map((k) => k.id));
  const bayatKopyalar = eskiKopyalar(
    ((urunSatirlari ?? []) as { organization_id: string; product: string; status: string }[])
      .filter((s) => musteriMi.has(s.organization_id)),
    { arvolab: labKopya, arc: arcKopya, randevu: rdvKopya },
  );

  const kopruler = [
    { ad: "ArvoLab", bozuk: Boolean(arvolab?.broken), not: arvolab?.broken ? (arvolab.permanent ? "Anahtar eksik ya da iki tarafta farklı" : "ArvoLab ArvoOS'a ulaşamıyor") : "Yanıt veriyor" },
    { ad: "ArvoARC", bozuk: !arc.ok, not: arc.ok ? "Yanıt veriyor" : arc.error ? `Bağlanılamadı: ${arc.error}` : `Tanımsız değişken: ${arc.missing.join(", ")}` },
    { ad: "Arvo Randevu", bozuk: !randevu.ok, not: randevu.ok ? "Yanıt veriyor" : randevu.error ? `Bağlanılamadı: ${randevu.error}` : `Tanımsız değişken: ${randevu.missing.join(", ")}` },
  ];

  const kurulumHatalari = (kurulumKayitlari ?? []) as { id: string | number; organization_id: string; action: string; state: string | null; created_at: string }[];
  const kurulumBekleyen = musteriler.filter((k) => PENDING_STATES.has(k.provisioning_state)).length;
  const kopukKopru = kopruler.filter((k) => k.bozuk).length;
  const toplamSorun = kopukKopru + bayatKopyalar.length + kotalar.length + kurulumHatalari.length + odemeOlaylari.length;

  return <main className="stg plt talep cari">
    <header className="talep-bas">
      <div className="talep-bas-metin">
        <small className="panel-kicker">PLATFORM · SİSTEM SAĞLIĞI</small>
        <h1>Sistem Sağlığı</h1>
        <p>Platformun &quot;bir şey mi bozuldu&quot; ekranı: köprüler, ürün kopyaları, kotalar, kurulum ve ödeme hataları tek yerde.</p>
      </div>
      <div className="talep-bas-eylem">
        <Link className="panel-secondary" href="/panel/platform">Kurulumlar</Link>
      </div>
    </header>

    <nav className="kayit-serit talep-serit" aria-label="Sağlık özeti">
      <dl>
        <div>
          <dt>Açık sorun</dt>
          <dd className={toplamSorun ? "talep-uyari" : "cari-arti"}>{sayi(toplamSorun)}</dd>
          <small>{toplamSorun ? "Aşağıda bölüm bölüm" : "Her şey yolunda"}</small>
        </div>
        <div>
          <dt>Köprü</dt>
          <dd className={kopukKopru ? "talep-uyari" : "cari-arti"}>{sayi(kopruler.length - kopukKopru)} / {sayi(kopruler.length)}</dd>
          <small>{kopukKopru ? `${sayi(kopukKopru)} köprü yanıt vermiyor` : "Üçü de yanıt veriyor"}</small>
        </div>
        <div>
          <dt>Kota</dt>
          <dd className={kotalar.length ? "talep-uyari" : undefined}>{sayi(kotalar.length)}</dd>
          <small>{kotalar.length ? "Limite yaklaşan ya da aşan kiracı" : "Kota sorunu yok"}</small>
        </div>
        <div>
          <dt>Kurulum</dt>
          <dd className={kurulumHatalari.length ? "talep-uyari" : undefined}>{sayi(kurulumHatalari.length)}</dd>
          <small>{kurulumBekleyen ? `${sayi(kurulumBekleyen)} kurulum sürüyor` : "Son hatalı kurulum kaydı"}</small>
        </div>
      </dl>
    </nav>

    <section className="panel-card" aria-label="Ürün köprüleri">
      <h2>Ürün köprüleri</h2>
      <p className="panel-muted">Köprü koptuğunda hata yalnızca karşı taraftaki günlükte kalıyor; kurucu aylar sonra fark ediyordu.</p>
      <table className="plt-table">
        <thead><tr><th>Ürün</th><th>Durum</th><th>Not</th></tr></thead>
        <tbody>
          {kopruler.map((kopru) => (
            <tr key={kopru.ad}>
              <td>{kopru.ad}</td>
              <td><span className="status-pill" data-tone={kopru.bozuk ? "danger" : "success"}>{kopru.bozuk ? "Yanıt vermiyor" : "Sağlıklı"}</span></td>
              <td>{kopru.not}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>

    <section className="panel-card" aria-label="Bayat ürün kopyaları">
      <h2>Ürün kopyaları</h2>
      <p className="panel-muted">
        Köprü sağlıklıyken de kopya bayatlayabiliyor: AkademikMerkez&apos;de altı gün eski kaldı ve hiçbir ekran göstermiyordu.
        Düzeltme kiracının lisans ekranında: &quot;Ürüne yeniden yansıt&quot;.
      </p>
      {bayatKopyalar.length ? (
        <table className="plt-table">
          <thead><tr><th>Kiracı</th><th>Ürün</th><th>Üründe</th><th>Konsolda</th></tr></thead>
          <tbody>
            {bayatKopyalar.map((kayit) => (
              <tr key={`${kayit.organizationId}-${kayit.product}`}>
                <td><Link href={`/panel/platform/licenses?organization=${kayit.organizationId}`}>{kurumAdi.get(kayit.organizationId) ?? kayit.organizationId}</Link></td>
                <td>{kayit.product}</td>
                <td><span className="status-pill" data-tone="danger">{kayit.kopyaDurumu}</span></td>
                <td>{kayit.konsolDurumu}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <p className="panel-muted">Kopyası konsoldan farklı erişim veren kiracı yok.</p>}
    </section>

    <section className="panel-card" aria-label="Kota durumu">
      <h2>Kota</h2>
      <p className="panel-muted">Limitini aşan ya da %85&apos;ine gelen kiracılar. Ölçümler canlı: kullanıcı üyeliklerden, depolama dosya deposundan.</p>
      {kotalar.length ? (
        <table className="plt-table">
          <thead><tr><th>Kiracı</th><th>Kullanıcı</th><th>Depolama</th><th>Durum</th></tr></thead>
          <tbody>
            {kotalar.map((kota) => (
              <tr key={kota.organizationId}>
                <td><Link href={`/panel/platform/licenses?organization=${kota.organizationId}`}>{kurumAdi.get(kota.organizationId) ?? kota.organizationId}</Link></td>
                <td>{sayi(kota.kullanici.kullanilan)} / {sayi(kota.kullanici.limit)} · %{kota.kullanici.oran}</td>
                <td>{sayi(kota.depolama.kullanilan)} / {sayi(kota.depolama.limit)} MB · %{kota.depolama.oran}</td>
                <td><span className="status-pill" data-tone={kota.durum === "asildi" ? "danger" : "warning"}>{kota.durum === "asildi" ? "Aşıldı" : "Yaklaştı"}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <p className="panel-muted">Limitine yaklaşan kiracı yok.</p>}
    </section>

    <section className="panel-card" aria-label="Kurulum hataları">
      <h2>Kurulum hataları</h2>
      {admin ? (
        kurulumHatalari.length ? (
          <table className="plt-table">
            <thead><tr><th>Kiracı</th><th>Adım</th><th>Durum</th><th>Zaman</th></tr></thead>
            <tbody>
              {kurulumHatalari.map((kayit) => (
                <tr key={kayit.id}>
                  <td><Link href={`/panel/platform?organization=${kayit.organization_id}`}>{kurumAdi.get(kayit.organization_id) ?? "Kurum"}</Link></td>
                  <td>{kayit.action}</td>
                  <td>{kayit.state ?? "—"}</td>
                  <td>{tarihSaat(kayit.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="panel-muted">Hatayla sonuçlanan kurulum kaydı yok.</p>
      ) : <p className="panel-muted">Sunucu anahtarı tanımlı olmadığı için kurulum günlüğü okunamıyor — &quot;hata yok&quot; demek değil.</p>}
    </section>

    <section className="panel-card" aria-label="Karşılıksız ödeme bildirimleri">
      <h2>İşlenemeyen ödemeler</h2>
      <p className="panel-muted">PayTR ödeme bildirdi ama kayıt oluşmadı: lisans açılmadı ya da tahsilat cariye yazılmadı. Para tahsil edilmiş olabilir; her birini PayTR panelinden doğrulayın.</p>
      {odemeOlaylari.length ? (
        <table className="plt-table">
          <thead><tr><th>Kurum</th><th>Sebep</th><th>Tutar</th><th>PayTR no</th><th>Zaman</th></tr></thead>
          <tbody>
            {odemeOlaylari.map((olay) => (
              <tr key={olay.id}>
                <td>{olay.organizationName ?? "—"}</td>
                <td>
                  <span className="status-pill" data-tone="danger">{incidentLabels[olay.result] ?? olay.result}</span>
                  <small className="plt-substatus">{incidentNotes[olay.result] ?? ""}</small>
                </td>
                <td>{olay.paymentAmount !== null ? para(olay.paymentAmount) : "—"}</td>
                <td className="plt-mono">{olay.merchantOid}</td>
                <td>{tarihSaat(olay.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <p className="panel-muted">İşlenemeyen ödeme bildirimi yok.</p>}
    </section>
  </main>;
}
