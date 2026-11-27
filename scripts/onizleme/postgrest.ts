/*
  POSTGREST'İN KÜÇÜK BİR KARŞILIĞI (28.11.2026).

  Uygulama Supabase istemcisiyle konuşuyor; önizlemenin altında ise
  düz bir Postgres (PGlite) var. Bu dosya aradaki çeviriyi yapıyor:
  `from(t).select(...).eq(...).order(...)` zincirini SQL'e çevirip
  çalıştırıyor.

  TAM BİR POSTGREST DEĞİL, bilerek. Desteklenenler: select (gömülü
  ilişkilerle), eq/neq/in/is/gt/gte/lt/lte, order, limit, range,
  single/maybeSingle, count, insert/update/upsert/delete ve rpc.
  Desteklenmeyen bir süzgeç (or, ilike, textSearch…) SESSİZCE
  atlanmıyor: günlüğe yazılıyor, çünkü sessiz bir atlama ekranda
  "hepsi" gösterip doğru sanmaya yol açar.

  GÖMÜLÜ İLİŞKİLER elle tanımlı (ILISKILER). PostgREST bunu yabancı
  anahtarlardan çıkarıyor; burada tahmin etmek yerine kullanılan
  ilişkileri yazmak daha dürüst — tanımsız bir ilişki null döner ve
  günlüğe düşer.
*/

type Pg = { query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> };
type Satir = Record<string, unknown>;

/** tablo → gömülü ad → nasıl bağlanacağı. */
const ILISKILER: Record<string, Record<string, { tablo: string; yerel: string; uzak: string; cok?: boolean }>> = {
  organization_payment_requests: {
    organizations: { tablo: "organizations", yerel: "organization_id", uzak: "id" },
    platform_bank_accounts: { tablo: "platform_bank_accounts", yerel: "bank_account_id", uzak: "id" },
  },
  support_tickets: {
    organizations: { tablo: "organizations", yerel: "organization_id", uzak: "id" },
    support_messages: { tablo: "support_messages", yerel: "id", uzak: "ticket_id", cok: true },
  },
  payment_provider_events: {
    organizations: { tablo: "organizations", yerel: "organization_id", uzak: "id" },
  },
  organization_modules: {
    arvo_modules: { tablo: "arvo_modules", yerel: "module_code", uzak: "code" },
  },
};

/** "a,b,rel(c,d),e" → { sutunlar: [a,b,e], gomululer: [{ad:rel, alanlar:[c,d]}] } */
function secimiCozumle(secim: string) {
  const sutunlar: string[] = [];
  const gomululer: { ad: string; alanlar: string[] }[] = [];
  let i = 0;
  let parca = "";
  const bitir = () => {
    const s = parca.trim();
    if (s) sutunlar.push(s);
    parca = "";
  };
  while (i < secim.length) {
    const ch = secim[i];
    if (ch === "(") {
      const ad = parca.trim();
      parca = "";
      let derinlik = 1;
      let ic = "";
      i += 1;
      while (i < secim.length && derinlik > 0) {
        if (secim[i] === "(") derinlik += 1;
        if (secim[i] === ")") derinlik -= 1;
        if (derinlik > 0) ic += secim[i];
        i += 1;
      }
      gomululer.push({ ad, alanlar: ic.split(",").map((x) => x.trim()).filter(Boolean) });
      if (secim[i] === ",") i += 1;
      continue;
    }
    if (ch === ",") { bitir(); i += 1; continue; }
    parca += ch;
    i += 1;
  }
  bitir();
  return { sutunlar, gomululer };
}

const alinti = (ad: string) => `"${ad.replace(/"/g, '""')}"`;

/*
  PostgREST JSON DÖNDÜRÜYOR: zaman damgası ISO METİN, bigint sayı.
  PGlite sürücüsü ise Date ve BigInt veriyor; uygulama metin bekleyen
  yerlerde (`a.created_at.localeCompare(...)`, `.slice(0, 10)`)
  düşüyordu. Çeviri burada tek yerde yapılıyor, yoksa her ekranda
  ayrı bir "acaba Date mi" kontrolü gerekirdi.
*/
function jsonlastir(deger: unknown): unknown {
  if (deger instanceof Date) return deger.toISOString();
  if (typeof deger === "bigint") return Number(deger);
  if (Array.isArray(deger)) return deger.map(jsonlastir);
  if (deger && typeof deger === "object") {
    return Object.fromEntries(Object.entries(deger as Satir).map(([k, v]) => [k, jsonlastir(v)]));
  }
  return deger;
}

export function pgSorgu(db: Pg, tablo: string) {
  let secim = "*";
  let gomuluSecim: { ad: string; alanlar: string[] }[] = [];
  const kosullar: { sql: string; deger?: unknown }[] = [];
  const siralama: string[] = [];
  let sinir: number | null = null;
  let baslangic = 0;
  let tek: "single" | "maybe" | null = null;
  let sayim = false;
  let yalnizSayim = false;
  /** insert/update/upsert/delete: null ise okuma. */
  let yazma: { tur: "insert" | "update" | "upsert" | "delete"; veri?: Satir[]; cakisma?: string } | null = null;

  const ham: Record<string, unknown> = {};
  const kurucu: Record<string, unknown> = new Proxy(ham, {
    get: (h, ad) => {
      if (ad in h) return h[ad as string];
      return (...args: unknown[]) => {
        if (typeof ad === "string" && !["then", "catch", "finally"].includes(ad)) {
          console.warn(`[onizleme] desteklenmeyen süzgeç atlandı: ${tablo}.${ad}(${args.map(String).join(", ").slice(0, 60)})`);
        }
        return kurucu;
      };
    },
  });

  const kosul = (sql: string, deger?: unknown) => {
    kosullar.push({ sql, deger });
    return kurucu;
  };

  async function calistir() {
    const parametreler: unknown[] = [];
    const nerede = kosullar.map((k) => {
      if (k.deger === undefined) return k.sql;
      parametreler.push(k.deger);
      return k.sql.replace("?", `$${parametreler.length}`);
    });
    const where = nerede.length ? ` where ${nerede.join(" and ")}` : "";

    if (yazma) {
      if (yazma.tur === "delete") {
        const { rows } = await db.query(`delete from public.${alinti(tablo)}${where} returning *`, parametreler);
        return { data: rows.map(jsonlastir), error: null, count: rows.length };
      }
      if (yazma.tur === "update") {
        const veri = yazma.veri![0];
        const setler = Object.keys(veri).map((k, i) => `${alinti(k)} = $${parametreler.length + i + 1}`);
        const degerler = Object.values(veri);
        const sql = `update public.${alinti(tablo)} set ${setler.join(", ")}${where} returning *`;
        const { rows } = await db.query(sql, [...parametreler, ...degerler]);
        return { data: rows.map(jsonlastir), error: null, count: rows.length };
      }
      /* insert / upsert */
      const satirlar = yazma.veri!;
      const sutunlar = [...new Set(satirlar.flatMap((s) => Object.keys(s)))];
      const degerler: unknown[] = [];
      const gruplar = satirlar.map((s) => `(${sutunlar.map((c) => { degerler.push(s[c] ?? null); return `$${degerler.length}`; }).join(", ")})`);
      let sql = `insert into public.${alinti(tablo)} (${sutunlar.map(alinti).join(", ")}) values ${gruplar.join(", ")}`;
      if (yazma.tur === "upsert") {
        const anahtar = (yazma.cakisma ?? "id").split(",").map((x) => alinti(x.trim())).join(", ");
        const guncel = sutunlar.filter((c) => !(yazma!.cakisma ?? "id").split(",").map((x) => x.trim()).includes(c));
        sql += ` on conflict (${anahtar}) do update set ${guncel.map((c) => `${alinti(c)} = excluded.${alinti(c)}`).join(", ")}`;
      }
      sql += " returning *";
      const { rows } = await db.query(sql, degerler);
      return { data: rows.map(jsonlastir), error: null, count: rows.length };
    }

    /* Okuma */
    const { sutunlar, gomululer } = secim === "*" ? { sutunlar: ["*"], gomululer: [] } : secimiCozumle(secim);
    gomuluSecim = gomululer;
    const secilen = sutunlar.includes("*") ? "*" : [...new Set([...sutunlar, ...gomululer.map((g) => ILISKILER[tablo]?.[g.ad]?.yerel ?? "")])]
      .filter(Boolean).map(alinti).join(", ");
    if (yalnizSayim) {
      const { rows } = await db.query(`select count(*)::int as n from public.${alinti(tablo)}${where}`, parametreler);
      return { data: null, error: null, count: Number(rows[0]?.n ?? 0) };
    }
    let sql = `select ${secilen || "*"} from public.${alinti(tablo)}${where}`;
    if (siralama.length) sql += ` order by ${siralama.join(", ")}`;
    if (sinir !== null) sql += ` limit ${sinir}`;
    if (baslangic) sql += ` offset ${baslangic}`;
    const { rows } = await db.query(sql, parametreler);

    for (const g of gomuluSecim) {
      const iliski = ILISKILER[tablo]?.[g.ad];
      if (!iliski) {
        console.warn(`[onizleme] tanımsız gömülü ilişki: ${tablo}.${g.ad} — null döndü`);
        for (const satir of rows) satir[g.ad] = null;
        continue;
      }
      const anahtarlar = [...new Set(rows.map((r) => r[iliski.yerel]).filter((v) => v !== null && v !== undefined))];
      if (!anahtarlar.length) { for (const satir of rows) satir[g.ad] = iliski.cok ? [] : null; continue; }
      const alanlar = [...new Set([...g.alanlar, iliski.uzak])].map(alinti).join(", ");
      const { rows: iliskili } = await db.query(
        `select ${alanlar} from public.${alinti(iliski.tablo)} where ${alinti(iliski.uzak)} = any($1)`,
        [anahtarlar],
      );
      for (const satir of rows) {
        const eslesen = iliskili.filter((x) => x[iliski.uzak] === satir[iliski.yerel]);
        satir[g.ad] = iliski.cok ? eslesen : (eslesen[0] ?? null);
      }
    }

    const cevrili = rows.map((r) => jsonlastir(r) as Satir);
    const veri = tek ? (cevrili[0] ?? null) : cevrili;
    return { data: veri, error: null, count: sayim ? cevrili.length : null };
  }

  Object.assign(ham, {
    select: (s?: string, o?: { count?: string; head?: boolean }) => {
      if (yazma) return kurucu; /* insert(...).select() → zaten returning * */
      if (s) secim = s;
      if (o?.count) sayim = true;
      if (o?.head) yalnizSayim = true;
      return kurucu;
    },
    eq: (c: string, v: unknown) => kosul(`${alinti(c)} = ?`, v),
    neq: (c: string, v: unknown) => kosul(`${alinti(c)} is distinct from ?`, v),
    gt: (c: string, v: unknown) => kosul(`${alinti(c)} > ?`, v),
    gte: (c: string, v: unknown) => kosul(`${alinti(c)} >= ?`, v),
    lt: (c: string, v: unknown) => kosul(`${alinti(c)} < ?`, v),
    lte: (c: string, v: unknown) => kosul(`${alinti(c)} <= ?`, v),
    in: (c: string, v: unknown[]) => kosul(`${alinti(c)} = any(?)`, v),
    is: (c: string, v: unknown) => kosul(v === null ? `${alinti(c)} is null` : `${alinti(c)} is ${v ? "true" : "false"}`),
    order: (c: string, o?: { ascending?: boolean }) => {
      siralama.push(`${alinti(c)} ${o?.ascending === false ? "desc" : "asc"} nulls last`);
      return kurucu;
    },
    limit: (n: number) => { sinir = n; return kurucu; },
    range: (a: number, b: number) => { baslangic = a; sinir = b - a + 1; return kurucu; },
    single: () => { tek = "single"; return kurucu; },
    maybeSingle: () => { tek = "maybe"; return kurucu; },
    insert: (v: Satir | Satir[]) => { yazma = { tur: "insert", veri: Array.isArray(v) ? v : [v] }; return kurucu; },
    upsert: (v: Satir | Satir[], o?: { onConflict?: string }) => {
      yazma = { tur: "upsert", veri: Array.isArray(v) ? v : [v], cakisma: o?.onConflict };
      return kurucu;
    },
    update: (v: Satir) => { yazma = { tur: "update", veri: [v] }; return kurucu; },
    delete: () => { yazma = { tur: "delete" }; return kurucu; },
    then: (coz: (s: unknown) => unknown, red?: (h: unknown) => unknown) =>
      calistir().then(coz, (hata) => {
        /* Supabase hata FIRLATMIYOR, `error` alanına yazıyor:
           uygulamanın hata yolları ancak böyle sınanır. */
        const mesaj = hata instanceof Error ? hata.message : String(hata);
        console.warn(`[onizleme] sorgu hatası (${tablo}): ${mesaj}`);
        return coz({ data: tek ? null : [], error: { message: mesaj, code: "P0001", details: "", hint: "" }, count: null });
      }).catch(red),
  });
  return kurucu;
}

/** `rpc(ad, args)` → `select * from public.ad(named := $n)` */
export function pgRpc(db: Pg, ad: string, args?: Record<string, unknown>) {
  let tek = false;
  const calistir = async () => {
    const girdiler = Object.entries(args ?? {});
    const sql = `select * from public.${alinti(ad)}(${girdiler.map(([k], i) => `${alinti(k)} => $${i + 1}`).join(", ")})`;
    try {
      const { rows } = await db.query(sql, girdiler.map(([, v]) => v));
      /* Tek sütunlu dönüş (scalar) PostgREST'te doğrudan değer olur. */
      const tekSutun = rows.length && Object.keys(rows[0]).length === 1 && Object.keys(rows[0])[0] === ad;
      const cevrili = rows.map((r) => jsonlastir(r) as Record<string, unknown>);
      const veri = tekSutun ? cevrili[0][ad] : tek ? (cevrili[0] ?? null) : cevrili;
      return { data: veri, error: null };
    } catch (hata) {
      const mesaj = hata instanceof Error ? hata.message : String(hata);
      console.warn(`[onizleme] rpc hatası (${ad}): ${mesaj}`);
      return { data: null, error: { message: mesaj, code: "P0001", details: "", hint: "" } };
    }
  };
  const kurucu: Record<string, unknown> = {
    single: () => { tek = true; return kurucu; },
    maybeSingle: () => { tek = true; return kurucu; },
    select: () => kurucu,
    eq: () => kurucu,
    order: () => kurucu,
    then: (coz: (s: unknown) => unknown, red?: (h: unknown) => unknown) => calistir().then(coz).catch(red),
  };
  return kurucu;
}
