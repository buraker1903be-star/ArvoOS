import Link from "next/link";
import { normalizePhone } from "@/lib/whatsapp-send";
import { loadConversation, type InboxMessage } from "@/lib/whatsapp-inbox";
import { istanbulTime, todayInIstanbul } from "@/lib/istanbul-date";
import type { getPanelContext } from "@/lib/panel-context";
import "./musteri-yazismalari.css";

/*
  MÜŞTERİYLE YAZIŞMALAR (2026-10): WhatsApp ve posta, müşteri sayfasında
  ve talep detayında aynı kuralla.

  Eskiden talep detayının "Postalar" sekmesi yalnızca o talebe ELLE
  bağlanmış yazışmaları gösteriyordu; müşterinin aynı adresten yazdığı
  ama eşitlemenin bağlayamadığı postalar görünmüyordu. WhatsApp ise
  hiçbir kayıt sayfasında yoktu, numarayla WhatsApp ekranında aranıyordu.
*/

type Supabase = Awaited<ReturnType<typeof getPanelContext>>["supabase"];

export type PostaKonusmasi = {
  thread_id: string;
  konu: string | null;
  son_gonderen_ad: string | null;
  son_gonderen_adres: string | null;
  son_mesaj_at: string | null;
  ozet: string | null;
  mesaj_sayisi: number;
  okunmamis: boolean;
  durum: string;
};

/*
  WhatsApp: müşterinin numarasıyla eşleşen son 50 mesaj, yeniden eskiye.
  Erişim CRM modülüyle aynı (WhatsApp ekranı da öyle); okuma kapıdan
  (service_role), kurum ve numarayla sınırlı. Numara tanınmazsa null.
*/
export async function musteriWhatsapp(organizationId: string, telefon: string | null | undefined) {
  const numara = normalizePhone(String(telefon ?? ""));
  if (!numara) return { numara: null, mesajlar: [] as InboxMessage[] };
  const { messages } = await loadConversation(organizationId, numara);
  return { numara, mesajlar: messages.slice(-50).reverse() };
}

/*
  Posta: verilen taleplere bağlanmış ya da müşterinin adresinden gelen /
  adresine giden yazışmalar. Çağıran posta.gor yetkisini denetler;
  tablolar RLS'le de posta modülüne kapalı.
*/
export async function musteriPostalari(supabase: Supabase, organizationId: string, girdi: {
  talepIdleri: string[];
  eposta?: string | null;
  /* Personel sayfası: kişinin ÜSTLENDİĞİ yazışmalar da (ilgilenen). */
  ilgilenenKullanici?: string | null;
}) {
  const adres = String(girdi.eposta ?? "").trim().toLowerCase().replace(/[*,()]/g, "");
  const [{ data: bagli }, { data: adresten }, { data: ustlenilen }] = await Promise.all([
    girdi.talepIdleri.length
      ? supabase.from("mail_threads").select("thread_id").eq("organization_id", organizationId).in("opportunity_id", girdi.talepIdleri).limit(50)
      : Promise.resolve({ data: [] }),
    adres
      ? supabase.from("mail_messages").select("thread_id").eq("organization_id", organizationId).or(`gonderen_adres.eq.${adres},alici.ilike.*${adres}*`).limit(200)
      : Promise.resolve({ data: [] }),
    girdi.ilgilenenKullanici
      ? supabase.from("mail_threads").select("thread_id").eq("organization_id", organizationId).eq("ilgilenen_user_id", girdi.ilgilenenKullanici).limit(50)
      : Promise.resolve({ data: [] }),
  ]);
  const idler = [...new Set([...(bagli ?? []), ...(adresten ?? []), ...(ustlenilen ?? [])].map((r) => (r as { thread_id: string }).thread_id))];
  if (!idler.length) return [];
  const { data } = await supabase.from("mail_threads")
    .select("thread_id,konu,son_gonderen_ad,son_gonderen_adres,son_mesaj_at,ozet,mesaj_sayisi,okunmamis,durum")
    .eq("organization_id", organizationId).in("thread_id", idler.slice(0, 200))
    /* Çöptekiler kayıt sayfasında görünmüyor: yazışma Posta'da çöp
       kutusunda ama müşteri sekmesinde duruyor olsaydı, silindiği
       sanılan bir konuşma iki yerden birinde yaşamaya devam ederdi. */
    .is("silindi_at", null)
    .order("son_mesaj_at", { ascending: false }).limit(30);
  return (data ?? []) as PostaKonusmasi[];
}

const POSTA_DURUMU: Record<string, { ad: string; ton: string }> = {
  acik: { ad: "Açık", ton: "warning" },
  yanitlandi: { ad: "Yanıtlandı", ton: "success" },
  kapali: { ad: "Kapalı", ton: "neutral" },
};

/** "7 Ağu 14:05"; bugünse yalnızca saat. Türkiye saatiyle. */
function zaman(iso: string) {
  const tarih = new Date(iso);
  if (todayInIstanbul(tarih) === todayInIstanbul()) return istanbulTime(tarih);
  return `${tarih.toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul", day: "numeric", month: "short" })} ${istanbulTime(tarih)}`;
}

/* Boş durum metinlerindeki kişi: kayıt sayfalarında müşteri, personel sayfasında personel. */
const KISI = {
  musteri: { iyelik: "Müşterinin", ile: "Bu müşteriyle", baglanti: "yalnızca talebe bağlanan yazışmalar görünür" },
  personel: { iyelik: "Personelin", ile: "Bu kişiyle", baglanti: "yalnızca üstlendiği yazışmalar görünür" },
} as const;

/* Gün başlığı: "Bugün", "Dün" ya da "27 Ekim Salı". Türkiye günüyle. */
function gunBasligi(anahtar: string) {
  const simdi = new Date();
  if (anahtar === todayInIstanbul(simdi)) return "Bugün";
  if (anahtar === todayInIstanbul(new Date(simdi.getTime() - 86_400_000))) return "Dün";
  return new Intl.DateTimeFormat("tr-TR", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" }).format(new Date(`${anahtar}T12:00:00Z`));
}

/* Ardışık aynı güne düşenler tek başlık altında; sıra korunur (yeniden eskiye). */
function gunlereAyir<T>(liste: T[], an: (oge: T) => string | null) {
  const gruplar: { anahtar: string; ogeler: T[] }[] = [];
  for (const oge of liste) {
    const deger = an(oge);
    const anahtar = deger ? todayInIstanbul(new Date(deger)) : "—";
    const son = gruplar[gruplar.length - 1];
    if (son?.anahtar === anahtar) son.ogeler.push(oge);
    else gruplar.push({ anahtar, ogeler: [oge] });
  }
  return gruplar;
}

/* normalizePhone "905xxxxxxxxx" verir; ekranda "+90 (5xx) xxx xx xx". */
const telefonYazisi = (n: string) => n.replace(/^90(\d{3})(\d{3})(\d{2})(\d{2})$/, "+90 ($1) $2 $3 $4");

const bas = (ad: string) => ad.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toLocaleUpperCase("tr-TR") ?? "").join("") || "?";

/*
  Boş durum: simge, ne olmadığı ve neden. Eskiden tek satırlık soluk bir
  metindi; sekme boşken kartın ortasında yalnız bir cümle kalıyordu ve
  yönetici bunun "yazışma yok" mu "okunamadı" mı olduğunu ayırt
  edemiyordu (29.10.2026).
*/
function Bos({ simge, baslik, aciklama }: { simge: "mesaj" | "posta"; baslik: string; aciklama: string }) {
  return (
    <div className="yz-bos">
      <span className="yz-bos-simge" aria-hidden="true">
        {simge === "mesaj" ? (
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a8.5 8.5 0 0 1-12.6 7.4L3 21l1.6-5.2A8.5 8.5 0 1 1 21 12Z" /></svg>
        ) : (
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></svg>
        )}
      </span>
      <b>{baslik}</b>
      <small>{aciklama}</small>
    </div>
  );
}

/*
  Görünüm (29.10.2026, kurum sahibinin isteği: personel sayfasının
  Hareketler sekmesiyle "aynı kalitede"). Bileşen bütün kayıt
  sayfalarında ortak; düzen de ortak. Eskiden iki sekme de düz satır
  listesiydi: WhatsApp'ta kimin yazdığı yalnızca satır başındaki adla,
  postada okunmamış olan yalnızca " · yeni" ekiyle ayırt ediliyordu.
  Artık üstte araç çubuğu (sayı + ilgili ekrana geçiş), mesajlar gün gün
  ve yöne göre baloncukta, postalar okunmamış işaretli kartlarda.
*/
export function WhatsappAkisi({ mesajlar, numara, musteri, kisi = "musteri" }: { mesajlar: InboxMessage[]; numara: string | null; musteri: string; kisi?: keyof typeof KISI }) {
  return (
    <div className="musteri-mesajlar yz">
      <header className="yz-bas">
        <div>
          <h2>WhatsApp</h2>
          <small>{numara ? `${telefonYazisi(numara)}${mesajlar.length ? ` · son ${mesajlar.length} mesaj` : ""}` : "Numara yok"}</small>
        </div>
        {numara ? <Link className="panel-secondary yz-git" href="/panel/crm/whatsapp">WhatsApp ekranını aç</Link> : null}
      </header>
      {mesajlar.length ? (
        gunlereAyir(mesajlar, (w) => w.createdAt).map((grup) => (
          <section key={grup.anahtar} className="yz-gun" aria-label={gunBasligi(grup.anahtar)}>
            <h3><span>{gunBasligi(grup.anahtar)}</span></h3>
            <ol className="yz-baloncuklar">
              {grup.ogeler.map((w) => {
                const gelen = w.direction === "inbound";
                const gitmedi = w.status === "failed";
                return (
                  <li key={w.id} data-yon={gelen ? "gelen" : "giden"} data-hata={gitmedi ? "evet" : undefined}>
                    <span className="yz-kim">{gelen ? musteri : "Biz"}</span>
                    <p>{w.body || (w.template ? `Şablon: ${w.template}` : w.media ? `Dosya${w.media.filename ? `: ${w.media.filename}` : ""}` : "—")}</p>
                    <small>{istanbulTime(new Date(w.createdAt))}{gitmedi ? " · gitmedi" : ""}</small>
                  </li>
                );
              })}
            </ol>
          </section>
        ))
      ) : (
        numara ? (
          <Bos simge="mesaj" baslik="Henüz WhatsApp yazışması yok" aciklama="Bu numarayla gelen ya da giden mesaj olduğunda burada gün gün görünür." />
        ) : (
          <Bos simge="mesaj" baslik="Cep telefonu yok" aciklama={`${KISI[kisi].iyelik} cep telefonu kayıtlı değil ya da biçimi tanınmıyor; kartta numarayı düzenleyin.`} />
        )
      )}
    </div>
  );
}

export function PostaAkisi({ postalar, epostaVar, eylem, kisi = "musteri" }: { postalar: PostaKonusmasi[]; epostaVar: boolean; eylem?: React.ReactNode; kisi?: keyof typeof KISI }) {
  const okunmamis = postalar.filter((p) => p.okunmamis).length;
  return (
    <div className="musteri-mesajlar yz">
      <header className="yz-bas">
        <div>
          <h2>Postalar</h2>
          <small>{postalar.length ? `${postalar.length} yazışma${okunmamis ? ` · ${okunmamis} okunmamış` : ""}` : "Yazışma yok"}</small>
        </div>
        <div className="yz-arac">
          {eylem}
          <Link className="panel-secondary yz-git" href="/panel/posta">Posta kutusunu aç</Link>
        </div>
      </header>
      {postalar.length ? (
        <ul className="yz-postalar">
          {postalar.map((p) => {
            const durum = POSTA_DURUMU[p.durum] ?? POSTA_DURUMU.acik;
            const gonderen = p.son_gonderen_ad || p.son_gonderen_adres || "—";
            return (
              <li key={p.thread_id} data-okunmamis={p.okunmamis ? "evet" : undefined}>
                <Link href={`/panel/posta/${p.thread_id}`}>
                  <span className="yz-avatar" aria-hidden="true">{bas(gonderen)}</span>
                  <span className="yz-posta-govde">
                    <span className="yz-posta-ust">
                      <b>{p.konu || "(konusuz)"}</b>
                      <time>{p.son_mesaj_at ? zaman(p.son_mesaj_at) : ""}</time>
                    </span>
                    <small className="yz-ozet">{p.ozet}</small>
                    <span className="yz-posta-alt">
                      <small>{gonderen} · {p.mesaj_sayisi} ileti</small>
                      <span className="status-pill" data-tone={durum.ton}>{durum.ad}</span>
                    </span>
                  </span>
                  {p.okunmamis ? <span className="yz-yeni" aria-label="Okunmamış" /> : null}
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        epostaVar ? (
          <Bos simge="posta" baslik="Henüz posta yazışması yok" aciklama={`${KISI[kisi].ile} yazışma olduğunda burada görünür.`} />
        ) : (
          <Bos simge="posta" baslik="E-posta adresi yok" aciklama={`${KISI[kisi].iyelik} e-posta adresi kayıtlı değil; ${KISI[kisi].baglanti}.`} />
        )
      )}
    </div>
  );
}
