// Fransızca: randevu-en.ts'in çevirisi (ArvoCal). Yapı ve veriler aynı; yalnızca metin çevrildi — yalnızca yayındaki özellikler.
import { PRODUCT_APPS, ROUTES } from "@/lib/site/routes";
import type { ProductContent } from "../types";

const R = (id: keyof typeof ROUTES) => ROUTES[id].fr;

export const RANDEVU_FR: ProductContent = {
  id: "randevu",
  name: "ArvoCal",
  category: "BusinessApplication",
  appUrl: PRODUCT_APPS.randevu.url,
  featureList: [
    "Page de réservation en ligne",
    "Agenda par collaborateur",
    "Prestations et personnel",
    "Horaires de travail et congés",
    "Fiches clients",
    "Rappels WhatsApp",
  ],
  meta: {
    title: "ArvoCal — Gestion des rendez-vous en salon",
    description:
      "Réservation en ligne pour salons de coiffure et instituts de beauté : vos clients choisissent eux-mêmes la prestation, le coiffeur et l’horaire ; agenda par collaborateur, horaires de travail et congés, rappels WhatsApp.",
  },
  hero: {
    eyebrow: "ArvoCal · Gestion des rendez-vous en salon",
    title: "Laissez la page de réservation",
    subtitle: "répondre au téléphone.",
    lead:
      "Vos clients réservent eux-mêmes et le rendez-vous arrive aussitôt dans votre agenda. Les créneaux s’ouvrent selon qui réalise quelle prestation, et un rendez-vous en conflit n’entre jamais dans le système.",
    actions: [
      { label: "Voir les tarifs", href: R("pricing"), variant: "gold" },
      { label: "Ouvrir le panneau", href: PRODUCT_APPS.randevu.url, external: true, variant: "ghost" },
    ],
  },
  features: {
    eyebrow: "Fonctionnalités",
    title: "La journée du salon sur un seul écran.",
    lead:
      "Un rendez-vous pris par téléphone finit dans un carnet papier, le carnet est mal lu, les horaires se chevauchent. ArvoCal reconstruit cette chaîne depuis le début.",
    items: [
      {
        title: "Page de réservation en ligne",
        text: "Le client choisit la prestation, le coiffeur — ou « sans préférence » — et l’horaire. Aucune inscription : il est identifié par son numéro de téléphone et reçoit un lien d’annulation.",
      },
      {
        title: "Agenda par collaborateur",
        text: "Ajoutez, déplacez et annulez des rendez-vous. L’agenda s’affiche collaborateur par collaborateur : qui est disponible, et quand, se voit d’un coup d’œil.",
      },
      {
        title: "Prestations et personnel",
        text: "La durée d’une prestation, le temps de battement qui la suit et la personne qui la réalise se définissent en un seul endroit.",
      },
      {
        title: "Horaires de travail et congés",
        text: "Les horaires hebdomadaires se saisissent à l’heure locale du salon. Les congés peuvent concerner une personne ou tout le salon ; aucun créneau ne s’ouvre sur cette période.",
      },
      {
        title: "Les conflits sont bloqués par la base de données",
        text: "Un rendez-vous en conflit pour le même coiffeur — temps de battement compris — est rejeté au niveau de la base de données. « Vérifier d’abord, puis enregistrer » n’est pas jugé suffisant.",
      },
      {
        title: "Rappels WhatsApp",
        text: "La liste des rappels du jour est prête dans le panneau et s’envoie depuis WhatsApp en un geste. Si le salon a connecté son propre numéro, le message vient du salon et non d’ArvoOS.",
      },
    ],
  },
  flow: {
    eyebrow: "Premiers pas",
    title: "La mise en place se fait en une séance.",
    lead: "Votre adresse de réservation fonctionne dès que vos prestations et votre personnel sont définis.",
    steps: [
      { title: "Décrivez le salon", text: "L’assistant de configuration vous demande, dans l’ordre, prestations, personnel et horaires de travail." },
      { title: "Partagez votre adresse", text: "Ajoutez votre page de réservation à votre profil Instagram, à votre statut WhatsApp ou à votre carte de visite." },
      { title: "Suivez l’agenda", text: "Les réservations arrivent dans l’agenda ; la liste des rappels est prête dès le début de la journée." },
    ],
  },
  audience: {
    eyebrow: "Pour qui",
    title: "Tout salon qui fonctionne sur rendez-vous.",
    items: [
      { title: "Coiffeurs et barbiers", text: "Une journée pleine par fauteuil, pour les salons qui préfèrent raccrocher et se remettre au travail." },
      { title: "Instituts de beauté", text: "Des équipes qui gèrent sur le même agenda des prestations de durées et de battements différents." },
      { title: "Soins et suivi", text: "Des établissements qui ouvrent des créneaux selon l’expertise de chacun, et où les congés changent souvent." },
    ],
  },
  faq: {
    eyebrow: "Questions fréquentes",
    title: "À propos d’ArvoCal",
    items: [
      { q: "Les clients doivent-ils s’inscrire ?", a: "Non. Le client choisit une prestation, un coiffeur et un horaire, puis saisit son numéro de téléphone ; il est identifié par ce numéro et reçoit un lien d’annulation." },
      { q: "Deux rendez-vous peuvent-ils tomber sur le même créneau ?", a: "Non. Un rendez-vous en conflit pour le même coiffeur — temps de battement compris — est rejeté au niveau de la base de données, et non par un simple contrôle de l’interface." },
      { q: "Comment définir les horaires de travail et les congés ?", a: "Les horaires hebdomadaires se saisissent à l’heure locale du salon. Les congés peuvent concerner un seul collaborateur ou tout le salon ; aucun créneau ne s’ouvre sur cette période." },
      { q: "De qui vient le rappel ?", a: "La liste des rappels du jour est préparée dans le panneau et s’envoie depuis WhatsApp en un geste. Si le salon a connecté son propre numéro WhatsApp, le rappel vient du salon ; sinon, du numéro partagé d’ArvoOS." },
      { q: "Combien cela coûte-t-il ?", a: `Les prix catalogue mensuels et annuels sont publiés sur ${R("pricing")}.` },
    ],
  },
  cta: {
    title: "Prêt à ranger le carnet papier ?",
    lead: "Nous le mettons en place avec vous ; une fois vos prestations et votre personnel définis, votre page de réservation ouvre le jour même.",
    actions: [
      { label: "Demander une démo", href: `${R("contact")}?interest=randevu`, variant: "gold" },
      { label: "Tarifs", href: R("pricing"), variant: "ghost" },
    ],
  },
};
