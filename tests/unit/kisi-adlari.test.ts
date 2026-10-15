import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { kisiAdlari } from "@/lib/kisi-adlari";

/*
  "ŞUNU KİM YAPTI" SORUSUNUN ADI (lib/kisi-adlari).

  Ad yalnızca hr_employees'ten aranıyordu ve personel kaydı olmayan
  herkes — kurum sahibi dahil — "Ekip üyesi" diye yazılıyordu. Yeni
  kurulan bir kurumda sahibin personel kaydı yok, yani kurumun ilk
  haftasında işi yürüten kişinin adı hiçbir yerde yazmıyordu.
*/

const KURUM = "11111111-2222-4333-8444-555555555555";
const SAHIP = "aaaaaaaa-0000-4000-8000-000000000001";
const PERSONEL = "bbbbbbbb-0000-4000-8000-000000000002";

type Satir = Record<string, unknown>;
/** Zincirin (.select/.eq/.in) sonunda beklenen sahte istemci. */
function sahteSupabase(tablolar: Record<string, { data: Satir[] | null; error?: { message: string } | null }>) {
  const sorgulanan: string[] = [];
  const istemci = {
    from(tablo: string) {
      sorgulanan.push(tablo);
      const sonuc = tablolar[tablo] ?? { data: [], error: null };
      const zincir = {
        select: () => zincir,
        eq: () => zincir,
        in: () => zincir,
        then: (coz: (deger: unknown) => unknown) => Promise.resolve(coz({ data: sonuc.data, error: sonuc.error ?? null })),
      };
      return zincir;
    },
  };
  return { istemci: istemci as unknown as SupabaseClient, sorgulanan };
}

test("personel kaydı olmayan kullanıcının adı profiles'tan geliyor", async () => {
  const { istemci } = sahteSupabase({
    profiles: { data: [{ id: SAHIP, full_name: "burak erdoğan" }] },
    hr_employees: { data: [] },
  });
  const adlar = await kisiAdlari(istemci, KURUM, [SAHIP]);
  // formatPersonName de uygulanıyor: kayıtlar farklı yazımlarla giriliyor.
  assert.equal(adlar.get(SAHIP), "Burak Erdoğan");
});

test("personel kaydındaki ad profiles'takini eziyor", async () => {
  const { istemci } = sahteSupabase({
    profiles: { data: [{ id: PERSONEL, full_name: "Ahmet Y." }] },
    hr_employees: { data: [{ user_id: PERSONEL, full_name: "Ahmet Yılmaz" }] },
  });
  const adlar = await kisiAdlari(istemci, KURUM, [PERSONEL]);
  assert.equal(adlar.get(PERSONEL), "Ahmet Yılmaz", "kurumun kendi kayıtlarındaki yazım esas");
});

test("boş ve yinelenen kimlikler sorgu açtırmıyor", async () => {
  const { istemci, sorgulanan } = sahteSupabase({ profiles: { data: [] }, hr_employees: { data: [] } });
  const adlar = await kisiAdlari(istemci, KURUM, [null, undefined, ""]);
  assert.equal(adlar.size, 0);
  assert.deepEqual(sorgulanan, [], "kimlik yoksa veritabanına hiç gidilmiyor");
});

test("okunamayan ad listesi çökmüyor, boş dönüyor (çağıran yedeğini yazar)", async () => {
  const { istemci } = sahteSupabase({
    profiles: { data: null, error: { message: "permission denied" } },
    hr_employees: { data: null, error: { message: "permission denied" } },
  });
  const adlar = await kisiAdlari(istemci, KURUM, [SAHIP]);
  assert.equal(adlar.size, 0);
  assert.equal(adlar.get(SAHIP), undefined);
});
