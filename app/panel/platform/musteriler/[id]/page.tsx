import Link from "next/link";
import { notFound } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { ADDON_PRODUCTS, productLicenseLabels, productName } from "@/lib/products";
import { KBos, KKart, KListe, KNot, KOge } from "../../konsol-ui";
import { LISANS_TONU, PAKET_ADI, para, sayi, tarih, tarihSaat } from "../../bicim";
import { ETKINLIK_ADI, VARLIK_ADI } from "../../kiraci-dosyasi";
import "../../platform.css";

/*
  MÜŞTERİ DETAYI (14.10.2026, kurum sahibinin isteği).

  Müşteriler listesinde bir satıra basınca kiracı dosyası açılıyordu:
  kurulum adımları, modül anahtarları, kurum ayarları formu — kiracının
  TEKNİK dosyası. Kurucunun müşteriye bakarken sorduğu soru başka:
  "bu müşteri ne kullanıyor, ne ödüyor, ne zaman yenileniyor, kime
  ulaşırım". Bu sayfa onu yanıtlıyor; teknik ayarlar sağ üstteki
  "Kurum ayarları" bağlantısıyla kiracı dosyasında kalıyor.

  Sayfa OKUNUR: lisans, ücret ve dönem Lisans ve kota'da; ödeme onayı
  Ödemeler'de değişir. Aynı işi iki yerde yapılabilir kılmak, birinin
  kuralı atlaması demek (Müşteriler listesindeki ilkenin aynısı).

  Ödeme, sözleşme isteği, üyelik ve etkinlik kayıtları yalnızca kurum
  üyelerine açık (RLS); kurucu bunları sunucu anahtarıyla okuyor —
  sayfanın başında kurucu doğrulanıyor.
*/

const ACIK = new Set(["active", "trialing", "past_due"]);
const ODEYEN = new Set(["active", "past_due"]);

const ODEME_DURUMU: Record<string, { ad: string; ton: string }> = {
  pending: { ad: "Onay bekliyor", ton: "warning" },
  approved: { ad: "Onaylandı", ton: "success" },
  rejected: { ad: "Reddedildi", ton: "danger" },
  cancelled: { ad: "İptal", ton: "neutral" },
  canceled: { ad: "İptal", ton: "neutral" },
};
const ISTEK_DURUMU: Record<string, { ad: string; ton: string }> = {
  pending: { ad: "Karar bekliyor", ton: "warning" },
  approved: { ad: "Onaylandı", ton: "success" },
  rejected: { ad: "Reddedildi", ton: "danger" },
};
const ODEME_YOLU: Record<string, string> = { bank_transfer: "Havale", paytr: "Kart (PayTR)", garanti: "Kart (Garanti)" };
const ROL_ADI: Record<string, string> = { owner: "Kurum sahibi", admin: "Yönetici", manager: "Müdür", member: "Üye", staff: "Personel" };

type Kurum = {
  id: string; name: string; display_name: string | null; slug: string; kind: string | null; plan_code: string | null;
  provisioning_state: string; license_status: string | null; monthly_fee: number | null; current_period_end: string | null;
  trial_ends_at: string | null; user_limit: number | null; aktif_uye: number; contact_phone: string | null;
  custom_domain: string | null; davet_eposta: string | null; grup_markasi: boolean | null; sector: string | null;
};
type UrunLisansi = { product: string; status: string; monthly_fee: number | null; current_period_end: string | null; trial_ends_at: string | null };
type Odeme = { id: string; amount: number; currency: string | null; status: string; product: string | null; created_at: string; reviewed_at: string | null; payment_method: string | null };
type Istek = { id: string; contract_no: string | null; amount: number | null; currency: string | null; status: string; created_at: string; reviewed_at: string | null };

export default async function MusteriDetayi({ params }: { params: Promise<{ id: string }> }) {
  const { supabase, isPlatformOwner } = await getPanelContext();
  if (!isPlatformOwner) notFound();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const admin = createAdminClient();
  const [{ data: kurumSatiri, error: kurumHatasi }, { data: kayit }, { data: urunSatirlari, error: urunHatasi }] = await Promise.all([
    supabase.from("platform_kiraci_liste")
      .select("id,name,display_name,slug,kind,plan_code,provisioning_state,license_status,monthly_fee,current_period_end,trial_ends_at,user_limit,aktif_uye,contact_phone,custom_domain,davet_eposta,grup_markasi,sector")
      .eq("id", id).maybeSingle(),
    supabase.from("organizations").select("created_at").eq("id", id).maybeSingle(),
    supabase.from("organization_product_licenses").select("product,status,monthly_fee,current_period_end,trial_ends_at").eq("organization_id", id),
  ]);
  if (kurumHatasi) throw new Error(`Müşteri okunamadı: ${kurumHatasi.message}`);
  if (!kurumSatiri) notFound();
  // Ürünler sayfanın asıl konusu: okunamaması "ürünü yok" demek değil.
  if (urunHatasi) throw new Error(`Ürün lisansları okunamadı: ${urunHatasi.message}`);
  const kurum = kurumSatiri as unknown as Kurum;

  /*
    Ödemeler bu kurumla SINIRLI ve bilerek sınırsız okunuyor: "toplam
    tahsil edilen" bunların toplamı; bir sınır koymak toplamı sessizce
    eksiltirdi (check:rakamlar). Kurum başına ayda bir-iki satır.
  */
  const [{ data: odemeSatirlari, error: odemeHatasi }, { data: istekSatirlari }, { data: uyelikSatirlari }, { data: etkinlikSatirlari }] = admin
    ? await Promise.all([
        admin.from("organization_payment_requests").select("id,amount,currency,status,product,created_at,reviewed_at,payment_method")
          .eq("organization_id", id).order("created_at", { ascending: false }),
        admin.from("platform_subscription_requests").select("id,contract_no,amount,currency,status,created_at,reviewed_at")
          .eq("target_organization_id", id).order("created_at", { ascending: false }).limit(10),
        admin.from("organization_memberships").select("user_id,role,is_active").eq("organization_id", id),
        admin.from("activity_logs").select("action,entity_type,created_at").eq("organization_id", id).order("created_at", { ascending: false }).limit(6),
      ])
    : [{ data: [], error: null }, { data: [] }, { data: [] }, { data: [] }];
  if (odemeHatasi) throw new Error(`Ödemeler okunamadı: ${odemeHatasi.message}`);
  const odemeler = (odemeSatirlari ?? []) as Odeme[];
  const istekler = (istekSatirlari ?? []) as Istek[];
  const etkinlikler = (etkinlikSatirlari ?? []) as { action: string; entity_type: string; created_at: string }[];

  /* Kullanıcılar: sahipler üstte, pasifler altta. Ad profiles'tan, e-posta
     yönetim API'sinden (kiracı dosyasındaki yolun aynısı); ilk on iki kişi
     gösteriliyor, sayı ve "tümü" bağlantısı üstte. */
  const uyelikler = ((uyelikSatirlari ?? []) as { user_id: string; role: string; is_active: boolean }[])
    .sort((a, b) => Number(b.is_active) - Number(a.is_active) || Number(b.role === "owner") - Number(a.role === "owner"));
  const gosterilenUyeler = uyelikler.slice(0, 12);
  const [{ data: profilSatirlari }, hesaplar] = await Promise.all([
    gosterilenUyeler.length
      ? supabase.from("profiles").select("id,full_name").in("id", gosterilenUyeler.map((u) => u.user_id))
      : Promise.resolve({ data: [] }),
    admin
      ? Promise.all(gosterilenUyeler.map(async (u) => {
          const { data } = await admin.auth.admin.getUserById(u.user_id);
          return [u.user_id, data?.user?.email ?? null] as const;
        }))
      : Promise.resolve([] as (readonly [string, string | null])[]),
  ]);
  const profilAdi = new Map(((profilSatirlari ?? []) as { id: string; full_name: string | null }[]).map((p) => [p.id, p.full_name]));
  const eposta = new Map(hesaplar);

  // ---- Ürünler: çekirdek (ArvoOS) + ek ürünler, tek liste.
  const urunById = new Map(((urunSatirlari ?? []) as UrunLisansi[]).map((u) => [u.product, u]));
  const urunler = [
    { kod: "arvoos", ad: "ArvoOS", status: kurum.license_status ?? "inactive", ucret: kurum.monthly_fee, donem: kurum.current_period_end, deneme: kurum.trial_ends_at },
    ...ADDON_PRODUCTS.map((p) => {
      const l = urunById.get(p.code);
      return { kod: p.code, ad: p.name, status: l?.status ?? "inactive", ucret: l?.monthly_fee ?? null, donem: l?.current_period_end ?? null, deneme: l?.trial_ends_at ?? null };
    }),
  ];
  const kullandigi = urunler.filter((u) => u.status !== "inactive");
  const aylik = urunler.filter((u) => ODEYEN.has(u.status)).reduce((t, u) => t + Number(u.ucret ?? 0), 0);
  const yenileme = urunler
    .filter((u) => ACIK.has(u.status))
    .map((u) => (u.status === "trialing" ? u.deneme : u.donem))
    .filter((t): t is string => Boolean(t)).sort()[0] ?? null;

  const onaylanan = odemeler.filter((o) => o.status === "approved");
  const toplamTahsilat = onaylanan.reduce((t, o) => t + Number(o.amount ?? 0), 0);
  const sonTahsilat = onaylanan[0] ?? null;
  const bekleyen = odemeler.filter((o) => o.status === "pending");

  const ad = kurum.display_name || kurum.name;
  const grup = Boolean(kurum.grup_markasi);
  const acikUrun = kullandigi.find((u) => ACIK.has(u.status));
  const genelDurum = kurum.provisioning_state === "failed"
    ? { ad: "Kurulum hatası", ton: "danger" }
    : acikUrun ? { ad: productLicenseLabels[acikUrun.status] ?? acikUrun.status, ton: LISANS_TONU[acikUrun.status] ?? "neutral" }
      : { ad: "Erişim kapalı", ton: "danger" };

  return <main className="plt talep cari ekip liste-sayfa">
    <header className="talep-bas">
      <div className="talep-bas-metin">
        <small className="panel-kicker"><Link href="/panel/platform/musteriler">MÜŞTERİLER</Link> · {grup ? "GRUP MARKASI" : kurum.kind === "internal" ? "ARVO" : "KURUMSAL"}</small>
        <h1>{ad}</h1>
      </div>
      <div className="talep-bas-eylem">
        <Link className="panel-secondary" href={`/panel/platform?organization=${id}`}>Kurum ayarları</Link>
        <Link className="panel-primary" href={`/panel/platform/licenses?organization=${id}`}>Lisans ve ücret</Link>
      </div>
    </header>

    <nav className="kayit-serit talep-serit" aria-label="Müşteri özeti">
      <dl>
        <div><dt>Durum</dt><dd><span className="status-pill" data-tone={genelDurum.ton}>{genelDurum.ad}</span></dd></div>
        <div>
          <dt>{grup ? "Grup içi değer" : "Aylık tutar"}</dt>
          <dd className={aylik ? "cari-arti" : "talep-bos"}>{aylik ? para(aylik) : "Ücret yok"}</dd>
          <small>{kullandigi.filter((u) => ODEYEN.has(u.status)).length} ödeyen ürün</small>
        </div>
        <div><dt>En yakın yenileme</dt><dd className={yenileme ? undefined : "talep-bos"}>{yenileme ? tarih(yenileme) : "—"}</dd></div>
        <div>
          <dt>Kullanıcı</dt>
          <dd>{sayi(Number(kurum.aktif_uye))}{kurum.user_limit ? ` / ${sayi(Number(kurum.user_limit))}` : ""}</dd>
          <small>{kurum.plan_code ? `${PAKET_ADI[kurum.plan_code] ?? kurum.plan_code} paket` : "Paket yok"}</small>
        </div>
        <div>
          <dt>Toplam tahsilat</dt>
          <dd className={toplamTahsilat ? undefined : "talep-bos"}>{toplamTahsilat ? para(toplamTahsilat) : "Yok"}</dd>
          <small>{sonTahsilat ? `son ${tarih(sonTahsilat.reviewed_at ?? sonTahsilat.created_at)}` : `${onaylanan.length} ödeme`}</small>
        </div>
        <div><dt>Müşteri olduğu tarih</dt><dd>{tarih((kayit as { created_at?: string } | null)?.created_at ?? null)}</dd></div>
      </dl>
    </nav>

    {grup ? <KNot>Grup markası: ücretleri müşteri gelirine ve tahsilata girmez, konsolda &quot;grup içi değer&quot; olarak toplanır.</KNot> : null}
    {bekleyen.length ? (
      <KNot ton="uyari">{bekleyen.length} ödeme bildirimi onay bekliyor. <Link href="/panel/platform/payments">Ödemeler&apos;de incele →</Link></KNot>
    ) : null}

    <div className="talep-izgara personel-iki ekip-izgara">
      <div>
        <KKart baslik="Ürünler" aciklama="Kullandığı her ürün, durumu ve ücreti" sag={<span className="status-pill" data-tone="info">{kullandigi.length}/{urunler.length}</span>}>
          <KListe>
            {urunler.map((u) => {
              const acik = ACIK.has(u.status);
              const tarihi = u.status === "trialing" ? u.deneme : u.donem;
              return (
                <KOge
                  key={u.kod}
                  simge={u.ad}
                  baslik={u.ad}
                  alt={u.status === "inactive" ? "Kullanmıyor" : tarihi ? `${u.status === "trialing" ? "deneme bitişi" : "dönem sonu"} ${tarih(tarihi)}` : "dönem girilmedi"}
                  durum={{ etiket: productLicenseLabels[u.status] ?? u.status, ton: acik ? LISANS_TONU[u.status] ?? "neutral" : "neutral" }}
                  deger={u.ucret ? para(Number(u.ucret)) : u.status === "inactive" ? "—" : <span className="k-ios-eksik">Ücret yok</span>}
                  degerAlt={u.ucret ? (grup ? "grup içi" : "aylık") : undefined}
                />
              );
            })}
          </KListe>
        </KKart>

        <KKart baslik="Ödemeler" aciklama="Kurumun ödeme bildirimleri, en yenisi üstte" sag={<Link className="panel-secondary" href="/panel/platform/payments">Ödemeler</Link>}>
          {odemeler.length ? (
            <KListe>
              {odemeler.slice(0, 8).map((o) => {
                const durum = ODEME_DURUMU[o.status] ?? { ad: o.status, ton: "neutral" };
                return (
                  <KOge
                    key={o.id}
                    baslik={o.product ? productName(o.product) : "Abonelik ödemesi"}
                    alt={[tarihSaat(o.created_at), ODEME_YOLU[o.payment_method ?? ""] ?? o.payment_method].filter(Boolean).join(" · ")}
                    durum={{ etiket: durum.ad, ton: durum.ton }}
                    deger={para(Number(o.amount), o.currency ?? "TRY")}
                  />
                );
              })}
            </KListe>
          ) : <KBos baslik="Ödeme kaydı yok" aciklama={admin ? undefined : "Sunucu anahtarı tanımlı olmadığı için okunamıyor."} />}
          {odemeler.length > 8 ? <p className="panel-muted">Son 8 ödeme gösteriliyor; toplam {odemeler.length} kayıt. Toplam tahsilat hepsinden.</p> : null}
        </KKart>

        {istekler.length ? (
          <KKart baslik="Sözleşmeler" aciklama="Bu kurum için açılan abonelik istekleri" sag={<Link className="panel-secondary" href="/panel/platform/sozlesmeler">Tümü</Link>}>
            <KListe>
              {istekler.map((s) => {
                const durum = ISTEK_DURUMU[s.status] ?? { ad: s.status, ton: "neutral" };
                return (
                  <KOge
                    key={s.id}
                    baslik={s.contract_no ? `Sözleşme ${s.contract_no}` : "Sözleşme"}
                    alt={tarih(s.reviewed_at ?? s.created_at)}
                    durum={{ etiket: durum.ad, ton: durum.ton }}
                    deger={s.amount ? para(Number(s.amount), s.currency ?? "TRY") : undefined}
                  />
                );
              })}
            </KListe>
          </KKart>
        ) : null}
      </div>

      <div className="liste-sag">
        <KKart baslik="İletişim">
          <KListe>
            <KOge baslik="Yasal unvan" deger={kurum.name} />
            <KOge baslik="Yetkili e-posta" deger={kurum.davet_eposta ? <a href={`mailto:${kurum.davet_eposta}`}>{kurum.davet_eposta}</a> : <span className="k-ios-eksik">Yok</span>} />
            <KOge baslik="Telefon" deger={kurum.contact_phone ? <a href={`tel:${kurum.contact_phone.replace(/\s/g, "")}`}>{kurum.contact_phone}</a> : <span className="k-ios-eksik">Girilmedi</span>} />
            {kurum.custom_domain ? <KOge baslik="Alan adı" deger={kurum.custom_domain} /> : null}
          </KListe>
        </KKart>

        <KKart baslik="Kullanıcılar" sag={<span className="status-pill" data-tone="neutral">{sayi(Number(kurum.aktif_uye))} aktif</span>}>
          {gosterilenUyeler.length ? (
            <KListe>
              {gosterilenUyeler.map((u) => {
                const adi = profilAdi.get(u.user_id) || eposta.get(u.user_id) || "Adı kayıtlı değil";
                return (
                  <KOge
                    key={u.user_id}
                    simge={adi}
                    baslik={adi}
                    alt={[ROL_ADI[u.role] ?? u.role, profilAdi.get(u.user_id) ? eposta.get(u.user_id) : null].filter(Boolean).join(" · ")}
                    durum={u.is_active ? null : { etiket: "Pasif", ton: "neutral" }}
                  />
                );
              })}
            </KListe>
          ) : <KBos baslik="Kullanıcı yok" />}
          {uyelikler.length > gosterilenUyeler.length ? (
            <p className="panel-muted">İlk {gosterilenUyeler.length} kişi; bütün liste <Link href={`/panel/platform?organization=${id}`}>Kurum ayarları</Link>&apos;nda.</p>
          ) : null}
        </KKart>

        <KKart baslik="Son etkinlik" aciklama="Kurumun panelindeki son işlemler">
          {etkinlikler.length ? (
            <KListe>
              {etkinlikler.map((e, i) => (
                <KOge key={`${e.created_at}-${i}`} baslik={ETKINLIK_ADI[e.action] ?? e.action} alt={VARLIK_ADI[e.entity_type] ?? e.entity_type} deger={tarih(e.created_at)} />
              ))}
            </KListe>
          ) : <KBos baslik="Etkinlik yok" />}
        </KKart>
      </div>
    </div>
  </main>;
}
