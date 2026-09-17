// Birim testleri için modül çözümleyici.
//
// Node 24 TypeScript'i yerel olarak sıyırıyor, yani lib/*.ts dosyaları derleme
// adımı olmadan doğrudan import edilebiliyor. Eksik olan tek şey çözümleme:
// kaynak kod Next'in paketleyici kurallarını kullanıyor (uzantısız "./routes"
// ve "@/lib/..." takma adı), Node ESM ise tam dosya yolu istiyor. Bu kanca
// ikisini de tsconfig.json'daki paths ile aynı şekilde karşılar.
//
// Amaç kasıtlı olarak dar: Next, React ya da Supabase'e dokunan modüller
// buradan çalışmaz; birim testleri zaten saf mantık modülleri içindir
// (tutar, tarih, prim dağıtımı, yetki, host kuralları).
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve as resolvePath } from "node:path";

const projectRoot = dirname(fileURLToPath(import.meta.url)).replace(/\/tests$/, "");
const EXTENSIONS = [".ts", ".tsx", ".mjs", ".js", "/index.ts", "/index.tsx"];

function firstExisting(basePath) {
  if (existsSync(basePath) && !existsSync(`${basePath}/`)) return basePath;
  for (const extension of EXTENSIONS) {
    const candidate = `${basePath}${extension}`;
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    // "@/lib/site/routes" → <proje kökü>/lib/site/routes.ts
    if (specifier.startsWith("@/")) {
      const found = firstExisting(resolvePath(projectRoot, specifier.slice(2)));
      if (found) return { url: pathToFileURL(found).href, shortCircuit: true };
    }
    // "./routes" → aynı klasörde routes.ts
    if (specifier.startsWith(".") && context.parentURL?.startsWith("file:")) {
      const found = firstExisting(resolvePath(dirname(fileURLToPath(context.parentURL)), specifier));
      if (found) return { url: pathToFileURL(found).href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});
