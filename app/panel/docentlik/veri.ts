import "server-only";
import { SAYFA_BOYU, aralikDisiMi, sayfaAraligi } from "@/lib/liste-sayfalama";
import { docentlikOzeti, kendiDonemi, type OzetFaaliyeti } from "@/lib/docentlik-islem";
import type { Hedef } from "@/lib/docentlik/ozet";
import { docentlikBaglami, okunamadiysaFirlat, yetkiGerekli, type DocentlikBaglami } from "./baglam";

/*
  DOÇENTLİK OKUMA İŞLEVLERİ (F6 PR5). Sayfalar (sonraki PR) buradan okur;
  "use server" DEĞİL, yani istemciden çağrılabilir bir uç nokta değil.
  Her okuma kullanıcının kendi oturumuyla yapılıyor: kimin neyi göreceğine
  RLS karar veriyor (20261114200939), buradaki yetenek sorusu yalnızca
  boş liste yerine anlaşılır bir cümle vermek için.

  Gözetim için doktora tarihi HİÇBİR yoldan dönmüyor: kişi özeti alanları
  docentlik_profil_ozetleri'nden ("tarih girildi mi"), dönemi
  docentlik_faaliyet_donemleri'nden alıyor.
*/

export const FAALIYET_SUTUNLARI =
  "id, owner_id, criteria_id, title, unit_count, yazar_sayisi, baslica_yazar, faaliyet_tarihi, notes, computed_points, paylasim_katsayisi, kural_surumu, belge_yolu, created_at, updated_at";

/*
  Aralık dışı sayfa (?sayfa=99999, bayat yer imi) bir HATA değil: PostgREST
  416 döndürüyor ve onu "okunamadı" diye fırlatmak sayfayı çökertirdi
  (16.10.2026'da sekiz listede böyleydi, lib/liste-sayfalama → aralikDisiMi).
  Çağıran ilk sayfaya yönlendirir.
*/
export async function faaliyetlerim(sayfa = 1) {
  const b = await docentlikBaglami();
  const [bas, son] = sayfaAraligi(sayfa);
  const { data, error, count } = await b.supabase.from("docentlik_faaliyetleri")
    .select(FAALIYET_SUTUNLARI, { count: "exact" })
    .eq("organization_id", b.kurum).eq("owner_id", b.ben)
    .order("created_at", { ascending: false }).range(bas, son);
  if (aralikDisiMi(error)) return { satirlar: [], toplam: 0, sayfaBoyu: SAYFA_BOYU, aralikDisi: true };
  okunamadiysaFirlat(error, "Faaliyetler");
  return { satirlar: data ?? [], toplam: count ?? 0, sayfaBoyu: SAYFA_BOYU, aralikDisi: false };
}

/** Kurumun bütün faaliyetleri — yalnızca docentlik.tumunu_gor (ve Kurum Sahibi). */
export async function kurumFaaliyetleri(sayfa = 1, kisi: string | null = null) {
  const b = await docentlikBaglami();
  yetkiGerekli(b, "docentlik.tumunu_gor", "Kurumun bütün faaliyetlerini görme yetkiniz yok.");
  const [bas, son] = sayfaAraligi(sayfa);
  let sorgu = b.supabase.from("docentlik_faaliyetleri")
    .select(FAALIYET_SUTUNLARI, { count: "exact" })
    .eq("organization_id", b.kurum);
  if (kisi) sorgu = sorgu.eq("owner_id", kisi);
  const { data, error, count } = await sorgu.order("created_at", { ascending: false }).range(bas, son);
  okunamadiysaFirlat(error, "Faaliyetler");
  return { satirlar: data ?? [], toplam: count ?? 0, sayfaBoyu: SAYFA_BOYU };
}

/*
  ÖZET İÇİN BÜTÜN FAALİYETLER, SAYFA SAYFA. Toplam puan bir SONUÇ:
  PostgREST'in satır tavanına (varsayılan 1000) çarpan tek bir okuma,
  toplamı sessizce eksik gösterirdi (AGENTS.md: rakam denetimi). Bu yüzden
  sınırsız okuma bilerek ve tavanı aşan durumda sayfa sayfa.
*/
const SAYFA = 1000;
async function butunFaaliyetler(b: DocentlikBaglami, sahip: string) {
  const satirlar: { id: string; criteria_id: string; computed_points: number | string; faaliyet_tarihi: string | null }[] = [];
  for (let bas = 0; ; bas += SAYFA) {
    const { data, error } = await b.supabase.from("docentlik_faaliyetleri")
      .select("id, criteria_id, computed_points, faaliyet_tarihi")
      .eq("organization_id", b.kurum).eq("owner_id", sahip)
      .order("id").range(bas, bas + SAYFA - 1);
    okunamadiysaFirlat(error, "Faaliyetler");
    satirlar.push(...(data ?? []));
    if ((data?.length ?? 0) < SAYFA) return satirlar;
  }
}

async function kriterVeHedefler(b: DocentlikBaglami) {
  const [kriterler, hedefler] = await Promise.all([
    b.supabase.from("docentlik_kriterleri").select("id, category_group").eq("organization_id", b.kurum),
    b.supabase.from("docentlik_hedefleri")
      .select("organization_id, temel_alan, alt_alan, grup, asgari_puan, azami_puan, doktora_sonrasi")
      .eq("organization_id", b.kurum),
  ]);
  okunamadiysaFirlat(kriterler.error, "Kriterler");
  okunamadiysaFirlat(hedefler.error, "Hedefler");
  const hedefListesi: Hedef[] = (hedefler.data ?? []).map((h) => ({
    ...h,
    asgari_puan: h.asgari_puan == null ? null : Number(h.asgari_puan),
    azami_puan: h.azami_puan == null ? null : Number(h.azami_puan),
  }));
  return { kriterler: kriterler.data ?? [], hedefler: hedefListesi };
}

/** Kişinin kendi özeti: kendi doktora tarihiyle dönem, PR #318 çekirdeğiyle puan ve hedef durumu. */
export async function docentlikOzetim() {
  const b = await docentlikBaglami();
  const [{ data: profil, error: profilHatasi }, faaliyetler, kh] = await Promise.all([
    b.supabase.from("docentlik_profilleri").select("doktora_tarihi, temel_alan, alt_alan")
      .eq("organization_id", b.kurum).eq("owner_id", b.ben).maybeSingle(),
    butunFaaliyetler(b, b.ben),
    kriterVeHedefler(b),
  ]);
  okunamadiysaFirlat(profilHatasi, "Profil");
  const doktora = profil?.doktora_tarihi ?? null;
  const ozetFaaliyetleri: OzetFaaliyeti[] = faaliyetler.map((f) => ({ ...f, donem: kendiDonemi(f.faaliyet_tarihi, doktora) }));
  return docentlikOzeti({
    faaliyetler: ozetFaaliyetleri, ...kh, kurum: b.kurum,
    temelAlan: profil?.temel_alan ?? null, altAlan: profil?.alt_alan ?? null, doktoraTarihiBiliniyor: doktora !== null,
  });
}

/*
  Gözetimcinin bir kişinin özetine bakışı. Doktora tarihi YOK: alanlar ve
  "girildi mi" profil özetinden, dönem veritabanının hesapladığı
  listeden. Kişi kurumun üyesi değilse ya da yetki yoksa iki işlev de boş
  döner; boş profil "doktora tarihi girilmemiş" sayılır (temkinli taraf).
*/
export async function kisiOzeti(kisi: string) {
  const b = await docentlikBaglami();
  yetkiGerekli(b, "docentlik.tumunu_gor", "Bu kişinin faaliyetlerini görme yetkiniz yok.");
  const [profiller, donemler, faaliyetler, kh] = await Promise.all([
    b.supabase.rpc("docentlik_profil_ozetleri", { p_org: b.kurum }),
    b.supabase.rpc("docentlik_faaliyet_donemleri", { p_org: b.kurum }),
    butunFaaliyetler(b, kisi),
    kriterVeHedefler(b),
  ]);
  okunamadiysaFirlat(profiller.error, "Profil özetleri");
  okunamadiysaFirlat(donemler.error, "Dönemler");
  const profil = ((profiller.data ?? []) as { owner_id: string; temel_alan: string | null; alt_alan: string | null; doktora_tarihi_girildi: boolean }[])
    .find((p) => p.owner_id === kisi) ?? null;
  const donemHaritasi = new Map(((donemler.data ?? []) as { faaliyet_id: string; donem: OzetFaaliyeti["donem"] }[]).map((d) => [d.faaliyet_id, d.donem]));
  const ozetFaaliyetleri: OzetFaaliyeti[] = faaliyetler.map((f) => ({ ...f, donem: donemHaritasi.get(f.id) ?? "bilinmiyor" }));
  return docentlikOzeti({
    faaliyetler: ozetFaaliyetleri, ...kh, kurum: b.kurum,
    temelAlan: profil?.temel_alan ?? null, altAlan: profil?.alt_alan ?? null,
    doktoraTarihiBiliniyor: Boolean(profil?.doktora_tarihi_girildi),
  });
}

export async function profilim() {
  const b = await docentlikBaglami();
  const { data, error } = await b.supabase.from("docentlik_profilleri").select("doktora_tarihi, temel_alan, alt_alan, updated_at")
    .eq("organization_id", b.kurum).eq("owner_id", b.ben).maybeSingle();
  okunamadiysaFirlat(error, "Profil");
  return data;
}

/** Kriterler herkese açık (faaliyet girmek için); pasif olanlar yalnızca kriter_yonet'e listelenir. */
export async function kriterleriOku() {
  const b = await docentlikBaglami();
  let sorgu = b.supabase.from("docentlik_kriterleri")
    .select("id, code, label, category_group, points_per_unit, notes, is_active, baslica_yazar_katsayisi, diger_yazar_katsayisi, esit_bolusum, temel_alan, alt_alan, updated_at")
    .eq("organization_id", b.kurum);
  if (!b.izin("docentlik.kriter_yonet")) sorgu = sorgu.eq("is_active", true);
  const { data, error } = await sorgu.order("code");
  okunamadiysaFirlat(error, "Kriterler");
  return data ?? [];
}

/*
  Kurumun BÜTÜN kriterleri (pasifler dahil), yalnızca görüntü için:
  faaliyet listesinde pasife alınmış bir kriterin kaydı da adıyla
  görünmeli, "bilinmeyen kriter" değil. Formun seçenekleri bunun içinden
  süzülüyor (lib/docentlik-gorunum → kriterSecenekleri): etkin + alana
  uygun + düzenlenen kaydın kendi kriteri.
*/
export async function kriterlerTumu() {
  const b = await docentlikBaglami();
  const { data, error } = await b.supabase.from("docentlik_kriterleri")
    .select("id, code, label, category_group, points_per_unit, is_active, temel_alan, alt_alan")
    .eq("organization_id", b.kurum).order("code");
  okunamadiysaFirlat(error, "Kriterler");
  return data ?? [];
}

export async function hedefleriOku() {
  const b = await docentlikBaglami();
  const { data, error } = await b.supabase.from("docentlik_hedefleri")
    .select("id, temel_alan, alt_alan, grup, asgari_puan, azami_puan, doktora_sonrasi, notlar, updated_at")
    .eq("organization_id", b.kurum).order("grup");
  okunamadiysaFirlat(error, "Hedefler");
  return data ?? [];
}

export async function uakTablolari() {
  const b = await docentlikBaglami();
  yetkiGerekli(b, "docentlik.uak_yonet", "ÜAK tablolarını yönetme yetkiniz yok.");
  const { data, error } = await b.supabase.from("docentlik_uak_tablolari")
    .select("id, temel_alan, donem, dosya_adi, durum, yuklendi_at, onaylandi_at")
    .eq("organization_id", b.kurum).order("temel_alan");
  okunamadiysaFirlat(error, "ÜAK tabloları");
  return data ?? [];
}
