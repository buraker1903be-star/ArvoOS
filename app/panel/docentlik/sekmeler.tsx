import Link from "next/link";
import { docentlikSekmeleri, type DocentlikYetkileri } from "@/lib/docentlik-gorunum";

/*
  Doçentlik çalışma alanının bölüm sekmeleri (F6 PR6a, PR6b'de yetkili
  bölümler eklendi). İkinci bir navigasyon sistemi DEĞİL: panelin menüsü
  modülü açıyor, bunlar modülün içindeki ekranlar arasında geçiş. Hangi
  sekmenin görüneceği yetkiden (lib/docentlik-gorunum → docentlikSekmeleri);
  gizlemek güvenlik değil, sayfa ve RLS ayrıca soruyor. Bağlantı olarak
  (sorgu değişkeni değil): her ekran ayrı rota, geri tuşu ve yer imi çalışıyor.
*/
export function DocentlikSekmeleri({ etkin, yetkiler }: { etkin: string; yetkiler: DocentlikYetkileri }) {
  return (
    <nav className="docentlik-sekmeler" aria-label="Doçentlik bölümleri">
      {docentlikSekmeleri(yetkiler).map((s) => (
        <Link key={s.anahtar} href={s.href} aria-current={s.anahtar === etkin ? "page" : undefined}
          className={s.anahtar === etkin ? "is-active" : undefined}>
          {s.etiket}
        </Link>
      ))}
    </nav>
  );
}
