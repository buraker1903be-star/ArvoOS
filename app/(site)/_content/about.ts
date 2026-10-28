// Hakkımızda — Türkçe.
import { COMPANY, ROUTES } from "@/lib/site/routes";
import type { SubContent } from "./types";

const R = (id: keyof typeof ROUTES) => ROUTES[id].tr;

export const ABOUT_TR: SubContent = {
  id: "about",
  meta: { title: "Hakkımızda", description: `ArvoOS, ${COMPANY.legalName} şirketinin yazılım markasıdır. Markayla aynı adı taşıyan işletme işletim sistemini, ArvoLab’i ve ArvoBook’u geliştirir; web ve e-ticaret sitesi tasarımı ile özel yazılım hizmetleri sunar.` },
  hero: {
    eyebrow: "Hakkımızda", title: "Karmaşık işleri", subtitle: "sadeleştiriyoruz.",
    lead: `ArvoOS, İstanbul merkezli ${COMPANY.legalName} şirketinin yazılım markasıdır; kurumlar, araştırmacılar ve salonlar için güçlü ama sakin dijital çalışma deneyimleri tasarlar.`,
    actions: [{ label: "Bizimle tanışın", href: R("contact"), variant: "gold" }],
  },
  cards: {
    eyebrow: "Tek vizyon, büyüyen ekosistem", title: "Neye inanıyoruz?",
    lead: "ArvoOS ile işletmelerin operasyonunu, ArvoLab ile akademik üretimi, ArvoBook ile salonların randevu defterini dönüştürüyoruz — hepsi aynı marka dili ve kalite standardıyla.",
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
    eyebrow: "Şirket bilgileri", title: "ArvoOS’un arkasındaki şirket.",
    items: [COMPANY.legalName, COMPANY.address.display, COMPANY.email],
  },
  faq: { eyebrow: "Sık sorulan sorular", title: "ArvoOS hakkında", items: [
    { q: "ArvoOS hangi şirkete ait?", a: `ArvoOS, ${COMPANY.legalName} şirketinin markasıdır.` },
    { q: "ArvoOS nerede?", a: `${COMPANY.address.display}.` },
    { q: "ArvoOS bir şirket mi, ürün mü?", a: "ArvoOS şirketin markasıdır (arvo-os.com da web sitesidir); aynı zamanda markanın işletme işletim sisteminin adıdır. Diğer ürünler ArvoLab ve ArvoBook’tur." },
    { q: "ArvoOS ile nasıl iletişime geçerim?", a: `İletişim sayfasındaki formu kullanabilir veya ${COMPANY.email} adresine yazabilirsiniz.` },
  ] },
  cta: { title: "Birlikte daha iyi bir sistem kuralım.", actions: [{ label: "İletişime geçin", href: R("contact"), variant: "gold" }, { label: "Ürünler", href: R("arvoos"), variant: "ghost" }] },
  org: true,
};
