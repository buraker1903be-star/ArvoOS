import Link from "next/link";

/*
  Doçentlik çalışma alanının bölüm sekmeleri (F6 PR6a). İkinci bir
  navigasyon sistemi DEĞİL: panelin menüsü modülü açıyor, bunlar modülün
  içindeki üç ekran arasında geçiş. Bağlantı olarak (sorgu değişkeni değil)
  yazıldı: her ekran ayrı rota, geri tuşu ve yer imi çalışıyor.
*/
const SEKMELER = [
  { anahtar: "ozet", etiket: "Özet", href: "/panel/docentlik" },
  { anahtar: "faaliyetler", etiket: "Faaliyetlerim", href: "/panel/docentlik/faaliyetler" },
  { anahtar: "profil", etiket: "Akademik profil", href: "/panel/docentlik/profil" },
] as const;

export function DocentlikSekmeleri({ etkin }: { etkin: (typeof SEKMELER)[number]["anahtar"] }) {
  return (
    <nav className="docentlik-sekmeler" aria-label="Doçentlik bölümleri">
      {SEKMELER.map((s) => (
        <Link key={s.anahtar} href={s.href} aria-current={s.anahtar === etkin ? "page" : undefined}
          className={s.anahtar === etkin ? "is-active" : undefined}>
          {s.etiket}
        </Link>
      ))}
    </nav>
  );
}
