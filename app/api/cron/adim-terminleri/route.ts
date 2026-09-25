import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { todayInIstanbul } from "@/lib/istanbul-date";
import {
  hatirlatilacaklar,
  hatirlatmaMetni,
  type HatirlatilacakAdim,
} from "@/lib/is-adimlari";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
  İş adımlarının termin hatırlatması.

  Neden gerekliydi: ArvoOS'ta hiçbir tarih bir şey TETİKLEMİYORDU. İşin
  termini, sözleşmenin teslim tarihi, ara teslim takvimi — hiçbirini okuyan
  bir zamanlayıcı yoktu. Gecikme yalnızca ekran çizilirken hesaplanıyordu
  (ops-shared.tsx dueBadge), yani o ekrana kimse bakmazsa gecikme hiç fark
  edilmiyordu. "İşler çoğaldığında yönetim daha rahat olsun" isteğinin
  karşılığı tam olarak burası.

  Kime gidiyor: önce adımın kendi sorumlusuna, yoksa işin sorumlusuna.
  İkisi de yoksa kuruma (audience 'organization', user_id null) — yöneticiler
  sahipsiz gecikmeyi görebilmeli; sessizce atlamak, uyarının hiç olmamasıyla
  aynı kapıya çıkardı.

  Aynı uyarı iki kez gitmiyor: adımda en son hangi durum için gönderildiği
  yazılı (reminder_state) ve yalnızca değiştiğinde yeniden gidiyor
  (lib/is-adimlari.ts). Adımın tarihi ya da tamamlanması değişirse işareti
  veritabanı temizliyor, yani ertelenen iş yeniden gecikirse uyarı gelir.
*/

/** Tek koşuda en fazla kaç adım; kalanlar ertesi gece bildirilir. */
const TEK_SEFERDE = 200;

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  if (!secret || !header.startsWith("Bearer ")) return false;
  const expected = Buffer.from(secret);
  const received = Buffer.from(header.slice("Bearer ".length));
  return expected.length === received.length && timingSafeEqual(expected, received);
}

type IsSatiri = { id: string; title: string | null; customer_name: string | null; status: string; assigned_employee_id: string | null };

export async function GET(request: Request) {
  if (!authorized(request)) return new Response("Yetkisiz", { status: 401 });

  const admin = createAdminClient();
  if (!admin) return Response.json({ error: "Sunucu anahtarı tanımlı değil." }, { status: 503 });

  const bugun = todayInIstanbul();
  /*
    Üst sınır sorguda: tarihi çok ileride olan adımlar hiç okunmasın.
    Alt sınır YOK — aylardır geciken bir adım da uyarılmalı; işareti
    yazıldığı için tekrar tekrar bildirilmez.
  */
  const ustSinir = new Date(`${bugun}T00:00:00Z`);
  ustSinir.setUTCDate(ustSinir.getUTCDate() + 3);

  const { data, error } = await admin
    .from("operation_steps")
    .select("id,workflow_id,organization_id,title,due_date,is_completed,reminder_state,assigned_employee_id")
    .eq("is_completed", false)
    .not("due_date", "is", null)
    .lte("due_date", ustSinir.toISOString().slice(0, 10))
    .order("due_date", { ascending: true })
    .limit(TEK_SEFERDE);
  if (error) {
    console.error("[adim-terminleri] adımlar okunamadı", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }

  const satirlar = (data ?? []) as HatirlatilacakAdim[];
  if (satirlar.length === 0) return Response.json({ aday: 0, gonderilen: 0 });

  /*
    İşler ayrı sorguyla okunuyor, gömülü ilişkiyle değil: operation_steps →
    operation_workflows bağı bileşik yabancı anahtar üzerinden kurulu ve
    PostgREST'in onu hangi adla çözeceğine güvenmek, ancak canlıda
    görülecek bir bağımlılık olurdu.
  */
  const { data: isler, error: isHatasi } = await admin
    .from("operation_workflows")
    .select("id,title,customer_name,status,assigned_employee_id")
    .in("id", [...new Set(satirlar.map((satir) => satir.workflow_id))]);
  if (isHatasi) {
    console.error("[adim-terminleri] işler okunamadı", isHatasi.message);
    return Response.json({ error: isHatasi.message }, { status: 500 });
  }
  const isHaritasi = new Map((isler ?? []).map((is) => [is.id as string, is as IsSatiri]));

  /*
    Kapanmış işin adımı uyarı üretmez. Tamamlanan işte zaten adımların hepsi
    bitmiş oluyor ama iptal edilen ya da arşivlenen işte yarım kalmış
    adımlar durabiliyor; onlar için "gecikti" demek yanlış olurdu.
  */
  const acikIsler = satirlar.filter((satir) =>
    ["planned", "in_progress", "blocked"].includes(isHaritasi.get(satir.workflow_id)?.status ?? ""));
  const gonderilecek = hatirlatilacaklar(acikIsler, bugun);
  if (gonderilecek.length === 0) return Response.json({ aday: acikIsler.length, gonderilen: 0 });

  // Sorumlu kimliği → kullanıcı: bildirim kişiye gider, personele değil.
  const calisanIdleri = [...new Set(
    gonderilecek.flatMap(({ adim }) => [adim.assigned_employee_id, isHaritasi.get(adim.workflow_id)?.assigned_employee_id ?? null])
      .filter((deger): deger is string => Boolean(deger)),
  )];
  const kullanicilar = new Map<string, string>();
  if (calisanIdleri.length) {
    const { data: calisanlar, error: calisanHatasi } = await admin
      .from("hr_employees")
      .select("id,user_id")
      .in("id", calisanIdleri)
      .eq("employment_status", "active");
    if (calisanHatasi) console.error("[adim-terminleri] personel okunamadı", calisanHatasi.message);
    for (const calisan of calisanlar ?? []) if (calisan.user_id) kullanicilar.set(calisan.id, calisan.user_id);
  }

  let gonderilen = 0;
  for (const { adim: satir, durum } of gonderilecek) {
    const hedefCalisan = satir.assigned_employee_id ?? isHaritasi.get(satir.workflow_id)?.assigned_employee_id ?? null;
    const hedefKullanici = hedefCalisan ? kullanicilar.get(hedefCalisan) ?? null : null;

    const { error: bildirimHatasi } = await admin.from("notifications").insert({
      organization_id: satir.organization_id,
      user_id: hedefKullanici,
      audience: "organization",
      category: "operation_step_due",
      title: durum === "overdue" ? "İş adımı gecikti" : "İş adımının teslimi yaklaştı",
      message: hatirlatmaMetni(satir.title, satir.due_date as string, bugun),
      action_url: `/panel/operations/${satir.workflow_id}`,
      metadata: {
        workflow_id: satir.workflow_id,
        step_id: satir.id,
        step_title: satir.title,
        due_date: satir.due_date,
        state: durum,
      },
    });
    if (bildirimHatasi) {
      // Bir kişiye gönderilememesi kalanları da göndermemek demek olmamalı.
      console.error("[adim-terminleri] bildirim yazılamadı", satir.id, bildirimHatasi.message);
      continue;
    }

    /*
      İşaret BİLDİRİMDEN SONRA yazılıyor. Tersi olsaydı, yazma başarılı
      olup bildirim düşmediğinde adım "uyarıldı" sayılır ve gecikme sessizce
      kaybolurdu.
    */
    const { error: isaretHatasi } = await admin
      .from("operation_steps")
      .update({ reminder_state: durum, reminder_sent_at: new Date().toISOString() })
      .eq("id", satir.id);
    if (isaretHatasi) console.error("[adim-terminleri] işaret yazılamadı", satir.id, isaretHatasi.message);
    gonderilen += 1;
  }

  return Response.json({ aday: acikIsler.length, gonderilen }, { headers: { "Cache-Control": "no-store" } });
}
