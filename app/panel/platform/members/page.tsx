import { PlatformTabs } from "../platform-tabs";
import { notFound } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";
import { getMemberDirectory, type DirectoryRow, type MemberProduct } from "@/lib/member-directory";
import { productName } from "@/lib/products";
import { StgIcon, StgWidget } from "../../settings/settings-ui";
import "../../settings/settings.css";
import "../platform.css";

const date = (value: string | null) => value ? new Date(value).toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul" }) : "—";
const roleLabels: Record<string, string> = {
  owner: "Kurum sahibi", admin: "Yönetici", manager: "Müdür", member: "Üye", viewer: "İzleyici",
  client: "Üye", employee: "Çalışan", expert: "Uzman", controller: "Kontrolör",
  academic_manager: "Akademik yönetici", system_admin: "Sistem yöneticisi", founder: "Kurucu",
};
const statusLabels: Record<string, string> = {
  active: "Aktif", trialing: "Deneme", past_due: "Ödeme gecikmiş", suspended: "Askıda",
  canceled: "İptal", inactive: "Kapalı", "lisans yok": "Lisans yok", "abonelik yok": "Abonelik yok", "iç ekip": "İç ekip",
};

const PRODUCT_ORDER: MemberProduct[] = ["arvoos", "arvolab", "arc", "randevu"];

function ProductTable({ product, rows }: { product: MemberProduct; rows: DirectoryRow[] }) {
  const open = rows.filter((row) => row.access).length;
  return (
    <section className="panel-card management-card" aria-label={`${productName(product)} üyeleri`}>
      <div className="management-heading">
        <div><small>ÜYELER</small><h2>{productName(product)}</h2></div>
        <span className="status-pill" data-tone={open ? "success" : "neutral"}>{open} / {rows.length} erişimi açık</span>
      </div>
      {rows.length ? (
        <div className="plt-table-scroll">
          <table className="plt-table">
            <thead>
              <tr><th>Kişi</th><th>E-posta</th><th>Bağlı olduğu</th><th>Rol</th><th>Durum</th><th>Dönem sonu</th></tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={`${row.product}-${row.userId}-${row.scope}`}>
                  <td>{row.name ?? "—"}</td>
                  <td className="plt-mono">{row.email ?? "—"}</td>
                  <td>{row.individual ? <span className="status-pill" data-tone="info">Bireysel</span> : row.scope}</td>
                  <td>{row.role ? roleLabels[row.role] ?? row.role : "—"}</td>
                  <td>
                    <span className="status-pill" data-tone={row.access ? "success" : "danger"}>
                      {row.access ? "Açık" : "Kapalı"}
                    </span>
                    <small className="plt-substatus">{statusLabels[row.status] ?? row.status}</small>
                  </td>
                  <td>{date(row.periodEnd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="panel-muted">Bu üründe üye yok.</p>}
    </section>
  );
}

export default async function MembersPage() {
  const { isPlatformOwner } = await getPanelContext();
  if (!isPlatformOwner) notFound();

  const { rows, arvolabReachable } = await getMemberDirectory();
  const byProduct = new Map<MemberProduct, DirectoryRow[]>(PRODUCT_ORDER.map((product) => [product, []]));
  for (const row of rows) byProduct.get(row.product)?.push(row);

  const people = new Set(rows.map((row) => row.email ?? row.userId));
  const individuals = rows.filter((row) => row.individual);
  const blocked = rows.filter((row) => !row.access);

  return <div className="stg plt">
    <div className="panel-pagehead">
      <div><small className="panel-kicker">PLATFORM · ÜYELER</small><h1>Tüm Üyeler</h1><p>ArvoOS, ArvoLab ve Arc&apos;ı kullanan herkesin tek listesi; kurum üyeleri ve bireysel aboneler birlikte.</p></div>
      
    </div>

    <PlatformTabs active="uyeler" />

    {!arvolabReachable ? (
      <div className="platform-note"><span>!</span><p>ArvoLab veritabanına ulaşılamadı; aşağıdaki listede ArvoLab üyeleri eksik. Bağlantı ayarlarını kontrol edin.</p></div>
    ) : null}

    <section className="stg-widgets" aria-label="Üye özeti">
      <StgWidget tone="gold" icon="users" label="Kişi" value={people.size} note="Ürünler arası tekil" />
      <StgWidget tone="success" icon="check" label="Erişimi açık" value={rows.length - blocked.length} note={`${rows.length} üyelik kaydı`} />
      <StgWidget tone={individuals.length ? "info" : "neutral"} icon="box" label="Bireysel" value={individuals.length} note="Kuruma bağlı olmayan" />
      <StgWidget tone={blocked.length ? "warning" : "neutral"} icon="lock" label="Erişimi kapalı" value={blocked.length} note="Lisans ya da abonelik yok" />
    </section>

    {PRODUCT_ORDER.map((product) => <ProductTable key={product} product={product} rows={byProduct.get(product) ?? []} />)}

    <div className="platform-note"><span>i</span><p>Bir kişi birden fazla üründe görünebilir; aynı e-posta ArvoOS ve Arc&apos;ta ortak hesaptır, ArvoLab ayrı veritabanında kendi hesabını kullanır.</p></div>

    {!rows.length ? <div className="stg-empty"><StgIcon name="users" size={22} /><p>Henüz üye yok.</p></div> : null}
  </div>;
}
