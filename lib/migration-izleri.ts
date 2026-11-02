/*
  MIGRATION İZLERİ (02.11.2026).

  29.10.2026'daki otomatik proforma migration'ı canlıya hiç uygulanmadı ve
  bunu dört gün kimse fark etmedi: kod canlıdaydı, veritabanında sütun
  yoktu; proforma müşteriye gitmiyor, ekran yalnızca "Proforma
  bulunamadı." diyordu. Gerçek sebep yalnızca sunucu günlüğündeydi.

  Migration'lar elle (SQL Editor'den) uygulanıyor ve Supabase'in
  migration defteri bunları görmüyor; "hangisi uygulandı" sorusunun tek
  güvenilir yanıtı, migration'ın yarattığı NESNENİN veritabanında olup
  olmadığı. Bu modül bir migration metninden o nesneleri (iz) çıkarıyor;
  Sistem sağlığı canlı veritabanına soruyor (platform_sema_eksikleri).

  Yalnızca YARATILAN nesneler: tablo/görünüm, eklenen sütun, işlev,
  tetikleyici. Kısıt ve politika değişikliği iz bırakmıyor (adı yeniden
  kullanılıyor, varlığı uygulandığını kanıtlamıyor); böyle bir migration
  denetimde "izsiz" sayılır, eksik değil.

  Saf modül, yalnızca silinebilir tür ek açıklamaları var: betik
  (scripts/migration-izleri.mjs) Node'un tür ayıklamasıyla doğrudan içe
  aktarıyor. Testi tests/unit/migration-izleri.test.ts.
*/

export type Iz =
  | { tur: "tablo"; ad: string }
  | { tur: "sutun"; tablo: string; sutun: string }
  | { tur: "islev"; ad: string }
  | { tur: "tetikleyici"; ad: string; tablo: string };

export type MigrationIzi = { migration: string; izler: Iz[] };

const yorumsuz = (sql: string) => sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
/* İşlev gövdeleri ($$…$$, $function$…$function$) dışarıda: içlerindeki
   "create table" ya da "alter table" metni migration'ın yarattığı şey değil. */
const govdesiz = (sql: string) => sql.replace(/\$([a-z_]*)\$[\s\S]*?\$\1\$/gi, " ");

const nitelikli = (ad: string) => {
  const temiz = ad.replace(/"/g, "").toLowerCase();
  return temiz.includes(".") ? temiz : `public.${temiz}`;
};

const AD = String.raw`((?:"?[a-z_][a-z0-9_]*"?\.)?"?[a-z_][a-z0-9_]*"?)`;

export function migrationIzleri(sql: string): Iz[] {
  const metin = govdesiz(yorumsuz(sql));
  const izler: Iz[] = [];
  const anahtar = new Set<string>();
  const ekle = (iz: Iz) => {
    const k = JSON.stringify(iz);
    if (!anahtar.has(k)) { anahtar.add(k); izler.push(iz); }
  };

  for (const m of metin.matchAll(new RegExp(String.raw`create\s+(?:unlogged\s+)?table\s+(?:if\s+not\s+exists\s+)?${AD}`, "gi")))
    ekle({ tur: "tablo", ad: nitelikli(m[1]) });
  for (const m of metin.matchAll(new RegExp(String.raw`create\s+(?:or\s+replace\s+)?(?:materialized\s+)?view\s+(?:if\s+not\s+exists\s+)?${AD}`, "gi")))
    ekle({ tur: "tablo", ad: nitelikli(m[1]) });
  for (const m of metin.matchAll(new RegExp(String.raw`create\s+(?:or\s+replace\s+)?function\s+${AD}`, "gi")))
    ekle({ tur: "islev", ad: nitelikli(m[1]) });
  for (const m of metin.matchAll(new RegExp(String.raw`create\s+(?:or\s+replace\s+)?(?:constraint\s+)?trigger\s+"?([a-z_][a-z0-9_]*)"?[\s\S]*?\bon\s+${AD}`, "gi")))
    ekle({ tur: "tetikleyici", ad: m[1].toLowerCase(), tablo: nitelikli(m[2]) });
  for (const m of metin.matchAll(new RegExp(String.raw`alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?${AD}([^;]*);`, "gi"))) {
    const tablo = nitelikli(m[1]);
    for (const s of m[2].matchAll(/add\s+column\s+(?:if\s+not\s+exists\s+)?"?([a-z_][a-z0-9_]*)"?/gi))
      ekle({ tur: "sutun", tablo, sutun: s[1].toLowerCase() });
  }

  /* "drop … if exists" ardından "create" bu depoda olağan kalıp; düşürme
     süzülmüyor — aynı dosyada yaratılıp kalıcı olarak düşürülen bir nesne
     olsaydı ayrıca ele alınırdı. */
  return izler;
}

/** İzi insanın okuyacağı tek satıra çevirir (Sistem sağlığı ekranı). */
export function izYazisi(iz: Iz): string {
  switch (iz.tur) {
    case "tablo": return `tablo ${iz.ad}`;
    case "sutun": return `sütun ${iz.tablo}.${iz.sutun}`;
    case "islev": return `işlev ${iz.ad}()`;
    case "tetikleyici": return `tetikleyici ${iz.ad} (${iz.tablo})`;
  }
}
