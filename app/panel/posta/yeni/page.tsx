import Link from "next/link";
import { getPanelContext } from "@/lib/panel-context";
import { postaDurumu } from "@/lib/posta-hesabi";
import { postaGovdesiniGetir } from "@/lib/posta-esitleme";
import { yonlendirmeGovdesi, yonlendirmeKonusu } from "@/lib/posta-gonderim";
import { dosyaBoyutu } from "../bicim";
import { taslakKaydet, yeniPostaGonder } from "../actions";
import { HazirCevapSec } from "../hazir-cevap-sec";
import "../posta.css";
import "../../crm/kayit-detay/kayit-detay.css";

/*
  YENİ POSTA.

  Kutu şimdiye kadar yalnızca gelen bir mesaja cevap verebiliyordu;
  müşteriye ilk mesajı atmak için Gmail'e geçmek gerekiyordu ve o mesaj
  panelde hiç görünmüyordu — ortak kutunun "ekip ne yazdı" sorusuna
  cevabı eksik kalıyordu.

  Alanlar adresten ön doldurulabiliyor (CRM kaydındaki "Posta gönder"
  bağlantısı böyle çalışıyor). Adresten gelen değer yalnızca formun
  başlangıç hâli; gönderimde sunucu hepsini yeniden doğruluyor.
*/

export const dynamic = "force-dynamic";

export default async function YeniPostaPage({ searchParams }: {
  searchParams: Promise<{ alici?: string; konu?: string; firsat?: string; taslak?: string; yonlendir?: string }>;
}) {
  const { alici, konu, firsat, taslak: taslakId, yonlendir: yonlendirilenId } = await searchParams;
  const { supabase, membership, organization, userId, izin } = await getPanelContext();
  const hesap = await postaDurumu(membership.organization_id);

  /* Kayıtlı taslaktan devam. Adresten gelen ön doldurma yalnızca yeni
     posta için; taslak varsa onun metni kazanır. */
  const { data: taslak } = taslakId
    ? await supabase.from("mail_drafts").select("id,alici,cc,konu,govde,opportunity_id")
        .eq("organization_id", membership.organization_id).eq("id", taslakId).maybeSingle()
    : { data: null };

  /*
    YÖNLENDİRME. Konuşma ekranındaki "Yönlendir" bu sayfaya bir mesaj
    kimliğiyle geliyor; konu ve gövde özgün mesajdan hazırlanıyor,
    alıcıyı kullanıcı yazıyor.

    Mesajın bu kuruma ait olduğu KENDİ oturumuyla doğrulanıyor: adresteki
    kimliğe güvenip Gmail'den gövde çekmek, başka kurumun mesajını
    okutmanın yolu olurdu.
  */
  const { data: yonlendirilen } = yonlendirilenId
    ? await supabase.from("mail_messages").select("message_id,thread_id,gonderen_ad,gonderen_adres,alici,konu,tarih")
        .eq("organization_id", membership.organization_id).eq("message_id", yonlendirilenId).maybeSingle()
    : { data: null };
  const ozgun = yonlendirilen
    ? await postaGovdesiniGetir(membership.organization_id, yonlendirilen.message_id as string)
    : null;
  const ozgunEkler = ozgun && !("hata" in ozgun) ? ozgun.ekler : [];

  /*
    Hazır cevaplar burada da: yeni posta, müşteriye ilk kez yazılan
    yerdir ve "fiyat bilgisi" gibi metinler en çok orada gerekiyor.
    İlk sürümde yalnızca yanıt formuna bağlanmıştı.
  */
  const bagliFirsatId = (taslak?.opportunity_id ?? firsat) as string | undefined;
  const [{ data: sablonVerisi }, { data: benimKayit }, { data: firsatKaydi }] = await Promise.all([
    izin("posta.yanitla")
      ? supabase.from("mail_templates").select("id,ad,govde")
          .eq("organization_id", membership.organization_id).order("ad")
      : Promise.resolve({ data: [] }),
    supabase.from("hr_employees").select("full_name")
      .eq("organization_id", membership.organization_id).eq("user_id", userId).maybeSingle(),
    /* {{musteri}} için ad: yeni postada alıcı yalnızca adres, kişinin
       adı bilinmiyor. CRM kaydından gelindiyse (Posta gönder bağlantısı)
       ad oradan okunuyor; yoksa yer tutucu metinden düşüyor. */
    bagliFirsatId
      ? supabase.from("crm_opportunities").select("customer_name")
          .eq("organization_id", membership.organization_id).eq("id", bagliFirsatId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const sablonlar = (sablonVerisi ?? []) as { id: string; ad: string; govde: string }[];
  const yonlendirmeKonu = yonlendirilen ? yonlendirmeKonusu((yonlendirilen.konu as string) ?? "") : null;
  const yonlendirmeMetni = yonlendirilen && ozgun && !("hata" in ozgun)
    ? yonlendirmeGovdesi("", {
        gonderenAd: yonlendirilen.gonderen_ad as string | null,
        gonderenAdres: (yonlendirilen.gonderen_adres as string) ?? "",
        alici: yonlendirilen.alici as string | null,
        konu: yonlendirilen.konu as string | null,
        tarih: yonlendirilen.tarih ? new Date(yonlendirilen.tarih as string) : null,
        metin: ozgun.govde,
      })
    : null;

  if (!izin("posta.yanitla")) {
    return <main className="talep cari">
      <header className="talep-bas"><div className="talep-bas-metin"><small className="panel-kicker">ORTAK POSTA KUTUSU</small><h1>Yeni posta</h1></div></header>
      <section className="panel-card"><div className="crm-empty-state"><p>Bu kutudan posta gönderme yetkiniz yok.</p></div></section>
    </main>;
  }

  if (hesap.durum !== "bagli") {
    return <main className="talep cari">
      <header className="talep-bas"><div className="talep-bas-metin"><small className="panel-kicker">ORTAK POSTA KUTUSU</small><h1>Yeni posta</h1></div></header>
      <section className="panel-card">
        <div className="crm-empty-state">
          <p>Ortak posta kutusu bağlı değil.</p>
          <small>Ayarlar → Bağlantılar bölümünden kutuyu bağlayın.</small>
        </div>
      </section>
    </main>;
  }

  return <main className="talep cari">
    <header className="talep-bas">
      <div className="talep-bas-metin">
        <small className="panel-kicker">ORTAK POSTA KUTUSU</small>
        <h1>{yonlendirilen ? "Yönlendir" : "Yeni posta"}</h1>
        <p>{hesap.adres} adresinden gidecek.</p>
      </div>
      <div className="talep-bas-eylem">
        <Link className="panel-secondary" href={yonlendirilen ? `/panel/posta/${yonlendirilen.thread_id as string}` : "/panel/posta"}>
          ← {yonlendirilen ? "Yazışma" : "Gelen kutusu"}
        </Link>
      </div>
    </header>

    <form className="panel-card posta-yanit" action={yeniPostaGonder}>
      {taslak ? <input type="hidden" name="taslak_id" value={taslak.id} /> : null}
      {/* Özgün ekler forma konmuyor; gönderimde sunucu Gmail'den yeniden
          çekiyor. Tarayıcıya indirip geri yüklemek, birkaç megabaytı iki
          kez taşımak ve dosyayı istemciden gelen veriye güvenerek
          göndermek olurdu. */}
      {yonlendirilen ? <input type="hidden" name="yonlendir" value={yonlendirilen.message_id as string} /> : null}
      {(taslak?.opportunity_id ?? firsat) ? <input type="hidden" name="opportunity_id" value={(taslak?.opportunity_id ?? firsat) as string} /> : null}
      <label htmlFor="posta-alici">
        <b>Alıcı</b>
        <small>Birden çok adres için virgülle ayırın.</small>
      </label>
      <input id="posta-alici" name="alici" type="text" required defaultValue={taslak?.alici ?? alici ?? ""} autoComplete="off" placeholder="musteri@ornek.com" />

      <label htmlFor="posta-cc"><b>Bilgi (Cc)</b><small> — isteğe bağlı</small></label>
      <input id="posta-cc" name="cc" type="text" autoComplete="off" defaultValue={taslak?.cc ?? ""} placeholder="bilgi@ornek.com" />

      <label htmlFor="posta-konu"><b>Konu</b></label>
      <input id="posta-konu" name="konu" type="text" required maxLength={300} defaultValue={taslak?.konu ?? yonlendirmeKonu ?? konu ?? ""} autoComplete="off" />

      <label htmlFor="posta-metin"><b>Mesaj</b></label>
      <textarea id="posta-metin" name="govde" rows={10} required maxLength={20000} defaultValue={taslak?.govde ?? yonlendirmeMetni ?? ""} placeholder="Mesajınızı yazın…" />

      {/* Özgün mesaj okunamadıysa sessizce boş bir yönlendirme göndermek
          yerine sebebi yazılıyor. */}
      {yonlendirilen && ozgun && "hata" in ozgun ? (
        <p className="posta-uyari">Özgün mesaj Gmail&apos;den okunamadı: {ozgun.hata}</p>
      ) : null}
      {ozgunEkler.length ? (
        <p className="posta-not">
          Özgün mesajın {ozgunEkler.length} eki birlikte gidecek:{" "}
          {ozgunEkler.map((ek) => `${ek.dosyaAdi} (${dosyaBoyutu(ek.boyut)})`).join(", ")}.
        </p>
      ) : null}

      <div className="posta-yanit-araclar">
        <label className="posta-ek-sec">
          <span>Ek dosya</span>
          <input type="file" name="ekler" multiple />
        </label>
        <HazirCevapSec
          hedefId="posta-metin"
          sablonlar={sablonlar}
          degerler={{
            musteri: (firsatKaydi?.customer_name as string | undefined) ?? "",
            ben: (benimKayit?.full_name as string | undefined) ?? "",
            kurum: organization.display_name || organization.name,
          }}
        />
      </div>

      <div className="posta-yanit-alt">
        <small>Düz metin olarak gönderilir. Ekler toplam en fazla 3 MB (özgün ekler dahil).{hesap.imza ? " Kurum imzası sonuna eklenir." : ""}{(taslak?.opportunity_id ?? firsat) ? " Gönderilen posta bu müşteri kaydına bağlanacak." : ""}{yonlendirilen ? " Yönlendirme yeni bir yazışma olarak açılır." : ""}</small>
        <span className="posta-yanit-dugmeler">
          {/* Yönlendirmede taslak yok: taslak satırı hangi mesajın
              yönlendirildiğini tutmuyor, kaydedip sonra göndermek özgün
              ekleri sessizce düşürürdü. Metin zaten kutuda hazır. */}
          {yonlendirilen ? null : (
            <button className="panel-secondary" type="submit" formAction={taslakKaydet} formNoValidate>Taslak kaydet</button>
          )}
          <button className="panel-primary" type="submit">{yonlendirilen ? "Yönlendir" : "Gönder"}</button>
        </span>
      </div>
    </form>
  </main>;
}
