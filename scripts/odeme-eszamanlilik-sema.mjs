/*
  Ödeme eşzamanlılık sınamasının şema kurulumu (scripts/odeme-eszamanlilik.sh).

  PGlite tek bağlantılı: iki işlemin aynı anda kilit beklemesini
  gösteremez. Bu betik akış testlerinin kurduğu veritabanının AYNISINI
  (Supabase kabuğu + canlı şema + bekleyen migration'lar + yetkiler)
  gerçek bir PostgreSQL'e verilecek tek SQL olarak yazar. Kopya mantık
  yok: parçalar tests/db/ortam.mjs'ten okunuyor.
*/
import fs from "node:fs";
import path from "node:path";
import { BEKLEYEN_MIGRATIONLAR, SEMA, SUPABASE_KABUGU, SUPABASE_VARSAYILAN_YETKI, yetkiSatirlari } from "../tests/db/ortam.mjs";

const sema = fs.readFileSync(SEMA, "utf8");
const bekleyen = BEKLEYEN_MIGRATIONLAR.map((ad) => fs.readFileSync(path.resolve(import.meta.dirname, "../supabase/migrations", ad), "utf8"));
const parcalar = [SUPABASE_KABUGU, sema, ...bekleyen, SUPABASE_VARSAYILAN_YETKI, ...[sema, ...bekleyen].flatMap((sql) => yetkiSatirlari(sql))];
process.stdout.write(parcalar.join("\n;\n") + "\n");
