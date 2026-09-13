// Hakkımızda — Türkçe.
import { COMPANY, ROUTES } from "@/lib/site/routes";
import type { SubContent } from "./types";

const R = (id: keyof typeof ROUTES) => ROUTES[id].tr;

export const ABOUT_TR: SubContent = {
  id: "about",
  meta: { title: "Hakkımızda", description: `Arvo, ${COMPANY.legalName} şirketinin yazılım markasıdır. ArvoOS, ArvoLab ve Arc’ı geliştirir; web tasarımı ve özel yazılım hizmetleri sunar.` },
  hero: {
    eyebrow: "Hakkımızda", title: "Karmaşık işleri", subtitle: "sadeleştiriyoruz.",
    lead: `Arvo, İstanbul merkezli ${COMPANY.legalName} şirketinin yazılım markasıdır; kurumlar, araştırmacılar ve mağazalar için güçlü ama sakin dijital çalışma deneyimleri tasarlar.`,
    actions: [{ label: "Bizimle tanışın", href: R("contact"), variant: "gold" }],
  },
  cards: {
    eyebrow: "Tek vizyon, büyüyen ekosistem", title: "Neye inanıyoruz?",
    lead: "ArvoOS ile işletmelerin operasyonunu, ArvoLab ile akademik üretimi, Arc ile mağazaların ürün ve sipariş yönetimini dönüştürüyoruz — hepsi aynı marka dili ve kalite standardıyla.",
    items: [
      { title: "İnsanı merkeze alan teknoloji", text: "Teknik karmaşıklığı kullanıcıya yüklemeden, karar vermeyi ve üretmeyi kolaylaştıran deneyimler." },
      { title: "Detaylarda tavizsiz kalite", text: "Arayüzden altyapıya kadar güvenilir, anlaşılır ve uzun ömürlü sistemler." },
      { title: "Birlikte büyüyen ürünler", text: "Yeni ürün ve hizmetlerin doğal biçimde eklenebildiği ölçeklenebilir bir ekosistem." },
    ],
  },
  steps: {
    eyebrow: "Nasıl çalışırız?", title: "İş yapış biçimlerini yeniden tasarlıyoruz.",
    lead: "Yazılımı yalnızca bir araç olarak değil; ekibin çalışma kültürünü, hızını ve hizmet kalitesini güçlendiren bir sistem olarak görüyoruz.",
    items: [
      { title: "Önce süreci anlarız", text: "Her projeye, işin gerçekte nasıl yürüdüğünü öğrenerek başlarız." },
      { title: "Bütünü birlikte tasarlarız", text: "Marka, deneyim ve teknolojiyi tek bir bütün olarak ele alırız." },
      { title: "Şeffaf ve sürdürülebilir çalışırız", text: "Kararları görünür, kapsamı anlaşılır ve iş birliğini uzun soluklu tutarız." },
    ],
  },
  band: {
    eyebrow: "Şirket bilgileri", title: "Arvo’nun arkasındaki şirket.",
    items: [COMPANY.legalName, COMPANY.address.display, COMPANY.email],
  },
  faq: { eyebrow: "Sık sorulan sorular", title: "Arvo hakkında", items: [
    { q: "Arvo hangi şirkete ait?", a: `Arvo, ${COMPANY.legalName} şirketinin markasıdır.` },
    { q: "Arvo nerede?", a: `${COMPANY.address.display}.` },
    { q: "Arvo ile ArvoOS arasındaki fark nedir?", a: "Arvo markanın ve arvo-os.com sitesinin adıdır; ArvoOS bu markanın ürünlerinden biridir. Diğer ürünler ArvoLab ve Arc’tır." },
    { q: "Arvo ile nasıl iletişime geçerim?", a: `İletişim sayfasındaki formu kullanabilir veya ${COMPANY.email} adresine yazabilirsiniz.` },
  ] },
  cta: { title: "Birlikte daha iyi bir sistem kuralım.", actions: [{ label: "İletişime geçin", href: R("contact"), variant: "gold" }, { label: "Ürünler", href: R("arvoos"), variant: "ghost" }] },
  org: true,
};
