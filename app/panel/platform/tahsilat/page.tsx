import Link from "next/link";
import { notFound } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";
import { getPaymentIncidents } from "@/lib/payment-incidents";
import { musteriMi } from "@/lib/kurum-turu";
import { KBos, KListe, KNot, KOge } from "../konsol-ui";
import { para, sayi, tarih } from "../bicim";
import "../platform.css";

/*
  FATURALAMA VE TAHSİLAT (14.10.2026, Kurucu Konsolu'nun ana menüsü).

  Tahsilat listesi bir gün önce Abonelikler sayfasının altındaydı.
  Abonelik "kim ödemeli" sorusu, tahsilat "ne geldi" sorusu; konsol sekiz
  ana menüye geçince ayrıldılar.

  KAYNAK: onaylı kurum ödeme istekleri (havale VE PayTR — kanalı
  payment_method söylüyor) ve bireysel abone ödemeleri. billing_subscriptions
  OKUNMUYOR: her kurum ödemesinin aktivasyon ikizi, toplanınca her ödeme
  iki kez sayılıyordu (20261014062145). Toplamlar platform_tahsilat_ozeti
  işlevinden; liste yalnızca gösterilen son elli satır.

  FATURA: platformun kiracıya kestiği fatura bugün YOK. Aktivasyon,
  kiracının kendi fatura tablosuna (billing_invoices) "ödendi" satırı
  yazıyor — o kiracının kendi müşterilerine kestiği faturaların tablosu,
  Arvo'nun faturası değil. Bölüm bunu açıkça söylüyor; Paraşüt
  entegrasyonu (e-fatura / e-arşiv) bağlandığında burası fatura listesi
  olacak. Çalışmayan özellik çalışıyormuş gibi gösterilmiyor.
*/

const LISTE = 50;

type Tahsilat = { anahtar: string; organizationId: string | null; kim: string; kanal: string; amount: number; currency: string; tarih: string | null };

const KANALLAR = [
  { kod: "", ad: "Tümü" },
  { kod: "havale", ad: "Havale" },
  { kod: "kart", ad: "Kart" },
  { kod: "bireysel", ad: "Bireysel" },
  { kod: "fatura", ad: "Faturalar" },
] as const;

export default async function TahsilatPage({ searchParams }: { searchParams: Promise<{ kanal?: string }> }) {
  const { supabase, isPlatformOwner } = await getPanelContext();
  if (!isPlatformOwner) notFound();
  const { kanal } = await searchParams;
  const secili = KANALLAR.some((k) => k.kod === kanal) ? kanal! : "";

  const [
    { data: ozetVerisi, error: ozetHatasi },
    { data: kurumOdemeleri, error: kurumHatasi },
    { data: aboneOdemeleri, error: aboneHatasi },
    { data: bekleyenler, error: bekleyenHatasi },
    { data: kurumlar },
    olaylar,
  ] = await Promise.all([
    supabase.rpc("platform_tahsilat_ozeti"),
    supabase.from("organization_payment_requests").select("id,organization_id,amount,currency,payment_method,reviewed_at")
      .eq("status", "approved").order("reviewed_at", { ascending: false, nullsFirst: false }).limit(LISTE),
    supabase.from("subscriber_payments").select("id,amount,currency,paid_at").order("paid_at", { ascending: false, nullsFirst: false }).limit(LISTE),
    // Onay bekleyen havaleler: hepsi (bugünün iş kuyruğu, küçük).
    supabase.from("organization_payment_requests").select("id,amount,currency").eq("status", "pending"),
    supabase.from("organizations").select("id,name,display_name,kind,grup_markasi"),
    getPaymentIncidents(),
  ]);
  const hata = ozetHatasi ?? kurumHatasi ?? aboneHatasi ?? bekleyenHatasi;
  if (hata) throw new Error("Tahsilat okunamadı: " + hata.message);

  const ozet = (ozetVerisi ?? {}) as { adet?: number; toplam?: number; bu_ay?: number; birimler?: string[] };
  const kurumBilgisi = new Map(((kurumlar ?? []) as { id: string; name: string; display_name: string | null; kind: string | null; grup_markasi: boolean | null }[]).map((k) => [k.id, k]));
  const birimKarisik = (ozet.birimler ?? []).length > 1;

  /* Kendi kurumlarımızın ödemesi gelir değil (özet işleviyle aynı kural). */
  const tahsilatlar: Tahsilat[] = [
    ...((kurumOdemeleri ?? []) as { id: string; organization_id: string; amount: number; currency: string; payment_method: string | null; reviewed_at: string | null }[])
      // Arvo'nun kendisi ve grup markaları gelir değil (özet işleviyle aynı kural).
      .filter((o) => musteriMi(kurumBilgisi.get(o.organization_id)))
      .map((o) => {
        const k = kurumBilgisi.get(o.organization_id);
        return {
          anahtar: `kurum-${o.id}`, organizationId: o.organization_id, kim: k?.display_name || k?.name || "Kurum",
          kanal: o.payment_method === "paytr" ? "Kart (PayTR)" : "Havale/EFT", amount: Number(o.amount), currency: o.currency, tarih: o.reviewed_at,
        };
      }),
    ...((aboneOdemeleri ?? []) as { id: string; amount: number; currency: string; paid_at: string | null }[])
      .map((o) => ({ anahtar: `abone-${o.id}`, organizationId: null, kim: "Bireysel abone", kanal: "Kart", amount: Number(o.amount), currency: o.currency, tarih: o.paid_at })),
  ].sort((a, b) => (b.tarih ?? "").localeCompare(a.tarih ?? "")).slice(0, LISTE);
  /* Kanal süzgeci gösterilen listede (son elli). Toplamlar süzgeçten
     bağımsız, bütün kayıtlardan (özet işlevi). */
  const kanalinda = (t: Tahsilat) =>
    secili === "havale" ? t.kanal === "Havale/EFT" : secili === "kart" ? t.kanal === "Kart (PayTR)" : secili === "bireysel" ? t.organizationId === null : true;
  const gorunen = tahsilatlar.filter(kanalinda);
  const kanalSayisi = (ad: string) => tahsilatlar.filter((t) => t.kanal === ad).length;

  const bekleyenSatirlar = (bekleyenler ?? []) as { amount: number; currency: string }[];
  // tuzak-tamam: sınırsız sorgu (bekleyen havalelerin hepsi), toplam doğru.
  const bekleyenTutar = bekleyenSatirlar.reduce((t, b) => t + Number(b.amount), 0);

  return <main className="plt talep cari ekip liste-sayfa">
    <header className="talep-bas">
      <div className="talep-bas-metin">
        <small className="panel-kicker">PLATFORM · FATURALAMA VE TAHSİLAT</small>
        <h1>Faturalama ve Tahsilat</h1>
      </div>
      <div className="talep-bas-eylem">
        <Link className="panel-secondary" href="/panel/platform/payments">Ödeme onayları</Link>
        <Link className="panel-secondary" href="/panel/platform/billing">Abonelikler</Link>
      </div>
    </header>

    <nav className="kayit-serit talep-serit" aria-label="Tahsilat özeti">
      <dl>
        <div><dt>Bu ay tahsil edilen</dt><dd className="cari-arti">{para(Number(ozet.bu_ay ?? 0))}</dd><small>Türkiye takvimiyle bu ay</small></div>
        <div><dt>Tüm zamanlar</dt><dd>{para(Number(ozet.toplam ?? 0))}</dd><small>{sayi(Number(ozet.adet ?? 0))} ödeme</small></div>
        <div>
          <dt>Onay bekleyen havale</dt>
          <dd className={bekleyenSatirlar.length ? "talep-uyari" : undefined}><Link href="/panel/platform/payments">{sayi(bekleyenSatirlar.length)}</Link></dd>
          <small>{bekleyenSatirlar.length ? `${para(bekleyenTutar)} tutarında` : "Bekleyen dekont yok"}</small>
        </div>
        <div>
          <dt>İşlenemeyen kart ödemesi</dt>
          <dd className={olaylar.length ? "talep-uyari" : undefined}>{olaylar.length ? <Link href="/panel/platform/payments#karsiliksiz">{sayi(olaylar.length)}</Link> : 0}</dd>
          <small>{olaylar.length ? "PayTR ödedi, kayıt oluşmadı" : "Yok"}</small>
        </div>
      </dl>
    </nav>

    {/*
      Sağdaki istatistik kartı kalktı (14.10.2026, iOS listesi): dört
      kutusu şeritteki sayıların aynısıydı, kanal dağılımı çiplerin
      yanında yazıyor, "platform faturası yok" da Faturalar sekmesinde.
      Liste kartı tek başına, liste sayfası düzeninde.
    */}
    <section className="panel-card talep-bilgi" aria-label="Tahsilat listesi">
      <div className="ekip-suzgec talep-suzgec">
        {KANALLAR.map((k) => (
          <Link key={k.kod} href={k.kod ? `/panel/platform/tahsilat?kanal=${k.kod}` : "/panel/platform/tahsilat"}
            className={secili === k.kod ? "is-active" : undefined} aria-current={secili === k.kod ? "page" : undefined}>
            {k.ad}
            {k.kod === "havale" ? <small>{kanalSayisi("Havale/EFT")}</small> : k.kod === "kart" ? <small>{kanalSayisi("Kart (PayTR)")}</small> : k.kod === "bireysel" ? <small>{tahsilatlar.filter((t) => !t.organizationId).length}</small> : null}
          </Link>
        ))}
      </div>

      {birimKarisik ? <KNot ton="uyari">Kayıtlarda birden çok para birimi var; toplamlar TRY varsayımıyla yazıldı ve güvenilir değil.</KNot> : null}

      {secili === "fatura" ? (
        /* Platform faturası bugün yok: çalışmayan özellik çalışıyormuş
           gibi gösterilmiyor (dosya başındaki açıklama). */
        <KBos
          baslik="Platform faturası henüz kesilmiyor"
          aciklama="Onaylanan her ödeme lisansı açıyor ama Arvo adına fatura oluşturmuyor; faturalar elle kesiliyor. Paraşüt entegrasyonu (e-fatura / e-arşiv) bağlanınca kesilen faturalar burada listelenecek."
        />
      ) : gorunen.length ? (
        /* iOS listesi (14.10.2026): kim, kanal ve tarih tek satırda;
           sağda tutar. Eskiden dört sütunlu tabloydu. */
        <KListe>
          {gorunen.map((t) => (
            <KOge
              key={t.anahtar}
              href={t.organizationId ? `/panel/platform?organization=${t.organizationId}` : "/panel/platform/subscribers"}
              simge={t.kim}
              baslik={t.kim}
              alt={`${t.kanal} · ${tarih(t.tarih)}`}
              deger={para(t.amount, t.currency)}
            />
          ))}
        </KListe>
      ) : (
        <KBos baslik={secili ? "Bu kanalda tahsilat yok" : "Henüz tahsilat yok"} aciklama="Havale onayları, kart ödemeleri ve bireysel abonelikler burada toplanır." />
      )}
    </section>
  </main>;
}
