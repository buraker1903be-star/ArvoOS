import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getPanelContext } from "@/lib/panel-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMemberDirectory } from "@/lib/member-directory";
import { kimlikMi } from "@/lib/kimlik";
import { productName } from "@/lib/products";
import { panelSayfaAdi } from "@/lib/panel-sayfa-adi";
import { ikincil } from "../../konsol-oku";
import { KBos, KKart, KListe, KNot, KOge } from "../../konsol-ui";
import { basHarfleri, sayi, tarih, tarihSaat } from "../../bicim";
import { relativeTime } from "../../../crm/last-contact";
import { MobilSatir } from "../../../crm/table-cells";
import { SatirTiklama } from "../../../crm/satir-tiklama";
import { kisilereTopla, kisininRolu, pasiflikSebebi, rolAdi } from "../kisiler";
import "../../platform.css";
import "../../konsol-ui.css";
import "../../../hr/hr.css";
import "../../../crm/crm.css";
import "../../../crm/kayit-detay/kayit-detay.css";
import "../../finans.css";

export const metadata: Metadata = { title: "Kullanıcı", robots: { index: false, follow: false } };

/*
  KİŞİ SAYFASI (29.10.2026). Kullanıcılar listesindeki satırın açılacak
  bir ekranı yoktu: kurucu bir kişinin hangi kurumda hangi ürüne neden
  giremediğini, en son ne zaman girdiğini ya da bekleyen bir daveti olup
  olmadığını görmek için müşteri kartlarını tek tek açıyordu.

  Kişi listedekiyle AYNI kurala göre birleşiyor (../kisiler.ts: e-posta
  ile, üç ürün birlikte); adres kişinin ArvoOS kimliği. Liste de sayfa da
  rehberin tamamını okuyor — kişiyi tek satırla bulmanın yolu yok,
  çünkü ArvoLab satırlarının kimliği başka bir veritabanında.

  Erişim burada DEĞİŞTİRİLMİYOR: anahtar müşteri kartının Kullanıcılar
  sekmesinde (son sahip kuralı ve onay penceresiyle birlikte). İkinci bir
  anahtar o kuralların ikinci bir kopyası olurdu; satır oraya götürüyor.

  Oturumlar yalnızca ArvoOS panelinin kaydı (user_session_logs): ArvoLab
  ve ArvoCal kendi veritabanlarında, oradaki girişler burada yok — ekran
  bunu yazıyor.
*/
const OTURUM = 10;
const NEDEN: Record<string, string> = { manual: "Çıkış yaptı", timeout: "Zaman aşımı", workspace_switch: "Çalışma alanı değişti" };
const ARVOOS_HESABI = new Set(["arvoos", "arc", "randevu"]);

type Oturum = { id: string; organization_id: string; login_at: string; last_seen_at: string; logout_at: string | null; logout_reason: string | null; current_path: string | null };
type Davet = { id: string; organization_id: string; role: string | null; status: string; expires_at: string | null; sent_at: string | null; created_at: string };

const sure = (bas: string, son: string) => {
  const dk = Math.round(Math.max(0, Date.parse(son) - Date.parse(bas)) / 60000);
  return dk < 60 ? `${dk} dk` : `${Math.floor(dk / 60)} sa ${dk % 60} dk`;
};
// Saate bağlı değerler bileşen gövdesinde okunmaz (react-hooks/purity).
const simdi = () => Date.now();

export default async function KisiSayfasi({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!kimlikMi(id)) notFound();
  const { isPlatformOwner } = await getPanelContext();
  if (!isPlatformOwner) notFound();
  const admin = createAdminClient();

  const { rows, arvolabReachable } = await getMemberDirectory();
  const kisi = kisilereTopla(rows).find((k) => k.kimlik === id || k.satirlar.some((s) => s.userId === id));
  if (!kisi) notFound();

  const hesaplar = [...new Set(kisi.satirlar.filter((s) => ARVOOS_HESABI.has(s.product)).map((s) => s.userId))];
  const kurumAdi = new Map(rows.filter((r) => r.organizationId).map((r) => [r.organizationId!, r.scope]));

  const [oturumSonucu, varlikSonucu, davetSonucu] = admin ? await Promise.all([
    hesaplar.length
      ? admin.from("user_session_logs").select("id,organization_id,login_at,last_seen_at,logout_at,logout_reason,current_path")
          .in("user_id", hesaplar).order("login_at", { ascending: false }).limit(OTURUM)
      : Promise.resolve({ data: [], error: null }),
    hesaplar.length
      ? admin.from("user_presence").select("last_seen_at,organization_id").in("user_id", hesaplar).order("last_seen_at", { ascending: false }).limit(1)
      : Promise.resolve({ data: [], error: null }),
    /* Büyük/küçük harf duyarsız (davet elle yazılmış olabilir); e-postadaki
       "_" ve "%" desen karakteri olarak değil harfiyen eşleşsin diye kaçırılıyor. */
    kisi.email
      ? admin.from("organization_invitations").select("id,organization_id,role,status,expires_at,sent_at,created_at")
          .ilike("email", kisi.email.replace(/[\\%_]/g, (h) => `\\${h}`)).is("accepted_at", null).order("created_at", { ascending: false }).limit(20)
      : Promise.resolve({ data: [], error: null }),
  ]) : [null, null, null];

  const oturumOkumasi = oturumSonucu ? ikincil(oturumSonucu as { data: Oturum[] | null; error: { message: string } | null }, "Oturumlar") : { veri: null, okunamadi: true };
  const varlikOkumasi = varlikSonucu ? ikincil(varlikSonucu as { data: { last_seen_at: string; organization_id: string }[] | null; error: { message: string } | null }, "Son görülme") : { veri: null, okunamadi: true };
  const davetOkumasi = davetSonucu ? ikincil(davetSonucu as { data: Davet[] | null; error: { message: string } | null }, "Davetler") : { veri: null, okunamadi: true };
  const oturumlar = oturumOkumasi.veri ?? [];
  const sonGorulme = varlikOkumasi.veri?.[0] ?? null;
  const su = simdi();
  const davetler = (davetOkumasi.veri ?? []).map((d) => ({ ...d, suresiGecti: Boolean(d.expires_at && Date.parse(d.expires_at) < su) }));
  const cevrimici = Boolean(sonGorulme && su - Date.parse(sonGorulme.last_seen_at) < 2 * 60 * 1000);

  const kurumSayisi = kisi.uyelikler.filter((u) => !u.bireysel).length;
  const acikUrun = kisi.satirlar.filter((s) => s.access).length;
  const durum = kisi.acik ? { etiket: "Aktif", ton: "success" } : { etiket: kisi.sebep ?? "Erişim kapalı", ton: "danger" };

  return <main className="plt talep cari ekip finans-sayfa kisi-sayfa">
    <header className="talep-bas">
      <div className="talep-bas-metin">
        <small className="panel-kicker"><Link href="/panel/platform/musteriler">MÜŞTERİLER</Link> · <Link href="/panel/platform/kullanicilar">KULLANICILAR</Link></small>
        <h1>{kisi.ad}</h1>
        <p className="ek-alt">{[kisi.email !== kisi.ad ? kisi.email : null, kisi.unvan, kisi.bireysel ? "bireysel abone" : null].filter(Boolean).join(" · ")}</p>
      </div>
      <div className="talep-bas-eylem">
        {kisi.email ? <a className="panel-secondary" href={`mailto:${kisi.email}`}>E-posta gönder</a> : null}
        {kisi.telefon ? <a className="panel-secondary" href={`tel:${kisi.telefon.replace(/\s/g, "")}`}>Ara</a> : null}
      </div>
    </header>

    <nav className="kayit-serit talep-serit" aria-label="Kişi özeti">
      <dl>
        <div><dt>Durum</dt><dd><span className="status-pill" data-tone={durum.ton}>{durum.etiket}</span></dd><small>{acikUrun} / {kisi.satirlar.length} üründe girebiliyor</small></div>
        <div><dt>Rol</dt><dd>{kisininRolu(kisi)}</dd><small>{kurumSayisi > 1 ? `${kurumSayisi} kurumda` : kisi.bireysel ? "bireysel" : "tek kurum"}</small></div>
        <div><dt>Kurum</dt><dd>{sayi(kurumSayisi)}</dd><small>{kisi.uyelikler.filter((u) => !u.bireysel).map((u) => u.kapsam).slice(0, 2).join(", ") || "—"}</small></div>
        <div>
          <dt>Son görülme</dt>
          <dd className={sonGorulme ? undefined : "talep-bos"}>{cevrimici ? <span className="status-pill" data-tone="success">Şu an panelde</span> : sonGorulme ? relativeTime(sonGorulme.last_seen_at) : "—"}</dd>
          <small>{sonGorulme ? `${kurumAdi.get(sonGorulme.organization_id) ?? "Kurum"} · ArvoOS paneli` : varlikOkumasi.okunamadi ? "okunamadı" : "ArvoOS paneline girmemiş"}</small>
        </div>
        <div>
          <dt>Bekleyen davet</dt>
          <dd className={davetler.length ? "talep-uyari" : "talep-bos"}>{davetOkumasi.okunamadi ? "—" : sayi(davetler.length)}</dd>
          <small>{davetOkumasi.okunamadi ? "okunamadı" : davetler.some((d) => d.suresiGecti) ? "süresi geçen var" : davetler.length ? "kabul edilmedi" : "yok"}</small>
        </div>
      </dl>
    </nav>

    {!arvolabReachable ? <KNot ton="uyari"><b>Liste eksik olabilir.</b> ArvoLab&apos;a ulaşılamadı; kişinin oradaki üyelikleri aşağıda yok.</KNot> : null}

    <div className="talep-izgara personel-iki ekip-izgara">
      <div className="kisi-govde">
        <KKart baslik="Kurumlar ve ürünler" aciklama="Kişinin her üründeki üyeliği; erişim müşteri kartının Kullanıcılar sekmesinden açılıp kapatılır."
          sag={<span className="status-pill">{kisi.satirlar.length} üyelik</span>}>
          <div className="talep-tablo fn-ic-tablo">
            <table className="crm-data-table" data-cols="ku-uyelik">
              <thead><tr><th>Kurum</th><th>Ürün</th><th>Rol</th><th className="crm-col-date">Dönem sonu</th><th>Erişim</th><th></th></tr></thead>
              <tbody>
                {kisi.satirlar.map((s) => {
                  const href = s.organizationId ? `/panel/platform/musteriler/${s.organizationId}?pencere=kullanicilar` : null;
                  const erisim = s.access ? { etiket: "Açık", ton: "success" } : { etiket: pasiflikSebebi(s), ton: "danger" };
                  const kapsam = s.individual ? "Bireysel abonelik" : s.scope;
                  return (
                    <tr key={`${s.product}-${s.userId}-${s.organizationId ?? "b"}`} className={s.access ? undefined : "is-pasif"}>
                      <td data-label="Kurum">
                        <span className="ek-kisi">
                          <span className="ek-avatar" data-tur={s.individual ? "bireysel" : undefined} aria-hidden="true">{basHarfleri(kapsam)}</span>
                          <span className="ek-kisi-metin">
                            {href ? <Link className="crm-row-link crm-table-title" href={href} title={kapsam}>{kapsam}</Link> : <span className="crm-table-title" title={kapsam}>{kapsam}</span>}
                            {s.membershipActive === false ? <span className="crm-table-sub">kurum üyeliği kapalı</span> : null}
                          </span>
                        </span>
                      </td>
                      <td data-label="Ürün"><span className="crm-table-title">{productName(s.product as Parameters<typeof productName>[0])}</span></td>
                      <td data-label="Rol"><span className="crm-table-sub">{rolAdi(s.role, s.product === "arvolab" ? "arvolab" : "arvoos")}</span></td>
                      <td className="crm-col-date" data-label="Dönem sonu">{s.periodEnd ? tarih(s.periodEnd) : "—"}</td>
                      <td data-label="Erişim"><span className="status-pill" data-tone={erisim.ton}>{erisim.etiket}</span></td>
                      <td className="crm-table-actions">{href ? <span className="crm-row-chevron" aria-hidden="true">›</span> : null}</td>
                      <MobilSatir href={href} baslik={kapsam} durum={erisim}
                        alt={[productName(s.product as Parameters<typeof productName>[0]), rolAdi(s.role, s.product === "arvolab" ? "arvolab" : "arvoos"), s.periodEnd ? `dönem sonu ${tarih(s.periodEnd)}` : null]} />
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <SatirTiklama />
          </div>
        </KKart>

        <KKart baslik="Son oturumlar" aciklama={`ArvoOS panelindeki son ${OTURUM} giriş. ArvoLab ve ArvoCal girişleri kendi ürünlerinde tutuluyor.`}>
          {!hesaplar.length ? (
            <KBos baslik="ArvoOS hesabı yok" aciklama="Kişi yalnızca ArvoLab'da; ArvoOS paneline giriş kaydı tutulmuyor." />
          ) : oturumOkumasi.okunamadi ? (
            <KBos baslik="Oturumlar okunamadı" aciklama="Sorgu yanıt vermedi; “hiç girmemiş” demek değil. Sayfayı yenileyin." />
          ) : oturumlar.length ? (
            <div className="talep-tablo fn-ic-tablo">
              <table className="crm-data-table" data-cols="ku-oturum">
                <thead><tr><th>Kurum</th><th className="crm-col-date">Giriş</th><th>Süre</th><th>Son sayfa</th><th>Bitiş</th></tr></thead>
                <tbody>
                  {oturumlar.map((o) => {
                    const acik = !o.logout_at && su - Date.parse(o.last_seen_at) < 2 * 60 * 1000;
                    const bitis = acik ? { etiket: "Açık", ton: "success" } : { etiket: o.logout_reason ? NEDEN[o.logout_reason] ?? o.logout_reason : "Bağlantı kapandı", ton: o.logout_reason === "timeout" ? "warning" : "neutral" };
                    const sayfa = panelSayfaAdi(o.current_path)?.ad ?? null;
                    return (
                      <tr key={o.id}>
                        <td data-label="Kurum"><span className="crm-table-title">{kurumAdi.get(o.organization_id) ?? "Kurum"}</span></td>
                        <td className="crm-col-date" data-label="Giriş">{tarihSaat(o.login_at)}</td>
                        <td data-label="Süre"><span className="crm-table-sub">{sure(o.login_at, o.logout_at ?? o.last_seen_at)}</span></td>
                        <td data-label="Son sayfa"><span className="crm-table-sub" title={o.current_path ?? undefined}>{sayfa ?? "—"}</span></td>
                        <td data-label="Bitiş"><span className="status-pill" data-tone={bitis.ton}>{bitis.etiket}</span></td>
                        <MobilSatir baslik={tarihSaat(o.login_at)} durum={bitis} alt={[kurumAdi.get(o.organization_id), sure(o.login_at, o.logout_at ?? o.last_seen_at), sayfa]} />
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : <KBos baslik="Henüz giriş yok" aciklama="Kişi ArvoOS paneline girdiğinde oturumları burada görünür." />}
        </KKart>
      </div>

      <div className="liste-sag">
        <KKart baslik="İletişim">
          <KListe>
            <KOge baslik="E-posta" deger={kisi.email ? <a href={`mailto:${kisi.email}`}>{kisi.email}</a> : <span className="k-ios-eksik">Yok</span>} />
            <KOge baslik="Telefon" deger={kisi.telefon ? <a href={`tel:${kisi.telefon.replace(/\s/g, "")}`}>{kisi.telefon}</a> : <span className="k-ios-eksik">Girilmedi</span>} />
            <KOge baslik="Unvan" deger={kisi.unvan ?? <span className="k-ios-eksik">Girilmedi</span>} />
          </KListe>
          {/* Telefon yalnızca ArvoOS profilinde var; ArvoLab ayrı veritabanında ve orada tutulmuyor. */}
        </KKart>

        <KKart baslik="Bekleyen davetler" aciklama="Bu e-postaya gönderilmiş, henüz kabul edilmemiş davetler; yeniden gönderme kurumun Kurulum sekmesinde.">
          {davetOkumasi.okunamadi ? (
            <KBos baslik="Davetler okunamadı" aciklama={admin ? "Sorgu yanıt vermedi; “davet yok” demek değil." : "Sunucu anahtarı tanımlı değil."} />
          ) : davetler.length ? (
            <KListe>
              {davetler.map((d) => (
                <KOge key={d.id} href={`/panel/platform/musteriler/${d.organization_id}?pencere=kurulum`} baslik={kurumAdi.get(d.organization_id) ?? "Kurum"}
                  alt={`gönderildi ${tarih(d.sent_at ?? d.created_at)}${d.expires_at ? ` · son gün ${tarih(d.expires_at)}` : ""}`}
                  durum={d.suresiGecti ? { etiket: "Süresi geçti", ton: "danger" } : { etiket: "Bekliyor", ton: "warning" }} />
              ))}
            </KListe>
          ) : <KBos baslik="Bekleyen davet yok" />}
        </KKart>
      </div>
    </div>
  </main>;
}
