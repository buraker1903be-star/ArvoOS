import Link from "next/link";
import { getPanelContext } from "@/lib/panel-context";
import { postaDurumu } from "@/lib/posta-hesabi";
import { postaAramaDeseni } from "@/lib/posta-ayristirma";
import { istanbulTarihSaat } from "./bicim";
import "./posta.css";

/*
  ORTAK GELEN KUTUSU — konuşma listesi.

  Liste veritabanından okunuyor, Gmail'den değil: her sayfa açılışında
  Gmail'e gitmek hem yavaş hem kota yakıyor, üstelik ekibin ortak durumu
  (ilgilenen, yanıtlandı) zaten bizde. Gmail'e yalnızca bir konuşma
  AÇILDIĞINDA gidiliyor, gövdeyi okumak için.
*/

export const dynamic = "force-dynamic";

type Konusma = {
  thread_id: string;
  konu: string | null;
  son_gonderen_ad: string | null;
  son_gonderen_adres: string | null;
  son_mesaj_at: string | null;
  ozet: string | null;
  mesaj_sayisi: number;
  okunmamis: boolean;
  durum: string;
  ilgilenen_user_id: string | null;
  opportunity_id: string | null;
  /* Gömülü ilişki: PostgREST tek kayıtta nesne, bazı sürümlerde dizi
     döndürüyor — ikisini de karşılayan tip. */
  crm_opportunities: { customer_name: string | null } | { customer_name: string | null }[] | null;
};

/** Bağlı CRM kaydının müşteri adı; yoksa null. */
function musteriAdi(konusma: Konusma): string | null {
  const bag = konusma.crm_opportunities;
  const kayit = Array.isArray(bag) ? bag[0] : bag;
  return kayit?.customer_name ?? null;
}

const DURUM_ETIKETI: Record<string, { ad: string; ton: string }> = {
  acik: { ad: "Açık", ton: "warning" },
  yanitlandi: { ad: "Yanıtlandı", ton: "success" },
  kapali: { ad: "Kapalı", ton: "neutral" },
};

export default async function PostaPage({ searchParams }: { searchParams: Promise<{ durum?: string; q?: string }> }) {
  const { durum: suzgec, q: aranan } = await searchParams;
  const { supabase, membership, userId, izin } = await getPanelContext();
  const hesap = await postaDurumu(membership.organization_id);

  let sorgu = supabase
    .from("mail_threads")
    .select("thread_id,konu,son_gonderen_ad,son_gonderen_adres,son_mesaj_at,ozet,mesaj_sayisi,okunmamis,durum,ilgilenen_user_id,opportunity_id,crm_opportunities(customer_name)")
    .eq("organization_id", membership.organization_id)
    .order("son_mesaj_at", { ascending: false })
    .limit(100);
  if (suzgec && DURUM_ETIKETI[suzgec]) sorgu = sorgu.eq("durum", suzgec);

  /*
    ARAMA. Binlerce konuşmanın biriktiği bir kutuda liste tek başına
    kullanılamaz hâle geliyor; "geçen ay şu müşteri ne yazmıştı" sorusunun
    cevabı yoktu.

    Gmail'in arama ucuna değil KENDİ üst verimize soruluyor: liste zaten
    buradan çiziliyor, Gmail'e gitmek her tuşta bir ağ turu ve kota
    demekti. Karşılığında arama gövdede değil konu, gönderen ve özette.
  */
  const desen = postaAramaDeseni(aranan ?? "");
  if (desen) {
    sorgu = sorgu.or(
      `konu.ilike.*${desen}*,son_gonderen_ad.ilike.*${desen}*,son_gonderen_adres.ilike.*${desen}*,ozet.ilike.*${desen}*`,
    );
  }

  const { data, error } = await sorgu;
  if (error) throw new Error("Konuşmalar okunamadı: " + error.message);
  const konusmalar = (data ?? []) as Konusma[];

  // Ekip adları: "ilgilenen" sütunu kullanıcı kimliği tutuyor, ekranda ad gerekiyor.
  const ilgilenenler = [...new Set(konusmalar.map((satir) => satir.ilgilenen_user_id).filter(Boolean))] as string[];
  const { data: personeller } = ilgilenenler.length
    ? await supabase.from("hr_employees").select("user_id,full_name")
        .eq("organization_id", membership.organization_id).in("user_id", ilgilenenler)
    : { data: [] };
  const adlar = new Map(((personeller ?? []) as { user_id: string; full_name: string }[]).map((satir) => [satir.user_id, satir.full_name]));

  const okunmamisSayisi = konusmalar.filter((satir) => satir.okunmamis).length;

  return <div className="posta">
    <div className="panel-pagehead">
      <div>
        <small className="panel-kicker">ORTAK POSTA KUTUSU</small>
        <h1>{hesap.adres ?? "Posta"}</h1>
        <p>{okunmamisSayisi ? `${okunmamisSayisi} okunmamış konuşma` : "Okunmamış konuşma yok"} · son eşitleme {istanbulTarihSaat(hesap.sonEsitleme)}</p>
      </div>
      {izin("posta.yanitla")
        ? <div className="panel-page-actions"><Link className="panel-primary" href="/panel/posta/yeni">Yeni posta</Link></div>
        : null}
    </div>

    {hesap.sonHata ? <p className="posta-uyari">Son eşitleme hatası: {hesap.sonHata}</p> : null}

    {/* Arama sunucuda: form GET ile kendi sayfasına gönderiyor, böylece
        sonuç paylaşılabilir bir adres oluyor ve geri tuşu çalışıyor. */}
    <form className="posta-arama" method="get" action="/panel/posta" role="search">
      {suzgec ? <input type="hidden" name="durum" value={suzgec} /> : null}
      <input type="search" name="q" defaultValue={aranan ?? ""} placeholder="Konu, gönderen veya özette ara…" aria-label="Postalarda ara" />
      <button className="panel-secondary" type="submit">Ara</button>
      {desen ? <Link className="panel-secondary" href={suzgec ? `/panel/posta?durum=${suzgec}` : "/panel/posta"}>Temizle</Link> : null}
    </form>

    <nav className="module-tabs" aria-label="Duruma göre süzgeç">
      {/* Süzgeç değişirken arama korunuyor: "kapalı olanlarda aynı kelimeyi
          ara" en sık istenen ikinci adım ve kutuyu yeniden yazdırmak gerekmesin. */}
      <Link href={desen ? `/panel/posta?q=${encodeURIComponent(desen)}` : "/panel/posta"} className={!suzgec ? "active" : ""}>Tümü</Link>
      {Object.entries(DURUM_ETIKETI).map(([anahtar, etiket]) => (
        <Link key={anahtar} href={`/panel/posta?durum=${anahtar}${desen ? `&q=${encodeURIComponent(desen)}` : ""}`} className={suzgec === anahtar ? "active" : ""}>{etiket.ad}</Link>
      ))}
    </nav>

    {konusmalar.length === 0 ? (
      <div className="posta-bos">
        <p>{desen ? `"${desen}" için sonuç yok.` : "Bu süzgeçte konuşma yok."}</p>
        <small>Kutu 10 dakikada bir eşitleniyor; yeni bağladıysanız ilk eşitlemeyi bekleyin.</small>
      </div>
    ) : (
      <ul className="posta-liste">
        {konusmalar.map((konusma) => {
          const etiket = DURUM_ETIKETI[konusma.durum] ?? DURUM_ETIKETI.acik;
          const ilgilenen = konusma.ilgilenen_user_id ? adlar.get(konusma.ilgilenen_user_id) ?? "Ekipten biri" : null;
          return (
            <li key={konusma.thread_id} data-okunmamis={konusma.okunmamis ? "evet" : undefined}>
              <Link href={`/panel/posta/${konusma.thread_id}`}>
                <span className="posta-kisi">
                  <b>{konusma.son_gonderen_ad || konusma.son_gonderen_adres || "Bilinmeyen gönderen"}</b>
                  <small>{konusma.son_gonderen_adres}</small>
                </span>
                <span className="posta-icerik">
                  <b>{konusma.konu || "(konu yok)"}{konusma.mesaj_sayisi > 1 ? ` (${konusma.mesaj_sayisi})` : ""}</b>
                  <small>{konusma.ozet}</small>
                </span>
                <span className="posta-yan">
                  {musteriAdi(konusma) ? <small className="posta-musteri">{musteriAdi(konusma)}</small> : null}
                  <span className="status-pill" data-tone={etiket.ton}>{etiket.ad}</span>
                  {ilgilenen ? <small>{konusma.ilgilenen_user_id === userId ? "Siz ilgileniyorsunuz" : ilgilenen}</small> : null}
                  <small>{istanbulTarihSaat(konusma.son_mesaj_at)}</small>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    )}
  </div>;
}
