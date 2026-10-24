import { getPanelContext } from "@/lib/panel-context";
import { canSeeFinanceReports } from "../../finance-navigation";
import { donemCoz, donemEtiketi } from "@/lib/rapor-donemi";
import { raporBul } from "@/lib/rapor-tanimlari";
import { satisSayfalari } from "@/lib/rapor-satis";
import { tahsilatSayfalari } from "@/lib/rapor-tahsilat";
import { teklifSayfalari } from "@/lib/rapor-teklif";
import { finansSayfalari } from "@/lib/rapor-finans";
import { crmSayfalari } from "@/lib/rapor-crm";
import { operasyonSayfalari } from "@/lib/rapor-operasyon";
import { personelSayfalari } from "@/lib/rapor-personel";
import { xlsxBasliklari, xlsxUret, type Sayfa } from "@/lib/xlsx";
import { satisVerisi } from "../satis-raporu";
import { tahsilatVerisi } from "../tahsilat-raporu";
import { teklifVerisi } from "../teklif-raporu";
import { finansVerisi } from "../finans-raporu";
import { crmVerisi } from "../crm-raporu";
import { operasyonVerisi } from "../operasyon-raporu";
import { personelVerisi } from "../personel-raporu";
import { todayInIstanbul } from "@/lib/istanbul-date";
import { organizationBrandName } from "@/lib/kurum-adi";

/*
  RAPORU EXCEL OLARAK İNDİRME (2026-10-24).

  Dosya, ekranı çizen AYNI işlevden üretiliyor (`satisVerisi` →
  `satisSayfalari`). İkinci bir sorgu yazmak, ekranda 150.000 ₺
  yazarken dosyada başka bir sayı olmasının en kısa yoluydu ve
  kullanıcı hangisinin doğru olduğunu bilemezdi.

  KAPI ÜÇ PARÇALI ve üçü de burada tekrar soruluyor — sayfada
  sorulmuş olması bu rotayı korumaz; rota kendi başına çağrılabilir
  bir adres (AGENTS.md "Yetki üç yerdedir, üçü de gerekir"):
   1. Raporlama modülü kurumda açık mı,
   2. kullanıcı O RAPORU görebiliyor mu (`rapor.satis` gibi),
   3. dışa aktarma yetkisi var mı (`rapor.disa_aktar`) — raporu
      ekranda görmek ile kurumun verisini dosya olarak dışarı
      çıkarmak aynı şey değil.

  Okuma oturum istemcisiyle, yani RLS ile: `service_role` kullanmak
  kullanıcının göremediği satırları dosyaya yazmak olurdu.

  Yetkisizlikte 403 dönülüyor, sayfaya yönlendirilmiyor: tarayıcı bunu
  bir indirme olarak bekliyor ve yönlendirilen HTML'i "bozuk dosya"
  diye kaydederdi.
*/
export const dynamic = "force-dynamic";

/*
  DOSYA ADINDA MARKA VAR. İki markanın aynı raporu aynı klasöre
  inince dosya adları birebir aynı oluyordu ve tarayıcı ikincisine
  "(1)" ekliyordu — hangisinin hangi marka olduğu dosyadan
  anlaşılmıyordu. Ad MARKA, ticari unvan değil: bu bir yönetim
  evrakı (lib/kurum-adi).
*/
const dosyaAdi = (marka: string, kod: string, baslik: string, donemEtiket: string) =>
  `${marka} — ${kod} ${baslik} — ${donemEtiket} (${todayInIstanbul()}).xlsx`;

export async function GET(istek: Request) {
  const adres = new URL(istek.url);
  const { supabase, membership, organization, modules, yetkiler, izin } = await getPanelContext();

  if (!modules.some((m) => m.code === "reporting")) {
    return yanitHata("Raporlama modülü bu kurumda kapalı.", 403);
  }
  if (!canSeeFinanceReports({ modules, yetkiler })) {
    return yanitHata("Raporları görme yetkiniz yok.", 403);
  }

  const rapor = raporBul(adres.searchParams.get("rapor"));
  if (!rapor) return yanitHata("Böyle bir rapor yok.", 404);
  if (!izin(rapor.yetki)) return yanitHata(`${rapor.baslik} raporunu görme yetkiniz yok.`, 403);
  if (!izin("rapor.disa_aktar")) return yanitHata("Rapor dışa aktarma yetkiniz yok.", 403);

  const donem = donemCoz(
    adres.searchParams.get("aralik") ?? undefined,
    adres.searchParams.get("baslangic") ?? undefined,
    adres.searchParams.get("bitis") ?? undefined,
  );
  const donemEtiket = donemEtiketi(donem);
  const girdi = { supabase, organizationId: membership.organization_id, donem };

  let sayfalar: Sayfa[];
  switch (rapor.anahtar) {
    case "satis":
      sayfalar = satisSayfalari({ model: await satisVerisi(girdi), donemEtiket });
      break;
    case "tahsilat":
      sayfalar = tahsilatSayfalari({ model: await tahsilatVerisi(girdi), donemEtiket });
      break;
    case "teklif":
      sayfalar = teklifSayfalari({ model: await teklifVerisi(girdi), donemEtiket });
      break;
    case "finans":
      sayfalar = finansSayfalari({ model: await finansVerisi(girdi), donemEtiket });
      break;
    case "crm":
      sayfalar = crmSayfalari({ model: await crmVerisi(girdi), donemEtiket });
      break;
    case "operasyon":
      sayfalar = operasyonSayfalari({ model: await operasyonVerisi(girdi), donemEtiket });
      break;
    case "personel":
      sayfalar = personelSayfalari({ model: await personelVerisi(girdi), donemEtiket });
      break;
    default:
      /*
        ŞU AN ULAŞILMIYOR — sekiz raporun hepsi bağlı. Dal bilerek
        duruyor: dokuzuncu rapor `lib/rapor-tanimlari.ts`'e eklendiğinde
        burada bir dosya üretilmeden önce bu yanıt dönecek.

        BOŞ DOSYA ÜRETİLMİYOR: başlıkları olan ama satırı olmayan bir
        Excel, kullanıcıya "bu dönemde veri yok" der — oysa olan şey
        raporun henüz yazılmamış olması.
      */
      return yanitHata(`${rapor.baslik} raporu için dışa aktarma henüz hazır değil.`, 501);
  }

  return new Response(new Uint8Array(xlsxUret(sayfalar)), {
    headers: xlsxBasliklari(dosyaAdi(
      organizationBrandName({
        slug: organization.slug,
        displayName: organization.display_name,
        legalName: organization.name,
      }),
      rapor.kod, rapor.baslik, donemEtiket,
    )),
  });
}

/** Hata düz metin: tarayıcı dosya bekliyor, HTML sayfası beklemiyor. */
const yanitHata = (mesaj: string, durum: number) =>
  new Response(mesaj, { status: durum, headers: { "Content-Type": "text/plain; charset=utf-8" } });
