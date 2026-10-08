import vinext from "vinext";
import { defineConfig, type Plugin } from "vite";
import hostingConfig from "./.openai/hosting.json";
import { sites } from "./build/sites-vite-plugin";

const SITE_CREATOR_PLACEHOLDER_DATABASE_ID =
  "00000000-0000-4000-8000-000000000000";

const { d1, r2 } = hostingConfig;

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";

/*
  Windows'ta Google Fonts yolu (vinext 0.0.50 hatası, 1.x'te düzeltildi).

  vinext indirdiği yazı tipini CSS'e `C:/…/.vinext/fonts/…` diye eğik çizgiyle
  yazıyor, sonra bu yolu `/assets/_vinext_fonts` adresine çevirmek için ters
  eğik çizgili `C:\…\.vinext\fonts` arıyor; bulamıyor. Eskiden tarayıcı
  dosyayı diskten istiyor ("Not allowed to load local resource"), Inter hiç
  yüklenmiyor, sayfalar yedek yazı tipiyle görünüyordu. Çeviriyi burada
  yapıyoruz; dosyaları o adreste vinext'in kendi ara katmanı sunuyor.
  vinext 1.x'e geçince bu eklenti silinebilir.
*/
function windowsFontYolu(): Plugin {
  let diskYolu = "";
  return {
    name: "arvo:windows-font-yolu",
    configResolved(config) {
      diskYolu = `${config.root.replaceAll("\\", "/")}/.vinext/fonts`;
    },
    transform(code) {
      if (process.platform !== "win32" || !code.includes(diskYolu)) return null;
      return { code: code.split(diskYolu).join("/assets/_vinext_fonts"), map: null };
    },
  };
}

const localBindingConfig = {
  main: "./worker/index.ts",
  compatibility_flags: ["nodejs_compat"],
  // worker/index.ts görselleri `/_vinext/image` üzerinden env.ASSETS ile okuyup
  // env.IMAGES ile küçültüyor. Eskiden bu iki bağlama burada tanımlı değildi;
  // yerelde her görsel isteği "Cannot read properties of undefined (reading
  // 'fetch')" ile 500 dönüyor, logolar boş kutu görünüyordu. Canlı Vercel'de
  // `next build` kendi görsel ucunu kullandığı için bu yalnızca yereli etkiliyordu.
  assets: { binding: "ASSETS" },
  images: { binding: "IMAGES" },
  d1_databases: d1
    ? [
        {
          binding: d1,
          database_name: "site-creator-d1",
          database_id: SITE_CREATOR_PLACEHOLDER_DATABASE_ID,
        },
      ]
    : [],
  r2_buckets: r2
    ? [
        {
          binding: r2,
          bucket_name: "site-creator-r2",
        },
      ]
    : [],
};

export default defineConfig(async () => {
  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import("@cloudflare/vite-plugin");

  return {
    server: {
      host: "0.0.0.0",
      allowedHosts: ["terminal.local"],
      ...(isCodexSeatbeltSandbox
        ? { watch: { useFsEvents: false, usePolling: true } }
        : {}),
    },
    plugins: [
      vinext(),
      windowsFontYolu(),
      sites(),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        inspectorPort: false,
        config: localBindingConfig,
      }),
    ],
  };
});
