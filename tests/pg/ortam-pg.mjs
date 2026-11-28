/*
  GERÇEK POSTGRESQL ORTAMI — İKİ BAĞIMSIZ OTURUM (28.11.2026).

  `tests/db` PGlite kullanıyor: gerçek PostgreSQL ama TEK bağlantı.
  Eşzamanlılık orada sınanamıyor — kilitlenme, bir oturumun ötekini
  beklemesi, READ COMMITTED'ta her ifadenin kendi anlık görüntüsünü
  alması. Fiyat yayımının kapsam kilidi tam olarak bunlara dayanıyor,
  yani "iki oturum arasında ne oluyor" sorusunun cevabı PGlite'ta
  ölçülemez.

  Bu modül geçici bir PostgreSQL kümesi kuruyor (initdb + pg_ctl),
  canlı şemayı ve bekleyen migration'ları tests/db ile AYNI SIRAYLA
  yüklüyor (ortam.mjs'ten okunuyor; iki yerde iki şema olmasın) ve
  istendiği kadar BAĞIMSIZ oturum açıyor. Oturumlar `psql` alt
  süreçleri: depoya bir istemci paketi eklemek gerekmiyor.

  Küme geçici bir dizinde, canlıya hiç dokunulmuyor. Postgres root
  olarak çalışmayı reddettiği için her şey `postgres` kullanıcısıyla
  koşuyor; bağlantı unix soketi + trust (ağ dinlenmiyor).

  Çalıştırma:  npm run test:pg
  Postgres yoksa testler ATLANIR (çıkış 0) ve nedeni yazılır — CI'da
  küme kurulu olmayabilir, ama "atlandı" ile "geçti" karışmamalı.
*/
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  BEKLEYEN_MIGRATIONLAR,
  MIGRATION_DIZINI,
  SEMA,
  SUPABASE_KABUGU,
  SUPABASE_VARSAYILAN_YETKI,
  yetkiSatirlari,
} from "../db/ortam.mjs";

/*
  SÜRÜM DİZİNİ ARANARAK bulunuyor: Debian/Ubuntu kurulumu
  /usr/lib/postgresql/<sürüm>/bin altına koyuyor ve sürüm makineden
  makineye değişiyor. Sabit bir liste 16'yı bulup 17'yi kaçırıyordu.
*/
const ADAY_DIZINLER = [
  ...(fs.existsSync("/usr/lib/postgresql")
    ? fs.readdirSync("/usr/lib/postgresql").sort().reverse().map((s) => `/usr/lib/postgresql/${s}/bin`)
    : []),
  "/usr/pgsql-17/bin",
  "/usr/pgsql-16/bin",
  "/opt/homebrew/bin",
  "/usr/bin",
  "/usr/local/bin",
];
const PG_BIN = ADAY_DIZINLER.find((d) => fs.existsSync(path.join(d, "initdb")));

/** Postgres bulunmadığında testler atlanacak; sebebi burada. */
export const POSTGRES_YOK = PG_BIN ? null : "initdb bulunamadı (PostgreSQL kurulu değil)";

const ARAC = (ad) => path.join(PG_BIN, ad);

/*
  Postgres root olarak çalışmaz. Kök kullanıcıyken her komut
  `postgres` kullanıcısına geçiliyor; başka bir kullanıcıyla
  koşuluyorsa (geliştirici makinesi) olduğu gibi çalıştırılıyor.
*/
const KOK_MU = typeof process.getuid === "function" && process.getuid() === 0;
const SERVIS_KULLANICISI = "postgres";

function kosut(komut, argumanlar, secenekler = {}) {
  const tam = KOK_MU
    ? ["su", [SERVIS_KULLANICISI, "-s", "/bin/bash", "-c", [komut, ...argumanlar].map((p) => `'${p}'`).join(" ")]]
    : [komut, argumanlar];
  const sonuc = spawnSync(tam[0], tam[1], { encoding: "utf8", ...secenekler });
  if (sonuc.status !== 0) {
    throw new Error(`${path.basename(komut)} düştü (${sonuc.status}): ${(sonuc.stderr || sonuc.stdout || "").slice(0, 800)}`);
  }
  return sonuc.stdout ?? "";
}

export const VERITABANI = "arvoos_esanzamanli";

/**
 * Geçici küme kurar, şemayı yükler ve soket dizinini döndürür.
 * Aynı süreçte ikinci çağrı var olan kümeyi kullanır.
 */
export async function kumeyiKur() {
  if (POSTGRES_YOK) throw new Error(POSTGRES_YOK);
  const kok = fs.mkdtempSync(path.join(os.tmpdir(), "arvoos-pg-"));
  const veri = path.join(kok, "veri");
  const soket = path.join(kok, "soket");
  fs.mkdirSync(soket);
  /* Küme dosyalarını servis kullanıcısı yazacak; sahiplik değişimi
     KÖK olarak yapılır (kosut servis kullanıcısına geçiyor ve o
     kendi dizinini okuyamıyordu). */
  if (KOK_MU) {
    spawnSync("/bin/chown", ["-R", `${SERVIS_KULLANICISI}:${SERVIS_KULLANICISI}`, kok]);
    spawnSync("/bin/chmod", ["755", kok]);
  }

  kosut(ARAC("initdb"), ["-D", veri, "-U", "postgres", "--auth-local=trust", "--auth-host=trust", "-E", "UTF8"]);
  /*
    Ayarlar KOMUT SATIRI yerine postgresql.conf'a yazılıyor: `pg_ctl
    -o "… -h '' …"` kök kullanıcıdan `su -c` ile geçerken tırnakları
    kaybediyor ve sunucu hiç kalkmıyordu. Ağ dinlenmiyor
    (listen_addresses boş), yalnızca unix soketi: test kümesi
    makinedeki hiçbir porta açılmıyor.
  */
  fs.appendFileSync(path.join(veri, "postgresql.conf"), [
    "",
    `unix_socket_directories = '${soket}'`,
    "listen_addresses = ''",
    "fsync = off",
    "full_page_writes = off",
    "",
  ].join("\n"));
  const gunluk = path.join(kok, "gunluk.txt");
  fs.writeFileSync(gunluk, "");
  if (KOK_MU) spawnSync("/bin/chown", [`${SERVIS_KULLANICISI}:${SERVIS_KULLANICISI}`, gunluk]);
  try {
    kosut(ARAC("pg_ctl"), ["-D", veri, "-l", gunluk, "-w", "start"]);
  } catch (hata) {
    /* Sunucu günlüğü olmadan "could not start server" hiçbir şey
       söylemiyor; nedeni mesaja ekleniyor. */
    const kayit = fs.existsSync(gunluk) ? fs.readFileSync(gunluk, "utf8").slice(-800) : "(günlük yok)";
    throw new Error(`${hata.message}\n--- sunucu günlüğü ---\n${kayit}`);
  }
  kosut(ARAC("createdb"), ["-h", soket, "-U", "postgres", VERITABANI]);

  const kapat = () => {
    try { kosut(ARAC("pg_ctl"), ["-D", veri, "-m", "immediate", "-w", "stop"]); } catch { /* zaten durmuş */ }
    try { fs.rmSync(kok, { recursive: true, force: true }); } catch { /* geçici dizin */ }
  };
  try {
    await semayiYukle(soket, kok);
  } catch (hata) {
    kapat();
    throw hata;
  }
  return { soket, kok, kapat };
}

/*
  ŞEMA tests/db İLE AYNI SIRAYLA: Supabase kabuğu → canlı şema →
  bekleyen migration'lar → yetkiler (önce Supabase varsayılanı, sonra
  dosyaların kendi grant/revoke satırları özgün sırasıyla). Sıranın
  gerekçesi ortam.mjs'te yazılı; burada kopyalanmıyor, aynı modülden
  okunuyor.
*/
async function semayiYukle(soket, kok) {
  const sema = fs.readFileSync(SEMA, "utf8");
  const bekleyen = BEKLEYEN_MIGRATIONLAR.map((ad) => fs.readFileSync(path.join(MIGRATION_DIZINI, ad), "utf8"));
  const yetkiler = [SUPABASE_VARSAYILAN_YETKI, ...[sema, ...bekleyen].flatMap((d) => yetkiSatirlari(d))].join("\n");
  const parcalar = [SUPABASE_KABUGU, sema, ...bekleyen, yetkiler];
  for (const [sira, sql] of parcalar.entries()) {
    const dosya = path.join(kok, `parca-${sira}.sql`);
    fs.writeFileSync(dosya, sql);
    if (KOK_MU) spawnSync("/bin/chmod", ["644", dosya]);
    kosut(ARAC("psql"), ["-h", soket, "-U", "postgres", "-d", VERITABANI, "-v", "ON_ERROR_STOP=1", "-q", "-f", dosya]);
  }
}

const BITTI = "__ARVO_BITTI__";

/**
 * BAĞIMSIZ bir oturum: kendi `psql` süreci, kendi arka ucu, kendi
 * işlemi. İki oturum aynı anda açık kalabiliyor — kilitlenmeyi ve
 * bekleyen bir işlemi ancak böyle ölçebiliyoruz.
 */
export class Oturum {
  constructor(soket, ad = "oturum") {
    this.ad = ad;
    this.cikti = "";
    this.hata = "";
    const argumanlar = ["-h", soket, "-U", "postgres", "-d", VERITABANI, "-X", "-q", "-A", "-t", "-f", "-"];
    this.surec = KOK_MU
      ? spawn("su", [SERVIS_KULLANICISI, "-s", "/bin/bash", "-c",
          [ARAC("psql"), ...argumanlar].map((p) => `'${p}'`).join(" ")], { stdio: ["pipe", "pipe", "pipe"] })
      : spawn(ARAC("psql"), argumanlar, { stdio: ["pipe", "pipe", "pipe"] });
    this.surec.stdout.setEncoding("utf8");
    this.surec.stderr.setEncoding("utf8");
    this.surec.stdout.on("data", (p) => { this.cikti += p; });
    this.surec.stderr.on("data", (p) => { this.hata += p; });
  }

  /**
   * SQL'i çalıştırır ve biter bitmez sonucu döndürür:
   * `{ satirlar, hata }`. Hata metni psql'in ERROR satırı — test
   * mesajın kendisini sınıyor.
   */
  calistir(sql) {
    const baslangicCikti = this.cikti.length;
    const baslangicHata = this.hata.length;
    this.surec.stdin.write(`${sql}\n\\echo ${BITTI}\n`);
    return new Promise((coz, red) => {
      const zamanAsimi = setTimeout(() => {
        clearInterval(sayac);
        red(new Error(`${this.ad}: 30 sn içinde bitmedi — ${sql.slice(0, 80)}`));
      }, 30_000);
      const sayac = setInterval(() => {
        if (!this.cikti.includes(BITTI, baslangicCikti)) return;
        clearInterval(sayac);
        clearTimeout(zamanAsimi);
        const ham = this.cikti.slice(baslangicCikti, this.cikti.indexOf(BITTI, baslangicCikti));
        const hata = this.hata.slice(baslangicHata).trim();
        coz({
          satirlar: ham.split("\n").map((s) => s.trim()).filter(Boolean),
          hata: hata || null,
        });
      }, 20);
    });
  }

  /**
   * SQL'i başlatır ama BİTMESİNİ BEKLEMEZ: kilide takılan bir
   * çağrının gerçekten beklediğini ancak böyle gösterebiliyoruz.
   */
  baslat(sql) {
    const sozu = this.calistir(sql);
    /* Beklerken düşerse testi değil, bekleyeni ilgilendiriyor. */
    sozu.catch(() => {});
    return sozu;
  }

  /** Söz verilen süre içinde bitmediyse "hâlâ bekliyor" demektir. */
  static async bekliyorMu(sozu, ms = 700) {
    const isaret = Symbol("bekliyor");
    const sonuc = await Promise.race([sozu, new Promise((c) => setTimeout(() => c(isaret), ms))]);
    return sonuc === isaret;
  }

  kapat() {
    try { this.surec.stdin.end(); } catch { /* kapanmış */ }
    this.surec.kill();
  }
}
