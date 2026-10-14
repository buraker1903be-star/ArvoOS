import Link from "next/link";
import { notFound } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";
import { KiraciSecici } from "./kiraci-secici";
import { LisansBolumu } from "./lisans-bolumu";
// Ölçer, ürün kartları ve düzenleme penceresi (plt-*) hâlâ buradan; başlık,
// şerit ve kart düzeninin CSS'ini konsol-ui kendisi import ediyor.
import "../platform.css";

type OrganizationRow = { id: string; name: string; display_name: string | null; slug: string; plan_code: string; status: string; kind: string | null };

export default async function LicenseManagementPage({ searchParams }: { searchParams: Promise<{ organization?: string }> }) {
  const { supabase, isPlatformOwner } = await getPanelContext();
  if (!isPlatformOwner) notFound();

  const params = await searchParams;
  /* Kurum listesi hem seçili kiracıyı bulmak hem de sayfanın kendi
     seçicisini doldurmak için. */
  const { data: organizationData, error: organizationError } = await supabase
    .from("organizations").select("id,name,display_name,slug,plan_code,status,kind").order("name");
  if (organizationError) throw new Error("Kurum listesi okunamadı.");

  const organizations = (organizationData ?? []) as OrganizationRow[];
  if (!organizations.length) throw new Error("Yönetilecek kurum bulunamadı.");

  /*
    Adreste bir kurum yazıyorsa ONU açıyoruz, yoksa 404. Eskiden bilinmeyen
    kimlik sessizce kendi kurumumuza düşüyordu: kurucu silinmiş ya da yanlış
    bir bağlantıyla geldiğinde başka bir kiracının lisansını düzenlediğini
    fark etmeden kaydedebilirdi — formlar seçili kurumun kimliğini yazıyor.

    Adres boşken (menüden gelindiğinde) ilk MÜŞTERİ kurum açılıyor. Kendi
    kurumumuza düşmek, "kimin lisansına bakıyorum" sorusunu her seferinde
    yanlış yanıtlıyordu.
  */
  const selected = params.organization
    ? organizations.find((item) => item.id === params.organization)
    : organizations.find((item) => item.kind !== "internal") ?? organizations[0];
  if (!selected) notFound();

  const label = selected.display_name || selected.name;

  return <main className="plt talep cari">
    <header className="talep-bas">
      <div className="talep-bas-metin"><small className="panel-kicker">KİRACI · {label}</small><h1>Lisans ve kota</h1></div>
      <div className="talep-bas-eylem">
        <KiraciSecici
          secili={selected.id}
          kurumlar={organizations.map((kurum) => ({
            id: kurum.id,
            ad: kurum.display_name || kurum.name,
            kendi: kurum.kind === "internal",
          }))}
        />
        <Link className="panel-secondary" href={`/panel/platform?organization=${selected.id}`}>Kiracı dosyasına dön</Link>
      </div>
    </header>

    <LisansBolumu supabase={supabase} organizationId={selected.id} label={label} />
  </main>;
}
