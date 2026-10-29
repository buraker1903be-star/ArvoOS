import Link from "next/link";
import type { Metadata } from "next";
import { getPanelContext } from "@/lib/panel-context";
import { modulGerek } from "@/lib/modul-kapisi";
import { departmanTipi } from "@/lib/departman-kurali";
import { PanelDrawer } from "../../components/panel-drawer";
import { ConfirmDeleteButton } from "../../accounts/confirm-delete-button";
import { createDepartment, deleteDepartment, updateDepartment } from "../actions";
import "../../components/kayit-formu.css";
import "../../crm/kayit-detay/kayit-detay.css";
import "../hr.css";
import "./departmanlar.css";

export const metadata: Metadata = { title: "Departmanlar" };

/*
  DEPARTMANLAR (29.10.2026, kurum sahibinin isteği). Eskiden departman
  yalnızca personel listesinin "⋯" menüsünden AÇILABİLİYORDU: adını
  düzeltmek, kodunu değiştirmek, kullanılmayanı kapatmak ya da silmek
  için hiçbir yer yoktu ve kaç kişinin nerede olduğu ancak listeyi
  departmana süzerek görülüyordu.

  Her departman bir kart: tür (adın taşıdığı yetki anlamı, lib/
  departman-kurali), aktif/izinli sayısı, baş harfleriyle ilk kişiler,
  personele geçiş, düzenle ve — içi boşsa — sil. Departmansız personel
  ayrı kartta, çünkü onlar müdür profillerinin dışında kalıyor.

  Okuma herkese açık (RLS: kurum üyesi okur); düzenleme hr.personel.yonet,
  işlem tarafında da (actions.ts → hrContext) soruluyor.
*/

type Departman = { id: string; name: string; code: string | null; is_active: boolean };
type Personel = { id: string; full_name: string; department_id: string | null; employment_status: string };

const CALISAN = ["active", "on_leave"];
const basHarf = (ad: string) => ad.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toLocaleUpperCase("tr-TR")).join("") || "?";

export default async function DepartmanlarSayfasi() {
  const { supabase, membership, modules, izin } = await getPanelContext();
  modulGerek(modules, "hr");
  const duzenler = izin("hr.personel.yonet");
  const org = membership.organization_id;

  const [{ data: dVeri, error: dHata }, { data: pVeri, error: pHata }] = await Promise.all([
    supabase.from("hr_departments").select("id,name,code,is_active").eq("organization_id", org).order("name"),
    supabase.from("hr_employees").select("id,full_name,department_id,employment_status").eq("organization_id", org).order("full_name"),
  ]);
  if (dHata) throw new Error("Departmanlar okunamadı: " + dHata.message);
  if (pHata) throw new Error("Personel okunamadı: " + pHata.message);
  const departmanlar = (dVeri ?? []) as Departman[];
  const personel = (pVeri ?? []) as Personel[];
  const bilinen = new Set(departmanlar.map((d) => d.id));
  const uyeler = (id: string | null) => personel.filter((p) => (id ? p.department_id === id : !p.department_id || !bilinen.has(p.department_id)));
  const calisanlar = personel.filter((p) => CALISAN.includes(p.employment_status));
  const departmansiz = uyeler(null).filter((p) => CALISAN.includes(p.employment_status));
  const aktifDepartman = departmanlar.filter((d) => d.is_active).length;

  const formu = (d?: Departman) => (
    <form className="panel-form kayit-formu pf-form" action={d ? updateDepartment : createDepartment}>
      {d ? <input type="hidden" name="department_id" value={d.id} /> : null}
      <label className="wide"><span>Departman adı<b className="req" aria-hidden="true">*</b></span><input name="name" required minLength={2} maxLength={120} defaultValue={d?.name ?? ""} placeholder="Örn. Satış" /></label>
      <label className="wide">Kısa kod<input name="code" maxLength={30} defaultValue={d?.code ?? ""} placeholder="Örn. SAT" /></label>
      {d ? <>
        <p className="wide pf-etiket">Durum</p>
        <div className="wide pf-secenek dp-iki" role="radiogroup" aria-label="Durum">
          <label><input type="radio" name="is_active" value="1" defaultChecked={d.is_active} /><span>Aktif</span></label>
          <label><input type="radio" name="is_active" value="0" defaultChecked={!d.is_active} /><span>Pasif</span></label>
        </div>
      </> : null}
      <p className="wide kayit-formu-not">Adı yetki taşır: “Satış” ya da “Operasyon” geçen departmana o alanın müdür profili uygulanabilir; “Yönetim” ile başlayan departmandaki aktif personel Kurum Sahibi yetkisiyle çalışır.{d ? " Pasif departman yeni personel formunda listelenmez; içindeki personel yerinde kalır." : ""}</p>
      <div className="wide panel-form-actions kayit-formu-eylem">
        <p><b className="req" aria-hidden="true">*</b> işaretli alanlar zorunlu.</p>
        <button className="panel-primary" type="submit">{d ? "Değişiklikleri kaydet" : "Departmanı kaydet"}</button>
      </div>
    </form>
  );

  const kisiler = (liste: Personel[]) => {
    const gorunen = liste.slice(0, 5);
    return (
      <span className="dp-kisiler" aria-label={`${liste.length} kişi`}>
        {gorunen.map((p) => <span key={p.id} className="dp-avatar" title={p.full_name}>{basHarf(p.full_name)}</span>)}
        {liste.length > gorunen.length ? <span className="dp-avatar dp-fazla">+{liste.length - gorunen.length}</span> : null}
      </span>
    );
  };

  return (
    <main className="talep cari liste-sayfa dp">
      <header className="talep-bas">
        <div className="talep-bas-metin">
          <small className="panel-kicker">İNSAN KAYNAKLARI</small>
          <h1>Departmanlar</h1>
          <p className="ek-alt">{aktifDepartman} aktif departman · {calisanlar.length} çalışan personel{departmansiz.length ? ` · ${departmansiz.length} departmansız` : ""}</p>
        </div>
        <div className="talep-bas-eylem">
          <Link className="panel-secondary" href="/panel/hr">Personel listesi</Link>
          {duzenler ? <PanelDrawer triggerLabel="Yeni departman" kicker="ORGANİZASYON" title="Yeni departman" description="Ad ve isteğe bağlı kısa kod. Personel, personel formundan departmana atanır.">{formu()}</PanelDrawer> : null}
        </div>
      </header>

      <nav className="kayit-serit talep-serit" aria-label="Departman özeti">
        <dl>
          <div><dt>Departman</dt><dd>{departmanlar.length}</dd></div>
          <div><dt>Aktif</dt><dd className="cari-arti">{aktifDepartman}</dd></div>
          <div><dt>Pasif</dt><dd>{departmanlar.length - aktifDepartman}</dd></div>
          <div><dt>Çalışan personel</dt><dd>{calisanlar.length}</dd></div>
          <div><dt>Departmansız</dt><dd className={departmansiz.length ? "talep-uyari" : undefined}>{departmansiz.length}</dd></div>
        </dl>
      </nav>

      {departmanlar.length ? (
        <section className="dp-izgara" aria-label="Departmanlar">
          {departmanlar.map((d) => {
            const hepsi = uyeler(d.id);
            const aktif = hepsi.filter((p) => p.employment_status === "active");
            const izinli = hepsi.filter((p) => p.employment_status === "on_leave");
            const ayrilan = hepsi.length - aktif.length - izinli.length;
            const tip = departmanTipi(d.name);
            return (
              <article key={d.id} className="panel-card dp-kart" data-tur={tip.tur} data-pasif={d.is_active ? undefined : "evet"}>
                <header className="dp-kart-bas">
                  <span className="dp-simge" aria-hidden="true">{d.code ? d.code.slice(0, 3).toLocaleUpperCase("tr-TR") : basHarf(d.name)}</span>
                  <div>
                    <h2>{d.name}</h2>
                    <small>{d.code ? `Kod ${d.code} · ` : ""}{tip.etiket}</small>
                  </div>
                  <span className="status-pill" data-tone={d.is_active ? "success" : "neutral"}>{d.is_active ? "Aktif" : "Pasif"}</span>
                </header>
                <p className="dp-tip">{tip.aciklama}</p>
                <dl className="dp-sayilar">
                  <div><dt>Aktif</dt><dd>{aktif.length}</dd></div>
                  <div><dt>İzinli</dt><dd>{izinli.length}</dd></div>
                  <div><dt title="Ayrılan ya da pasif">Ayrılan</dt><dd>{ayrilan}</dd></div>
                </dl>
                <div className="dp-alt">
                  {hepsi.length ? kisiler([...aktif, ...izinli]) : <span className="dp-bos">Henüz personel yok</span>}
                  <Link className="pu-tumu" href={`/panel/hr?departman=${d.id}`}>Personeli gör →</Link>
                </div>
                {duzenler ? (
                  <footer className="dp-eylem">
                    <PanelDrawer triggerLabel="Düzenle" triggerClassName="panel-secondary" kicker="ORGANİZASYON" title={`${d.name} departmanını düzenle`} description="Ad, kod ve durum.">{formu(d)}</PanelDrawer>
                    {hepsi.length ? null : (
                      <form action={deleteDepartment}>
                        <input type="hidden" name="department_id" value={d.id} />
                        <ConfirmDeleteButton label="Sil" confirmMessage={`${d.name} departmanını silmek istediğinize emin misiniz?`} />
                      </form>
                    )}
                  </footer>
                ) : null}
              </article>
            );
          })}
          {departmansiz.length ? (
            <article className="panel-card dp-kart dp-departmansiz">
              <header className="dp-kart-bas">
                <span className="dp-simge" aria-hidden="true">?</span>
                <div><h2>Departmansız</h2><small>departmana atanmamış çalışan personel</small></div>
                <span className="status-pill" data-tone="warning">{departmansiz.length}</span>
              </header>
              <p className="dp-tip">Bu kişilere müdür profilleri uygulanamaz ve departman raporlarında görünmezler. Personel formundan departman seçin.</p>
              <div className="dp-alt">
                {kisiler(departmansiz)}
                <Link className="pu-tumu" href="/panel/hr">Personel listesi →</Link>
              </div>
            </article>
          ) : null}
        </section>
      ) : (
        <div className="crm-empty-state talep-bos-kutu ek-bos">
          <span className="ek-bos-simge" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>
          </span>
          <h2>Henüz departman yok</h2>
          <p>{duzenler ? "“Yeni departman” ile ilk departmanı açın; örneğin Satış, Operasyon, Yönetim." : "Yöneticiniz departman açtıkça burada görünecek."}</p>
        </div>
      )}
    </main>
  );
}
