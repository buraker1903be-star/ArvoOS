// Fransızca: contact-en.ts'in çevirisi. Yapı ve veriler aynı; yalnızca metin çevrildi.
import { COMPANY, ROUTES } from "@/lib/site/routes";
import type { ContactContent } from "../contact";

export const CONTACT_FR: ContactContent = {
  meta: { title: "Contact & demandes de démo", description: `Contactez-nous pour une démo d’ArvoOS, ArvoLab ou ArvoBook, un projet de site web ou e-commerce, un accès produit ou un échange sur votre projet : ${COMPANY.email}.` },
  hero: {
    eyebrow: "Contact", title: "À votre écoute", subtitle: "pour votre prochaine idée.",
    lead: "Pour une démo produit, un accès au panneau ou un projet numérique sur mesure, remplissez le formulaire ou écrivez-nous directement — votre demande est transmise à l’équipe produit ou projet concernée.",
    actions: [],
  },
  formTitle: "Formulaire de démo & de contact",
  formLead: "Quelques informations suffisent. Choisissez le produit qui vous intéresse et décrivez brièvement votre besoin.",
  emailLabel: "E-mail", addressLabel: "Adresse", appsLabel: "Se connecter", privacyLabel: "Données personnelles",
  privacyText: "Les informations du formulaire sont traitées uniquement pour répondre à votre demande.",
  faq: {
    eyebrow: "FAQ", title: "Nous contacter",
    items: [
      { q: "Comment demander une démo ?", a: "Choisissez le produit qui vous intéresse dans le formulaire de cette page et décrivez votre besoin ; notre équipe reviendra vers vous." },
      { q: "Comment vous joindre autrement ?", a: `Envoyez un e-mail à ${COMPANY.email}.` },
      { q: "Mon organisation utilise déjà un panneau — où me connecter ?", a: "ArvoOS fonctionne sur app.arvo-os.com, ArvoLab sur lab.arvo-os.com et ArvoBook sur randevu.arvo-os.com ; si votre organisation dispose de son propre domaine, vous pouvez aussi vous y connecter." },
      { q: "Comment mes données de formulaire sont-elles utilisées ?", a: `Uniquement pour répondre à votre demande. Le détail figure dans la Politique de confidentialité (${ROUTES.privacy.fr}).` },
    ],
  },
};
