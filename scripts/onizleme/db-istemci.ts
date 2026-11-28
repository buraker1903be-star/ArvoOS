/*
  Önizlemenin PGlite destekli Supabase istemcisi (28.11.2026).

  Sahte istemciyle aynı yüzey, ama altında gerçek veritabanı var:
  okumalar SQL'den, yazmalar KALICI, RLS ve tetikleyiciler işliyor.
  Oturum çerezden geliyor (`onizleme_oturum`): tarayıcıda hesap
  değiştirip yetkisiz erişimi aynı turda sınayabiliyoruz.

  Depolama hâlâ taklit: PGlite'ta Supabase Storage yok. İmzalı
  bağlantı YETKİYE BAKARAK üretiliyor — kurucu dışındaki oturum için
  null dönüyor — ama bu, gerçek kova politikasının kanıtı DEĞİL;
  raporda öyle yazıyor.
*/
import { cookies } from "next/headers";
import { KURUCU, oturumAc, veritabani } from "./pglite";
import { pgRpc, pgSorgu } from "./postgrest";

export const OTURUM_COOKIE = "onizleme_oturum";
/** Yönetici istemcisi: RLS'siz, veritabanı sahibi olarak. */
export const SAHIP = "sahip";

async function oturumKullanicisi(): Promise<string> {
  try {
    const kutu = await cookies();
    const deger = kutu.get(OTURUM_COOKIE)?.value?.trim();
    return deger && /^[0-9a-f-]{36}$/i.test(deger) ? deger : KURUCU;
  } catch {
    /* İstek bağlamı yoksa (derleme anı) kurucu. */
    return KURUCU;
  }
}

/** Her çağrıdan önce oturumu kurar; sonra zinciri döndürür. */
function gecikmeli<T>(uret: () => Promise<T>) {
  /* Zincir eşzamanlı kuruluyor, çalıştırma asenkron: `then`
     çağrıldığında önce oturum açılıyor. */
  let cozum: Promise<T> | null = null;
  return () => (cozum ??= uret());
}

export function dbIstemcisi(kullanici?: string) {
  const hazirla = gecikmeli(async () => {
    const db = await veritabani();
    /* SAHIP: rol kurulmuyor, politikalar uygulanmıyor (service_role). */
    await oturumAc(db, kullanici === SAHIP ? null : kullanici ?? (await oturumKullanicisi()));
    return db;
  });

  /* Zincir kurulurken db hazır olmayabilir: vekil, `then` anında
     gerçek zinciri kurup devreye alıyor. */
  const ertelenmisZincir = (kur: (db: Awaited<ReturnType<typeof hazirla>>) => Record<string, unknown>) => {
    const cagrilar: { ad: string; args: unknown[] }[] = [];
    const vekil: Record<string, unknown> = new Proxy({}, {
      get: (_h, ad) => {
        if (ad === "then") {
          /*
            ZİNCİR BİR THENABLE: bir `.then` geri çağrısından
            DÖNDÜRÜLEMEZ, çünkü söz onu kendiliğinden çözer ve geri
            çağrıya kurucu yerine SONUÇ gelir ("zincir.then is not a
            function"). Bu yüzden zincir açıkça bir Promise içinde
            sürülüyor.
          */
          return (coz: (s: unknown) => unknown, red?: (h: unknown) => unknown) =>
            (async () => {
              const db = await hazirla();
              let zincir = kur(db);
              for (const c of cagrilar) zincir = (zincir[c.ad] as (...a: unknown[]) => Record<string, unknown>)(...c.args);
              const sur = zincir as unknown as { then: (c: (v: unknown) => void, r: (h: unknown) => void) => void };
              return await new Promise((coz2, red2) => sur.then(coz2, red2));
            })().then(coz, red);
        }
        return (...args: unknown[]) => { cagrilar.push({ ad: String(ad), args }); return vekil; };
      },
    });
    return vekil;
  };

  const kimlik = async () => (kullanici && kullanici !== SAHIP ? kullanici : kullanici === SAHIP ? KURUCU : await oturumKullanicisi());

  return {
    from: (tablo: string) => ertelenmisZincir((db) => pgSorgu(db, tablo)),
    rpc: (ad: string, args?: Record<string, unknown>) => ertelenmisZincir((db) => pgRpc(db, ad, args)),
    auth: {
      getClaims: async () => ({ data: { claims: { sub: await kimlik() } }, error: null }),
      getUser: async () => ({ data: { user: { id: await kimlik() } }, error: null }),
      getSession: async () => ({ data: { session: { user: { id: await kimlik() } } }, error: null }),
      signOut: async () => ({ error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      admin: {
        listUsers: async () => {
          const db = await veritabani();
          await oturumAc(db, null);
          const { rows } = await db.query("select id, email from auth.users");
          return { data: { users: rows.map((r) => ({ ...r, user_metadata: {} })) }, error: null };
        },
        getUserById: async () => ({ data: { user: null }, error: null }),
        inviteUserByEmail: async () => ({ data: { user: null }, error: null }),
        generateLink: async () => ({ data: { properties: { action_link: "#" } }, error: null }),
        updateUserById: async () => ({ data: { user: null }, error: null }),
        deleteUser: async () => ({ data: null, error: null }),
      },
    },
    storage: {
      from: () => ({
        /*
          Dekont bağlantısı YETKİYE bakıyor: oturum kurucu değilse
          bağlantı üretilmiyor. Gerçek kova politikasının yerine
          geçmez — Storage yok — ama "yetkisiz hesap dekonta
          ulaşamıyor" kuralının arayüzdeki karşılığını sınatıyor.
        */
        createSignedUrls: async (yollar: string[]) => {
          const kim = kullanici === SAHIP ? KURUCU : kullanici ?? (await oturumKullanicisi());
          if (kim !== KURUCU) return { data: [], error: { message: "yetkisiz" } };
          return { data: yollar.map((p) => ({ path: p, signedUrl: `/onizleme-dekont?yol=${encodeURIComponent(p)}` })), error: null };
        },
        createSignedUrl: async (yol: string) => {
          const kim = kullanici === SAHIP ? KURUCU : kullanici ?? (await oturumKullanicisi());
          if (kim !== KURUCU) return { data: null, error: { message: "yetkisiz" } };
          return { data: { signedUrl: `/onizleme-dekont?yol=${encodeURIComponent(yol)}` }, error: null };
        },
        download: async () => ({ data: null, error: { message: "önizleme" } }),
        upload: async () => ({ data: null, error: null }),
        remove: async () => ({ data: null, error: null }),
        list: async () => ({ data: [], error: null }),
      }),
    },
    channel: () => {
      const kanal = { on: () => kanal, subscribe: () => kanal, unsubscribe: () => undefined };
      return kanal;
    },
    removeChannel: () => undefined,
  };
}
