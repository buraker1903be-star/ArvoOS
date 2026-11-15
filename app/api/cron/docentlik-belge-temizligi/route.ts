import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { cronRotasi, type CronKosusu } from "@/lib/cron-kaydi";
import {
  TEMIZLIK_ESIGI, TEMIZLIK_KOVASI, TEMIZLIK_TUR_SINIRI, guvenliHataMetni, silinebilirYolMu, temizlikSonucu,
  type TemizlikSayaci,
} from "@/lib/docentlik-temizlik";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
  SAHİPSİZ DOÇENTLİK BELGESİ TEMİZLİĞİ (F6 PR8). Saatlik.

  Tarayıcı dosyayı kovaya yükleyip kayıt işlemi tamamlanmadan kapanırsa
  nesne sahipsiz kalıyordu: kimse okuyamıyor (kova politikası nesneyi kayda
  bağlıyor) ama kişisel veri taşıyan PDF depoda duruyordu.

  GÜVENLİK KURALLARI (çoğu veritabanında zorlanıyor, 20261115145234):
   - en az 24 saatlik eşik (işlev daha düşüğünü kabul etmiyor); bağlama
     işlevi ise yalnızca 1 saatten YENİ nesneyi kabul ediyor — temizleyici
     ile bağlayan aynı nesneye hiçbir zaman bakmıyor;
   - aday: yalnızca docentlik-belgeleri kovası, yalnızca doçentlik yolu,
     hiçbir faaliyetin ya da ÜAK kaydının göstermediği nesne;
   - kira: aynı anda iki temizleyici koşarsa her nesneyi yalnızca biri alır
     (FOR UPDATE SKIP LOCKED + 10 dakikalık kira);
   - silmeden HEMEN önce yeniden doğrulama (onayla): kira, yaş, kayıtsızlık;
   - silme Storage API'siyle (dosya da gider); başarısızlıkta deneme sayılır,
     üstel geri çekilmeyle yeniden denenir; bekleyen başarısızlıklar cron
     kaydında görünür;
   - istekten HİÇBİR parametre okunmuyor: kullanıcının keyfi bir yolu
     sildirmesi mümkün değil; yalnızca CRON_SECRET'le çağrılır;
   - günlüğe ve cron kaydına YOL yazılmaz (lib/docentlik-temizlik).
*/

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  if (!secret || !header.startsWith("Bearer ")) return false;
  const expected = Buffer.from(secret);
  const received = Buffer.from(header.slice("Bearer ".length));
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export async function GET(request: Request) {
  if (!authorized(request)) return new Response("Yetkisiz", { status: 401 });
  return cronRotasi("/api/cron/docentlik-belge-temizligi", kosu);
}

async function kosu(): Promise<CronKosusu> {
  const admin = createAdminClient();
  if (!admin) return {
    yanit: Response.json({ error: "Sunucu anahtarı tanımlı değil." }, { status: 503 }),
    sonuc: "hata", ayrinti: { hata: "Sunucu anahtarı tanımlı değil." },
  };

  const { data: adaylar, error: alHatasi } = await admin.rpc("docentlik_temizlik_al", { p_esik: TEMIZLIK_ESIGI, p_sinir: TEMIZLIK_TUR_SINIRI });
  if (alHatasi) {
    const hata = guvenliHataMetni(alHatasi);
    return { yanit: Response.json({ error: hata }, { status: 500 }), sonuc: "hata", ayrinti: { hata } };
  }

  const sayac: TemizlikSayaci = { aday: (adaylar ?? []).length, silinen: 0, atlanan: 0, basarisiz: 0 };
  for (const aday of (adaylar ?? []) as { nesne_id: string; ad: string; kira: string }[]) {
    const sonucYaz = (basarili: boolean, hata: string | null) =>
      admin.rpc("docentlik_temizlik_sonuc", { p_nesne: aday.nesne_id, p_kira: aday.kira, p_basarili: basarili, p_hata: hata });
    // Silmeden hemen önce: kira hâlâ bende mi, nesne hâlâ sahipsiz ve 24 saatten eski mi?
    const { data: onay, error: onayHatasi } = await admin.rpc("docentlik_temizlik_onayla", { p_nesne: aday.nesne_id, p_kira: aday.kira });
    if (onayHatasi) {
      sayac.basarisiz++;
      await sonucYaz(false, guvenliHataMetni(onayHatasi));
      continue;
    }
    if (!onay) { sayac.atlanan++; continue; } // artık sahipli, yok ya da kira düştü
    if (!silinebilirYolMu(onay) || onay !== aday.ad) {
      // Olmaması gereken durum: biçimsiz ad asla silinmez, kira bırakılır.
      sayac.basarisiz++;
      await sonucYaz(false, "beklenmeyen nesne adı; silinmedi");
      continue;
    }
    const { data: silinen, error: silmeHatasi } = await admin.storage.from(TEMIZLIK_KOVASI).remove([onay]);
    if (silmeHatasi || !silinen?.length) {
      sayac.basarisiz++;
      const hata = silmeHatasi ? guvenliHataMetni(silmeHatasi) : "nesne silinemedi";
      console.error("[docentlik-temizlik] silinemedi", { nesne: aday.nesne_id, hata });
      await sonucYaz(false, hata);
      continue;
    }
    sayac.silinen++;
    await sonucYaz(true, null);
  }

  const { data: durum } = await admin.rpc("docentlik_temizlik_durumu");
  const d = ((durum ?? []) as { bekleyen_hatali: number | string; en_cok_deneme: number }[])[0];
  const ayrinti = { ...sayac, bekleyen_hatali: Number(d?.bekleyen_hatali ?? 0), en_cok_deneme: Number(d?.en_cok_deneme ?? 0) };
  return { yanit: Response.json(ayrinti), sonuc: temizlikSonucu(sayac), ayrinti };
}
