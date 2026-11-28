/*
  YEREL ÖNİZLEME İÇİN SAHTE SUPABASE İSTEMCİSİ (27.11.2026).

  Konsolun bütün ekranları verisini doğrudan Supabase'den okuyor ve
  `isPlatformOwner` bir oturuma bağlı: bu depoda `.env` yok, yani
  geliştirme makinesinde Yönetim Merkezi'nin HİÇBİR rotası
  açılamıyordu. Tasarım kabulü bu yüzden ya üretime ya da elle
  kurulmuş düzeneklere kalıyordu; düzenekler de üretim bileşeninden
  sapıyordu (fiyat yayım önizlemesi, otomasyon etiketleri — ikisi de
  yaşandı).

  `npm run onizleme` bu modülü `@/lib/supabase/*` yerine koyar
  (next.config.ts, YALNIZCA ARVOOS_ONIZLEME=1 ve geliştirme
  sunucusunda): sorgular örnek veriden (veri.ts) cevaplanır, yazmalar
  sessizce "başarılı" döner. ÜRETİMDE ASLA YÜKLENMEZ — bayrak üretim
  derlemesinde hata veriyor (next.config.ts), çünkü sahte istemcinin
  canlıya çıkması her sorgunun "başarılı" görünüp hiçbir şey
  yazmaması demek.

  Sorgu kurucusu yalnızca OKUMA için yeterli kadarını taklit ediyor:
  eq/neq/in/is süzer, order sıralar, limit/range keser, count/head
  sayar; ilike, or, not, gt/lt, contains ve ötekiler YOK SAYILIR (tüm
  satırlar döner). Önizlemenin amacı ekranın gerçek bileşenle nasıl
  göründüğü ve rotanın AÇILDIĞI; sorgunun doğruluğunu tests/db
  sınıyor.
*/
import { ORNEK, ORNEK_KULLANICI, ORNEK_RPC } from "./veri";

const ortam: Record<string, string | undefined> = typeof process === "undefined" ? {} : process.env;
/* Bilinmeyen tabloyu sessizce boş döndürmek "kayıt yok" ekranı
   üretiyor ve eksik örnek veri fark edilmiyordu. ONIZLEME_SESSIZ=1
   ile kapatılır. */
const SESSIZ = ortam.ONIZLEME_SESSIZ === "1";

type Satir = Record<string, unknown>;
type Sonuc = { data: unknown; error: null; count?: number | null };

function sorgu(tablo: string) {
  const kaynak = (ORNEK as Record<string, Satir[]>)[tablo];
  if (!kaynak && !SESSIZ) console.warn(`[onizleme] örnek veri yok: ${tablo}`);
  let satirlar: Satir[] = [...(kaynak ?? [])];
  let tek: "single" | "maybe" | null = null;
  let sayim = false;
  let yalnizSayim = false;
  const ham: Record<string, unknown> = {};
  /* Bilinmeyen süzgeçler zinciri bozmasın: her yöntem bu vekili döndürür. */
  const kurucu: Record<string, unknown> = new Proxy(ham, { get: (h, ad) => (ad in h ? h[ad as string] : () => kurucu) });
  const zincir = (f: (s: Satir[]) => Satir[]) => { satirlar = f(satirlar); return kurucu; };
  const simulasyon = (islem: string) => {
    console.warn(`[onizleme] SİMÜLASYON — ${islem} ${tablo}: hiçbir şey yazılmadı, çağrı başarılı görünecek.`);
    return kurucu;
  };
  /* Gömülü seçimde sütun adı "organizations(name)" gibi gelebiliyor. */
  const deger = (s: Satir, sutun: string) => s[sutun.split("->")[0]];
  Object.assign(ham, {
    select: (_s?: string, o?: { count?: string; head?: boolean }) => {
      if (o?.count) sayim = true;
      if (o?.head) yalnizSayim = true;
      return kurucu;
    },
    /* Örnekte o sütun hiç yoksa satır ELENMİYOR: kurum kimliği gibi
       alanları her örnek satıra yazmak zorunda kalmadan ekran
       dolsun. */
    eq: (c: string, v: unknown) => zincir((s) => s.filter((r) => deger(r, c) === undefined || deger(r, c) === v)),
    neq: (c: string, v: unknown) => zincir((s) => s.filter((r) => deger(r, c) !== v)),
    in: (c: string, v: unknown[]) => zincir((s) => s.filter((r) => deger(r, c) === undefined || v.includes(deger(r, c)))),
    is: (c: string, v: unknown) => zincir((s) => s.filter((r) => (v === null ? deger(r, c) == null : deger(r, c) === v))),
    order: (c: string, o?: { ascending?: boolean }) =>
      zincir((s) => [...s].sort((a, b) => (String(deger(a, c) ?? "") < String(deger(b, c) ?? "") ? -1 : 1) * (o?.ascending === false ? -1 : 1))),
    limit: (n: number) => zincir((s) => s.slice(0, n)),
    range: (a: number, b: number) => zincir((s) => s.slice(a, b + 1)),
    single: () => ((tek = "single"), kurucu),
    maybeSingle: () => ((tek = "maybe"), kurucu),
    /*
      YAZMALAR SİMÜLASYON. Önizlemede hiçbir şey kaydedilmiyor; çağrı
      yalnızca "başarılı" görünüyor. Bu sessiz başarı KANIT DEĞİL:
      "ödeme onaylandı" diye görünen bir ekran, gerçekte onaylanmış
      bir ödeme anlamına gelmiyor. Bu yüzden her yazma sunucu
      günlüğüne SİMÜLASYON damgasıyla yazılıyor ve ekranda da
      önizleme şeridi duruyor (app/panel/onizleme-serit.tsx).
    */
    insert: () => simulasyon("insert"),
    update: () => simulasyon("update"),
    upsert: () => simulasyon("upsert"),
    delete: () => simulasyon("delete"),
    then: (coz: (s: Sonuc) => unknown) => {
      const sonuc: Sonuc = yalnizSayim
        ? { data: null, error: null, count: satirlar.length }
        : { data: tek ? (satirlar[0] ?? null) : satirlar, error: null, count: sayim ? satirlar.length : null };
      return Promise.resolve(sonuc).then(coz);
    },
  });
  return kurucu;
}

export function sahteIstemci() {
  return {
    from: (tablo: string) => sorgu(tablo),
    rpc: (ad: string) => {
      if (!(ad in ORNEK_RPC) && !SESSIZ) console.warn(`[onizleme] örnek RPC yok: ${ad}`);
      const sonuc = { data: (ORNEK_RPC as Record<string, unknown>)[ad] ?? null, error: null };
      /*
        RPC zinciri de sorgu zinciri gibi uzayabiliyor
        (`.select().order().order().range()` — bildirim listesi böyle
        okuyor). Bilinmeyen her yöntem vekille zinciri sürdürüyor;
        eskiden `range` yoktu ve Bildirimler ekranı düşüyordu.
      */
      const ham: Record<string, unknown> = {};
      const kurucu: Record<string, unknown> = new Proxy(ham, {
        get: (h, ad) => (ad in h ? h[ad as string] : () => kurucu),
      });
      Object.assign(ham, {
        then: (coz: (s: typeof sonuc) => unknown) => Promise.resolve(sonuc).then(coz),
      });
      return kurucu;
    },
    auth: {
      /* panel-context getClaims() kullanıyor; eski yollar getUser(). */
      getClaims: async () => ({ data: { claims: { sub: ORNEK_KULLANICI.id, email: ORNEK_KULLANICI.email } }, error: null }),
      getUser: async () => ({ data: { user: ORNEK_KULLANICI }, error: null }),
      getSession: async () => ({ data: { session: { user: ORNEK_KULLANICI } }, error: null }),
      signOut: async () => ({ error: null }),
      signInWithPassword: async () => ({ data: { user: ORNEK_KULLANICI }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      /*
        YÖNETİCİ UÇLARI (admin). Kullanıcılar ekranı
        `auth.admin.listUsers` çağırıyor; sahte istemcide yoktu ve
        sayfa "Bir sorun oluştu" ile düşüyordu — HTTP 200 döndüğü ve
        hata istemcide çizildiği için kabul betiği de temiz
        sanıyordu (27.11.2026). Örnek kullanıcılar ORNEK.auth_users
        satırlarından.
      */
      admin: {
        listUsers: async ({ page = 1 } = {}) => ({
          data: { users: page === 1 ? ((ORNEK.auth_users ?? []) as unknown[]) : [] },
          error: null,
        }),
        getUserById: async (id: string) => ({
          data: { user: ((ORNEK.auth_users ?? []) as { id: string }[]).find((u) => u.id === id) ?? null },
          error: null,
        }),
        inviteUserByEmail: async () => ({ data: { user: null }, error: null }),
        generateLink: async () => ({ data: { properties: { action_link: "#" } }, error: null }),
        updateUserById: async () => ({ data: { user: null }, error: null }),
        deleteUser: async () => ({ data: null, error: null }),
      },
    },
    storage: {
      from: () => ({
        createSignedUrl: async () => ({ data: { signedUrl: "#" }, error: null }),
        createSignedUrls: async () => ({ data: [], error: null }),
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
