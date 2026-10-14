import Link from "next/link";
import { notFound } from "next/navigation";
import { depolamaKullanimi } from "@/lib/lisans-olcumleri";
import { getPanelContext } from "@/lib/panel-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { arvolabKopyalari, getArvolabBridgeHealth } from "@/lib/arvolab";
import { arcKopyalari, getArcBridgeHealth } from "@/lib/arc-bridge";
import { randevuKopyalari, getRandevuBridgeHealth } from "@/lib/randevu-bridge";
import { eskiKopyalar } from "@/lib/kopya-denetimi";
import { kotaDurumu, kotayaGoreSirala } from "@/lib/kota-durumu";
import { fazlaVerilen, limitSapmalari } from "@/lib/paket-limitleri";
import { getPaymentIncidents, incidentLabels, incidentNotes } from "@/lib/payment-incidents";
import { cronAralikMetni, cronDurumlari, cronSorunlari, type CronKaydi, type CronDurumu } from "@/lib/cron-isleri";
import { PAKET_ADI, gecenSure, para, sayi, tarihSaat } from "../bicim";
import { KBos, KKart, KListe, KNot, KOge } from "../konsol-ui";
import "../platform.css";

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

/*
  Şimdiki zaman MODÜL KAPSAMINDA okunuyor: `new Date()` render gövdesinde
  react-hooks saflık kuralını bozuyor (bu dosyada bir kez yaşandı).
*/
function cronTablosu(satirlar: CronKaydi[]) {
  return cronDurumlari(satirlar, new Date());
}

const CRON_DURUM: Record<CronDurumu["durum"], { etiket: string; ton: string }> = {
  tamam: { etiket: "Çalışıyor", ton: "success" },
  gecikti: { etiket: "Gecikti", ton: "danger" },
  dustu: { etiket: "Son koşma düştü", ton: "warning" },
  hic: { etiket: "Kayıt yok", ton: "neutral" },
};

/** Kaydın ayrıntısındaki ilk hata cümlesi (varsa). */
function cronHataMetni(ayrinti: unknown): string | null {
  const hata = (ayrinti as { hata?: unknown } | null)?.hata;
  if (typeof hata === "string" && hata) return hata;
  if (Array.isArray(hata) && typeof hata[0] === "string" && hata[0]) return hata[0];
  return null;
}

type Kiraci = {
  id: string; name: string; display_name: string | null; kind: string | null;
  provisioning_state: string; license_status: string | null; plan_code: string | null;
  user_limit: number | null; storage_limit_mb: number | null; aktif_uye: number;
};

export default async function SistemSagligiPage() {
  const { supabase, isPlatformOwner } = await getPanelContext();
  if (!isPlatformOwner) notFound();
  const admin = createAdminClient();

  const [{ data: kiraciSatirlari }, { data: urunSatirlari }, { data: depolamalar }, { data: cronSatirlari, error: cronHatasi }] = await Promise.all([
    supabase.from("platform_kiraci_liste")
      .select("id,name,display_name,kind,provisioning_state,license_status,plan_code,user_limit,storage_limit_mb,aktif_uye")
      .order("name"),
    supabase.from("organization_product_licenses").select("organization_id,product,status"),
    /* Depolama toplamı 5 dk önbellekte (lib/lisans-olcumleri): storage.objects'i taramak her sayfa açılışında tekrar ediliyordu. */
    depolamaKullanimi().then((data) => ({ data: data as { organization_id: string; bytes: number }[], error: null })),
    supabase.from("platform_cron_durumu").select("is_adi,son_calisma,son_basarili,sonuc,sure_ms,ayrinti"),
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

  /*
    PAKETİYLE UYUŞMAYAN LİSANSLAR. Sapma bugüne kadar yalnızca lisans
    formunda, SEÇİLİ kiracı için görünüyordu: "hangi kiracı paketinden
    fazlasını alıyor" sorusunu yanıtlamak için kiracıları tek tek açmak
    gerekiyordu. Kotada aynı boşluk vardı ve kapatılmıştı; bu onun
    kardeşi — orada hakkından fazlasını KULLANIYOR, burada hakkından
    fazlası TANIMLANMIŞ.

    Yalnızca FAZLA verilenler listeleniyor: eksik tanımlanmış limit de
    bir sapma ama kurucunun parasını değil müşterinin hakkını
    ilgilendiriyor ve lisans ekranında zaten görünüyor.
  */
  const limitSapanlar = musteriler
    .map((k) => ({
      kiraci: k,
      /* AI kredisi KIYASLANMIYOR: kiracı görünümünde o sütun yok ve
         limiti hiçbir kod uygulamıyor (ai_credits_used hiç yazılmıyor,
         AGENTS.md). Uygulanmayan bir limitin sapmasını "sorun" diye
         saymak, listeyi okunmaz eden gürültü olurdu. */
      sapmalar: fazlaVerilen(limitSapmalari(k.plan_code, {
        userLimit: k.user_limit, storageLimitMb: k.storage_limit_mb, aiCreditLimit: null,
      })),
    }))
    .filter((x) => x.sapmalar.length > 0);

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

  /* OKUNAMAYAN KAYNAK "SORUN YOK" DEĞİL: kayıtlar okunamazsa her iş
     "henüz kaydı yok" görünürdü ve bu nötr durum sessizce yeşil sayılırdı.
     Hata kartın kendisinde yazılı; sayım da yapılmıyor. */
  const cronDurum = cronHatasi ? [] : cronTablosu((cronSatirlari ?? []) as unknown as CronKaydi[]);
  const cronSorun = cronSorunlari(cronDurum);
  /* KAYDI OLMAYAN İŞ "ZAMANINDA KOŞUYOR" DEĞİL. Şerit sorunsuz iş sayısını
     yazıyordu ve kayıt tutmanın ilk gününde "5 / 5 · hepsi zamanında
     koşuyor" diyordu — oysa beşinin hiçbiri henüz koşmamıştı. Pay yalnızca
     KAYDI OLAN ve sorunsuz işler; bekleyenler alt satırda sayılıyor. */
  const cronBekleyen = cronDurum.filter((d) => d.durum === "hic").length;
  const cronSaglikli = cronDurum.length - cronBekleyen - cronSorun.length;

  const kurulumHatalari = (kurulumKayitlari ?? []) as { id: string | number; organization_id: string; action: string; state: string | null; created_at: string }[];
  const kurulumBekleyen = musteriler.filter((k) => PENDING_STATES.has(k.provisioning_state)).length;
  const kopukKopru = kopruler.filter((k) => k.bozuk).length;
  /* Limit sapması da sayılıyor: şeritteki "açık sorun" ile aşağıdaki
     bölümlerin toplamı ayrışırsa rozet yanıltıcı olur. */
  const toplamSorun = cronSorun.length + kopukKopru + bayatKopyalar.length + kotalar.length + limitSapanlar.length + kurulumHatalari.length + odemeOlaylari.length;

  return <main className="plt talep cari">
    <header className="talep-bas">
      <div className="talep-bas-metin">
        <small className="panel-kicker">PLATFORM · SİSTEM SAĞLIĞI</small>
        <h1>Sistem Sağlığı</h1>
      </div>
      <div className="talep-bas-eylem">
        <Link className="panel-secondary" href="/panel/platform/kurulumlar">Kurulumlar</Link>
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
          <dt>Zamanlanmış iş</dt>
          <dd className={cronSorun.length || cronHatasi ? "talep-uyari" : cronBekleyen ? undefined : "cari-arti"}>
            {cronHatasi ? "—" : <>{sayi(cronSaglikli)} / {sayi(cronDurum.length)}</>}
          </dd>
          <small>{cronHatasi ? "Kayıtlar okunamadı"
            : cronSorun.length ? `${sayi(cronSorun.length)} iş gecikti ya da düştü`
            : cronBekleyen ? `${sayi(cronBekleyen)} işin ilk kaydı bekleniyor`
            : "Hepsi zamanında koşuyor"}</small>
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

    {/* Kiracıya bağlı satırlar kiracının ekranına gider (ok sütunu); köprü
        ve ödeme bildirimi satırlarının açılacak bir ekranı yok.
        iOS LİSTESİ (14.10.2026, "iOS gibi olmalı"): beş bölüm de sütun
        başlıksız tek satır — kiracı simgesi, başlık, altında tek satır
        özet, sağda durum ve değer. Eskiden üç-beş sütunlu tablolardı
        (KTablo + MobilSatir), kurum adları ikiye kırılıyordu. */}
    {/* ZAMANLANMIŞ İŞLER EN BAŞTA: aşağıdaki bölümlerin çoğu bunların
        BELİRTİSİ. Posta eşitlemesi durduğunda kullanıcı "postalar
        gelmiyor" diyor, köprü işi durduğunda "ürün kopyası bayat"
        görünüyor; sebep burada yazılı. */}
    <KKart baslik="Zamanlanmış işler"
      aciklama="Beş iş ekosistemi taşıyor ve hiçbiri koştuğunu kaydetmiyordu: biri sessizce dursa belirti kullanıcıda çıkıyordu.">
      {cronHatasi ? (
        <KNot ton="tehlike">Koşma kayıtları okunamadı ({cronHatasi.message}) — &quot;sorun yok&quot; demek değil.</KNot>
      ) : (
        <KListe>
          {cronDurum.map((is) => {
            const sorunlu = is.durum === "gecikti" || is.durum === "dustu";
            const hata = cronHataMetni(is.ayrinti ?? null);
            return (
              <KOge key={is.yol} baslik={is.ad}
                alt={is.durum === "hic"
                  ? "Koşma kaydı tutma bugün başladı; ilk koşmada yazılacak."
                  : sorunlu ? (hata ?? is.aciklama) : is.aciklama}
                etiketler={[{ etiket: cronAralikMetni(is.aralikDk), ton: is.aralikDk === null ? "warning" : "neutral" }]}
                durum={CRON_DURUM[is.durum]}
                deger={is.gecikmeDk === null ? "—" : gecenSure(is.gecikmeDk)}
                degerAlt="en son koşma" />
            );
          })}
        </KListe>
      )}
    </KKart>

    <KKart baslik="Ürün köprüleri"
      aciklama="Köprü koptuğunda hata yalnızca karşı taraftaki günlükte kalıyor; kurucu aylar sonra fark ediyordu.">
      <KListe>
        {kopruler.map((kopru) => (
          <KOge key={kopru.ad} baslik={kopru.ad} alt={kopru.not}
            durum={{ etiket: kopru.bozuk ? "Yanıt vermiyor" : "Sağlıklı", ton: kopru.bozuk ? "danger" : "success" }} />
        ))}
      </KListe>
    </KKart>

    <KKart baslik="Ürün kopyaları"
      aciklama={<>
        Köprü sağlıklıyken de kopya bayatlayabiliyor: AkademikMerkez&apos;de altı gün eski kaldı ve hiçbir ekran göstermiyordu.
        Düzeltme kiracının lisans ekranında: &quot;Ürüne yeniden yansıt&quot;.
      </>}>
      {bayatKopyalar.length ? (
        <KListe>
          {bayatKopyalar.map((kayit) => {
            const ad = kurumAdi.get(kayit.organizationId) ?? kayit.organizationId;
            return (
              <KOge
                key={`${kayit.organizationId}-${kayit.product}`}
                href={`/panel/platform/musteriler/${kayit.organizationId}?pencere=lisanslar`}
                simge={ad}
                baslik={ad}
                alt={`${kayit.product} · konsolda ${kayit.konsolDurumu}`}
                durum={{ etiket: `Üründe ${kayit.kopyaDurumu}`, ton: "danger" }}
              />
            );
          })}
        </KListe>
      ) : <KBos baslik="Bayat kopya yok" aciklama="Kopyası konsoldan farklı erişim veren kiracı yok." />}
    </KKart>

    <KKart baslik="Kota"
      aciklama="Limitini aşan ya da %85'ine gelen kiracılar. Ölçümler canlı: kullanıcı üyeliklerden, depolama dosya deposundan.">
      {kotalar.length ? (
        <KListe>
          {kotalar.map((kota) => {
            const ad = kurumAdi.get(kota.organizationId) ?? kota.organizationId;
            const durum = { etiket: kota.durum === "asildi" ? "Aşıldı" : "Yaklaştı", ton: kota.durum === "asildi" ? "danger" : "warning" };
            const kullanici = `${sayi(kota.kullanici.kullanilan)} / ${sayi(kota.kullanici.limit)} kullanıcı · %${kota.kullanici.oran}`;
            const depolama = `${sayi(kota.depolama.kullanilan)} / ${sayi(kota.depolama.limit)} MB · %${kota.depolama.oran}`;
            /* Sağdaki değer iki ölçüden dolu olanın oranı: satırı hangi
               ölçünün limite taşıdığı bir bakışta görünsün. */
            const enYuksek = Math.max(kota.kullanici.oran, kota.depolama.oran);
            return (
              <KOge
                key={kota.organizationId}
                href={`/panel/platform/musteriler/${kota.organizationId}?pencere=lisanslar`}
                simge={ad}
                baslik={ad}
                alt={`${kullanici} · ${depolama}`}
                durum={durum}
                deger={`%${enYuksek}`}
                degerAlt={kota.kullanici.oran >= kota.depolama.oran ? "kullanıcı" : "depolama"}
              />
            );
          })}
        </KListe>
      ) : <KBos baslik="Kota sorunu yok" aciklama="Limitine yaklaşan kiracı yok." />}
    </KKart>

    <KKart baslik="Paketiyle uyuşmayan limitler"
      aciklama="Paketinin varsayılanından FAZLA hak tanımlanmış kiracılar. Sapma hata değil — pazarlıkla genişletilmiş limitler var — ama ücretli bir pakette sessiz sapma, satılmamış koltuğu bedava vermek demek.">
      {limitSapanlar.length ? (
        <KListe>
          {limitSapanlar.map(({ kiraci, sapmalar }) => {
            const ad = kiraci.display_name || kiraci.name;
            return (
              <KOge
                key={kiraci.id}
                href={`/panel/platform/musteriler/${kiraci.id}?pencere=lisanslar`}
                simge={ad}
                baslik={ad}
                alt={sapmalar.map((x) => `${x.alan}: paket ${sayi(x.paket)} · kiracı ${sayi(x.kiraci)}`).join(" · ")}
                durum={{ etiket: PAKET_ADI[kiraci.plan_code ?? ""] ?? kiraci.plan_code ?? "paket yok", ton: "warning" }}
                deger={`+${sayi(sapmalar.length)}`}
                degerAlt="alan"
              />
            );
          })}
        </KListe>
      ) : <KBos baslik="Limitler paketleriyle uyumlu" aciklama="Hiçbir kiracıya paketinin üstünde hak tanımlanmamış." />}
    </KKart>

    <KKart baslik="Kurulum hataları">
      {admin ? (
        kurulumHatalari.length ? (
          <KListe>
            {kurulumHatalari.map((kayit) => {
              const ad = kurumAdi.get(kayit.organization_id) ?? "Kurum";
              return (
                <KOge
                  key={kayit.id}
                  href={`/panel/platform/musteriler/${kayit.organization_id}?pencere=ayarlar`}
                  simge={ad}
                  baslik={ad}
                  alt={[kayit.action, kayit.state].filter(Boolean).join(" · ")}
                  deger={tarihSaat(kayit.created_at)}
                />
              );
            })}
          </KListe>
        ) : <KBos baslik="Kurulum hatası yok" aciklama="Hatayla sonuçlanan kurulum kaydı yok." />
      ) : <KBos baslik="Kurulum günlüğü okunamıyor" aciklama="Sunucu anahtarı tanımlı olmadığı için kurulum günlüğü okunamıyor — “hata yok” demek değil." />}
    </KKart>

    <KKart baslik="İşlenemeyen ödemeler"
      aciklama="PayTR ödeme bildirdi ama kayıt oluşmadı: lisans açılmadı ya da tahsilat cariye yazılmadı. Para tahsil edilmiş olabilir; her birini PayTR panelinden doğrulayın.">
      {odemeOlaylari.length ? (
        <KListe>
          {odemeOlaylari.map((olay) => {
            const sebep = incidentLabels[olay.result] ?? olay.result;
            const ad = olay.organizationName ?? "—";
            /* Sebebin açıklaması (incidentNotes) eskiden rozetin altında ayrı
               satırdı; tek satırlık özete PayTR numarası ve zamanla birlikte
               giriyor — PayTR panelinde aranacak olan numara. */
            return (
              <KOge
                key={olay.id}
                simge={olay.organizationName}
                baslik={ad}
                alt={[olay.merchantOid, tarihSaat(olay.createdAt), incidentNotes[olay.result]].filter(Boolean).join(" · ")}
                durum={{ etiket: sebep, ton: "danger" }}
                deger={olay.paymentAmount !== null ? para(olay.paymentAmount) : "—"}
              />
            );
          })}
        </KListe>
      ) : <KBos baslik="İşlenemeyen ödeme yok" aciklama="İşlenemeyen ödeme bildirimi yok." />}
    </KKart>
  </main>;
}
