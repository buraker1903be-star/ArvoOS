import { getPanelContext } from "@/lib/panel-context";
import { kimlikMi } from "@/lib/kimlik";
import { todayInIstanbul } from "@/lib/istanbul-date";
import { primDonemi } from "@/lib/prim-donemi";
import { PRIM_BOLUMLERI, primBolumuMu, primDokumu, primSayfalari } from "@/lib/prim-dokumu";
import { xlsxBasliklari, xlsxUret } from "@/lib/xlsx";
import { primVerisi } from "../../prim-verisi";

/*
  PRİM DÖKÜMÜNÜ EXCEL OLARAK İNDİRME (29.10.2026).

  Dosya pencereyi çizen AYNI dökümden (lib/prim-dokumu); ikinci bir hesap
  yazılmadı. Kapı sayfanınkiyle aynı ve burada YENİDEN soruluyor: rota
  kendi başına çağrılabilir bir adres (AGENTS.md "Yetki üç yerdedir").
  İK modülü açık olmalı, kullanıcı prim hesaplarını görebilmeli
  (hr.prim.gor) ve personel çağıranın kurumunda olmalı — okuma oturum
  istemcisiyle, RLS de kurumla sınırlıyor.

  Yetkisizlikte düz metin 403: tarayıcı dosya bekliyor, yönlendirilen
  HTML'i "bozuk dosya" diye kaydederdi (raporların indirme rotası gibi).
*/
export const dynamic = "force-dynamic";

export async function GET(istek: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!kimlikMi(id)) return hata("Personel bulunamadı.", 404);
  const { supabase, membership, modules, izin, isPlatformOwner } = await getPanelContext();
  if (!modules.some((m) => m.code === "hr")) return hata("İnsan kaynakları modülü bu kurumda kapalı.", 403);
  if (!isPlatformOwner && !izin("hr.prim.gor")) return hata("Prim hesaplarını görme yetkiniz yok.", 403);

  const adres = new URL(istek.url);
  const bolumHam = adres.searchParams.get("bolum");
  const bolum = primBolumuMu(bolumHam) ? bolumHam : "hepsi";
  const veri = await primVerisi(supabase, membership.organization_id);
  const personel = veri.employees.find((e) => e.id === id);
  if (!personel) return hata("Personel bulunamadı.", 404);

  const donem = primDonemi(adres.searchParams.get("prim") ?? undefined, todayInIstanbul(), adres.searchParams.get("prim_bas") ?? undefined, adres.searchParams.get("prim_bit") ?? undefined);
  const dokum = primDokumu(veri, id, donem);
  const sayfalar = primSayfalari(dokum, bolum, personel.full_name);
  // Boş dosya üretilmiyor: başlıklı ama satırsız bir dosya "veri yok" der, oysa bölüm okunamadı.
  if (!sayfalar.length) return hata("İş bazında prim şu an okunamıyor; dosya üretilmedi.", 503);

  const ad = bolum === "hepsi" ? "Prim dökümü" : PRIM_BOLUMLERI[bolum];
  return new Response(new Uint8Array(xlsxUret(sayfalar)), {
    headers: xlsxBasliklari(`${personel.full_name} — ${ad} — ${dokum.donemYazisi} (${todayInIstanbul()}).xlsx`),
  });
}

const hata = (mesaj: string, durum: number) =>
  new Response(mesaj, { status: durum, headers: { "Content-Type": "text/plain; charset=utf-8" } });
