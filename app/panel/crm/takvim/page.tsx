import { formatPhone } from "@/lib/format-phone";
import { formatPersonName } from "@/lib/format-name";
import { todayInIstanbul } from "@/lib/istanbul-date";
import { getPanelContext } from "@/lib/panel-context";
import { PanelDrawer } from "../../components/panel-drawer";
import { AppointmentForm } from "./appointment-form";
import { updateAppointmentStatus, deleteAppointment } from "./actions";
import { OtomatikSecim } from "../otomatik-secim";
import { AyGezinme, GunBolumu, TakvimIzgarasi, ayAnahtari, ayBasi, gunAnahtari, gunTarihi, type TakvimMaddesi } from "../takvim-izgara";
import "../kayit-detay/kayit-detay.css";
import "../takvim.css";

/*
  SATIŞ TAKVİMİ (2026-10, panel kalitesi). Başlık ve araç satırı diğer
  sayfalarla aynı; solda ay ızgarası, sağda seçili gün ve önümüzdeki 14
  gün. Eskiden "Aylık / Liste" diye iki ayrı görünüm vardı (randevu
  sayısına göre biri seçiliyordu) ve seçili gün paneli ızgaranın altında,
  ekranın dışında kalıyordu; artık ikisi aynı anda görünüyor. Eski
  ?view= bağlantıları sorunsuz açılır (değer yok sayılır).
*/

const DURUM_ADLARI: Record<string, string> = { planned: "Planlandı", done: "Tamamlandı", cancelled: "İptal" };
const DURUM_TONU: Record<string, string> = { planned: "info", done: "success", cancelled: "neutral" };

type Employee = { id: string; full_name: string; job_title: string | null };
type Appointment = {
  id: string;
  employee_id: string;
  title: string;
  contact_name: string | null;
  contact_phone: string | null;
  note: string | null;
  starts_at: string;
  ends_at: string | null;
  status: string;
};

const saat = (iso: string) => new Date(iso).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });

function RandevuSatiri({ randevu, temsilci }: { randevu: Appointment; temsilci?: string }) {
  return (
    <li>
      <div className={`tk-satir is-${randevu.status}`}>
        <span className="tk-saat">{saat(randevu.starts_at)}{randevu.ends_at ? <small>{saat(randevu.ends_at)}</small> : null}</span>
        <span className="tk-govde">
          <b>{randevu.title}</b>
          <small>{[randevu.contact_name, formatPhone(randevu.contact_phone), temsilci].filter(Boolean).join(" · ") || "Kişi belirtilmedi"}</small>
          {randevu.note ? <small className="tk-not">{randevu.note}</small> : null}
          <span className="tk-eylem">
            {randevu.status !== "done" ? (
              <form action={updateAppointmentStatus}><input type="hidden" name="appointment_id" value={randevu.id} /><input type="hidden" name="status" value="done" /><button type="submit">Tamamlandı</button></form>
            ) : null}
            {randevu.status === "planned" ? (
              <form action={updateAppointmentStatus}><input type="hidden" name="appointment_id" value={randevu.id} /><input type="hidden" name="status" value="cancelled" /><button type="submit">İptal</button></form>
            ) : null}
            <form action={deleteAppointment}><input type="hidden" name="appointment_id" value={randevu.id} /><button className="is-danger" type="submit">Sil</button></form>
          </span>
        </span>
        <span className="status-pill" data-tone={DURUM_TONU[randevu.status] ?? "neutral"}>{DURUM_ADLARI[randevu.status] ?? randevu.status}</span>
      </div>
    </li>
  );
}

export default async function CrmCalendarPage({ searchParams }: { searchParams: Promise<{ view?: string; ay?: string; tarih?: string; calisan?: string }> }) {
  const params = await searchParams;
  const { supabase, membership, userId, modules, izin } = await getPanelContext();
  if (!modules.some((module) => module.code === "crm")) throw new Error("CRM modülüne erişiminiz yok.");
  const isManager = izin("crm.takvim.tum");

  // Bugün Türkiye takvimiyle: sunucu UTC'de, gece 00–03 arası bir önceki günü verirdi.
  const bugun = todayInIstanbul();
  const ay = ayBasi(params.ay, bugun);
  const secili = gunTarihi(params.tarih, bugun);
  const seciliGun = gunAnahtari(secili);

  const { data: ownEmployee } = await supabase.from("hr_employees").select("id,full_name").eq("organization_id", membership.organization_id).eq("user_id", userId).maybeSingle();
  const employeesPromise = isManager
    ? supabase.from("hr_employees").select("id,full_name,job_title").eq("organization_id", membership.organization_id).eq("employment_status", "active").eq("can_receive_sales_requests", true).order("full_name")
    : Promise.resolve({ data: [] as Employee[], error: null });

  // Ay ızgarasının görünen aralığı ve seçili günden 14 gün: ikisinin birleşimi.
  const ayAralikBas = new Date(ay.getFullYear(), ay.getMonth() - 1, 25);
  const ayAralikSon = new Date(ay.getFullYear(), ay.getMonth() + 2, 5);
  const listeSon = new Date(secili.getFullYear(), secili.getMonth(), secili.getDate() + 15);
  const aralikBas = ayAralikBas < secili ? ayAralikBas : secili;
  const aralikSon = ayAralikSon > listeSon ? ayAralikSon : listeSon;

  let query = supabase.from("crm_appointments").select("id,employee_id,title,contact_name,contact_phone,note,starts_at,ends_at,status")
    .eq("organization_id", membership.organization_id)
    .gte("starts_at", aralikBas.toISOString()).lt("starts_at", aralikSon.toISOString())
    .order("starts_at", { ascending: true });
  if (isManager && params.calisan) query = query.eq("employee_id", params.calisan);

  const [{ data: appointmentData, error: appointmentError }, { data: employeeData }] = await Promise.all([query, employeesPromise]);
  if (appointmentError) throw new Error("Randevular okunamadı: " + appointmentError.message);
  const randevular = (appointmentData ?? []) as Appointment[];
  const employees = (employeeData ?? []) as Employee[];
  const temsilciAdi = new Map(employees.map((e) => [e.id, formatPersonName(e.full_name)]));
  if (ownEmployee) temsilciAdi.set(ownEmployee.id, formatPersonName(ownEmployee.full_name));

  const gunune = new Map<string, Appointment[]>();
  for (const r of randevular) {
    const anahtar = gunAnahtari(new Date(r.starts_at));
    gunune.set(anahtar, [...(gunune.get(anahtar) ?? []), r]);
  }
  const izgaraMaddeleri = new Map<string, TakvimMaddesi[]>(
    [...gunune.entries()].map(([gun, liste]) => [gun, liste.map((r) => ({ anahtar: r.id, etiket: `${saat(r.starts_at)} ${r.title}`, ton: r.status === "cancelled" || r.status === "done" ? "done" : undefined }))]),
  );
  const buAy = ayAnahtari(ay);
  const buAyRandevu = randevular.filter((r) => gunAnahtari(new Date(r.starts_at)).startsWith(buAy)).length;
  const bugunRandevu = (gunune.get(bugun) ?? []).filter((r) => r.status === "planned").length;

  const adres = (ek: Record<string, string>) => {
    const q = new URLSearchParams({ ay: buAy, tarih: seciliGun, ...(params.calisan ? { calisan: params.calisan } : {}), ...ek });
    for (const [k, v] of [...q.entries()]) if (!v) q.delete(k);
    return `/panel/crm/takvim?${q.toString()}`;
  };
  const oncekiAy = ayAnahtari(new Date(ay.getFullYear(), ay.getMonth() - 1, 1));
  const sonrakiAy = ayAnahtari(new Date(ay.getFullYear(), ay.getMonth() + 1, 1));

  // Seçili günden sonraki 14 gün: yalnızca randevusu olan günler.
  const yaklasan: { gun: string; tarih: Date; liste: Appointment[] }[] = [];
  for (let i = 1; i <= 14; i++) {
    const tarih = new Date(secili.getFullYear(), secili.getMonth(), secili.getDate() + i);
    const gun = gunAnahtari(tarih);
    const liste = gunune.get(gun) ?? [];
    if (liste.length) yaklasan.push({ gun, tarih, liste });
  }
  const gunBasligi = (t: Date) => t.toLocaleDateString("tr-TR", { day: "numeric", month: "long", weekday: "long" });

  return (
    <main className="talep tk-sayfa">
      <header className="talep-bas">
        <div className="talep-bas-metin">
          <small className="panel-kicker">CRM</small>
          <h1>Satış takvimi</h1>
        </div>
        <div className="talep-bas-eylem">
          <PanelDrawer triggerLabel="Yeni randevu" kicker="YENİ KAYIT" title="Yeni randevu" description="Randevu bilgilerini girin.">
            <AppointmentForm isManager={isManager} employees={employees} defaultDate={seciliGun} returnTo={adres({})} />
          </PanelDrawer>
        </div>
      </header>

      <section className="kayit-serit talep-serit tk-arac" aria-label="Takvim araçları">
        <AyGezinme ay={ay} oncekiHref={adres({ ay: oncekiAy })} sonrakiHref={adres({ ay: sonrakiAy })} bugunHref={adres({ ay: bugun.slice(0, 7), tarih: bugun })} />
        <div className="tk-sag">
          <dl>
            <div><dt>Bu ay</dt><dd>{buAyRandevu} randevu</dd></div>
            <div><dt>Bugün</dt><dd className={bugunRandevu ? "cari-arti" : undefined}>{bugunRandevu} planlı</dd></div>
          </dl>
          {/* Yönetici bütün ekibi ya da bir temsilciyi görür; seçince uygulanır. */}
          {isManager && employees.length ? (
            <form method="get" action="/panel/crm/takvim">
              <input type="hidden" name="ay" value={buAy} />
              <input type="hidden" name="tarih" value={seciliGun} />
              <OtomatikSecim name="calisan" defaultValue={params.calisan ?? ""} className="talep-temsilci-sec" label="Temsilci">
                <option value="">Tüm ekip</option>
                {employees.map((e) => <option key={e.id} value={e.id}>{formatPersonName(e.full_name)}</option>)}
              </OtomatikSecim>
            </form>
          ) : null}
        </div>
      </section>

      <div className="tk-izgara-alan">
        <section className="panel-card tk-takvim-kart" aria-label="Aylık takvim">
          <TakvimIzgarasi ay={ay} maddeler={izgaraMaddeleri} seciliGun={seciliGun} bugun={bugun} gunHref={(gun) => adres({ tarih: gun })} />
        </section>

        <aside className="panel-card tk-panel" aria-label="Seçili gün ve yaklaşan randevular">
          <GunBolumu baslik={gunBasligi(secili)} rozet={seciliGun === bugun ? "Bugün" : undefined} bos="Bu gün için randevu yok.">
            {(gunune.get(seciliGun) ?? []).length ? (
              <ul className="tk-liste">
                {(gunune.get(seciliGun) ?? []).map((r) => <RandevuSatiri key={r.id} randevu={r} temsilci={isManager ? temsilciAdi.get(r.employee_id) : undefined} />)}
              </ul>
            ) : undefined}
          </GunBolumu>
          <GunBolumu baslik="Önümüzdeki 14 gün" bos="Yaklaşan randevu yok.">
            {yaklasan.length ? (
              <>
                {yaklasan.map(({ gun, tarih, liste }) => (
                  <div key={gun}>
                    <h3 className="tk-alt">{gunBasligi(tarih)}</h3>
                    <ul className="tk-liste">
                      {liste.map((r) => <RandevuSatiri key={r.id} randevu={r} temsilci={isManager ? temsilciAdi.get(r.employee_id) : undefined} />)}
                    </ul>
                  </div>
                ))}
              </>
            ) : undefined}
          </GunBolumu>
        </aside>
      </div>
    </main>
  );
}
