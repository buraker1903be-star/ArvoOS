import Link from "next/link";
import { normalizePhone } from "@/lib/whatsapp-send";
import { loadConversation, type InboxMessage } from "@/lib/whatsapp-inbox";
import { istanbulTime, todayInIstanbul } from "@/lib/istanbul-date";
import type { getPanelContext } from "@/lib/panel-context";

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

export function WhatsappAkisi({ mesajlar, numara, musteri, kisi = "musteri" }: { mesajlar: InboxMessage[]; numara: string | null; musteri: string; kisi?: keyof typeof KISI }) {
  return (
    <div className="musteri-mesajlar">
      {mesajlar.length ? (
        <>
          <ul className="cari-hareketler">
            {mesajlar.map((w) => (
              <li key={w.id}>
                <span className="cari-hareket-metin">
                  <b>{w.direction === "inbound" ? musteri : "Biz"}{w.status === "failed" ? " · gitmedi" : ""}</b>
                  <small className="musteri-mesaj-govde">{w.body || (w.template ? `Şablon: ${w.template}` : w.media ? `Dosya${w.media.filename ? `: ${w.media.filename}` : ""}` : "—")}</small>
                  <small>{zaman(w.createdAt)}</small>
                </span>
              </li>
            ))}
          </ul>
          <Link className="panel-secondary musteri-sekme-bag" href="/panel/crm/whatsapp">WhatsApp ekranını aç</Link>
        </>
      ) : (
        <p className="ic-akis-bos">{numara ? "Bu numarayla WhatsApp yazışması yok." : `${KISI[kisi].iyelik} cep telefonu kayıtlı değil ya da biçimi tanınmıyor.`}</p>
      )}
    </div>
  );
}

export function PostaAkisi({ postalar, epostaVar, eylem, kisi = "musteri" }: { postalar: PostaKonusmasi[]; epostaVar: boolean; eylem?: React.ReactNode; kisi?: keyof typeof KISI }) {
  return (
    <div className="musteri-mesajlar">
      {eylem ? <div className="musteri-sekme-arac">{eylem}</div> : null}
      {postalar.length ? (
        <ul className="cari-hareketler">
          {postalar.map((p) => {
            const durum = POSTA_DURUMU[p.durum] ?? POSTA_DURUMU.acik;
            return (
              <li key={p.thread_id}>
                <Link href={`/panel/posta/${p.thread_id}`}>
                  <span className="cari-hareket-metin">
                    <b>{p.konu || "(konusuz)"}{p.okunmamis ? " · yeni" : ""}</b>
                    <small className="musteri-mesaj-govde">{p.ozet}</small>
                    <small>{[p.son_gonderen_ad || p.son_gonderen_adres, p.son_mesaj_at ? zaman(p.son_mesaj_at) : null, `${p.mesaj_sayisi} ileti`].filter(Boolean).join(" · ")}</small>
                  </span>
                  <span className="status-pill" data-tone={durum.ton}>{durum.ad}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="ic-akis-bos">{epostaVar ? `${KISI[kisi].ile} posta yazışması yok.` : `${KISI[kisi].iyelik} e-posta adresi kayıtlı değil; ${KISI[kisi].baglanti}.`}</p>
      )}
    </div>
  );
}
