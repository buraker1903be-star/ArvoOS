// Fransızca: legal.ts'teki *_EN metinlerinin çevirisi. Hukuki içerik aynı; bağlayıcı olan Türkçe metindir.
import { COMPANY, PRODUCT_APPS, productList, ROUTES } from "@/lib/site/routes";
import type { PrivacyContent } from "../privacy";

const majFr = "Dernière mise à jour : 30 septembre 2026";
const avertissement = "Cette traduction est fournie à titre informatif ; en cas de divergence, la version turque fait foi.";

/** Künyenin dolu satırları; boş alan satır üretmez (legal.ts'teki kunye ile aynı kural). */
function kunye(): string[] {
  const satirlar: [string, string][] = [
    ["Raison sociale", COMPANY.legalName],
    ["Adresse", COMPANY.address.display],
    ["E-mail", COMPANY.email],
    ["Téléphone", COMPANY.phone],
    ["Centre des impôts", COMPANY.taxOffice],
    ["Numéro fiscal", COMPANY.taxNumber],
    ["MERSİS", COMPANY.mersis],
  ];
  return satirlar.filter(([, deger]) => deger).map(([ad, deger]) => `${ad} : ${deger}`);
}

const produits = productList("fr");
const erisimSatirlari = Object.values(PRODUCT_APPS).map((u) => `${u.name} : ${u.host}`);

export const DISTANCE_SALES_FR: PrivacyContent = {
  meta: {
    title: "Contrat de vente à distance",
    description: `Contrat de vente à distance des services d’abonnement ArvoOS (${produits}) : parties, objet, prix, paiement, exécution et rétractation.`,
  },
  hero: {
    eyebrow: "Vente à distance", title: "Contrat de", subtitle: "vente à distance",
    lead: `Ce contrat s’applique à la vente en ligne des services logiciels par abonnement d’ArvoOS (${produits} et produits ajoutés ultérieurement).`,
    actions: [],
  },
  updated: majFr,
  sections: [
    { h: "1. Parties", p: [avertissement, "Prestataire de services (Vendeur) :"], list: kunye() },
    { h: "", p: ["Abonné (Acheteur) : la personne physique ou morale qui souscrit l’abonnement et pour laquelle un compte est ouvert."] },
    { h: "2. Objet", p: [`L’abonnement à un ou plusieurs des services ${produits}, ainsi que les droits et obligations des parties au titre de la loi turque n° 6502 relative à la protection des consommateurs et du Règlement sur les contrats à distance. Les services sont hébergés dans le cloud et utilisés dans un navigateur ; aucun bien physique n’est livré.`] },
    { h: "3. Prix et paiement", list: [
      `Le prix de l’abonnement est le prix catalogue publié sur ${ROUTES.pricing.fr} ; pour les offres établies sur devis, il s’agit du montant indiqué dans l’offre.`,
      "Les montants sont exprimés dans la devise indiquée lors de la commande (livres turques, dollars américains ou euros). Les prix catalogue en livres turques incluent la TVA ; les prix en dollars américains et en euros s’entendent hors TVA et hors taxes sur les ventes, appliquées sur la facture selon les règles en vigueur.",
      "Les abonnements mensuels sont facturés au début de chaque période. Les abonnements annuels sont facturés une seule fois au début de la période de 12 mois, pour 10 mois de redevance.",
      "En cas de dépassement des utilisateurs, agences, boutiques ou produits inclus dans une offre, seuls les frais d’options publiés sur la même page s’appliquent ; le prix de l’offre lui-même ne change pas.",
      "Le paiement s’effectue par carte de crédit/débit via le prestataire de paiement du Vendeur, ou par virement bancaire. Les données de carte ne sont pas conservées par le Vendeur.",
      "Il n’y a aucun prélèvement récurrent automatique ; chaque période est réglée via un lien que l’abonné valide.",
    ] },
    { h: "4. Modification des prix et des offres", list: [
      "Le Vendeur peut mettre à jour ses prix catalogue. Une modification de prix n’affecte pas la période en cours (déjà payée) de l’abonné.",
      "Les modifications sont annoncées à l’adresse e-mail enregistrée de l’abonné au moins 30 jours à l’avance et ne s’appliquent qu’à partir de la période commençant après cette notification. L’abonné qui n’accepte pas le nouveau tarif peut résilier en fin de période.",
      "Le passage à une offre supérieure prend effet le jour de la demande ; seule la différence pour les jours restants de la période est facturée.",
      "Le passage à une offre inférieure prend effet à la fin de la période en cours ; aucun remboursement n’est dû pour une période déjà commencée.",
    ] },
    { h: "5. Exécution", p: [`Le compte est mis à disposition dans un délai d’un jour ouvré après confirmation du paiement, généralement immédiatement. Voir ${ROUTES.delivery.fr}.`] },
    { h: "6. Droit de rétractation", p: [
      "L’Acheteur peut se rétracter dans un délai de 14 jours sans avoir à motiver sa décision.",
      "Conformément à l’article 15/1-(ğ) du Règlement sur les contrats à distance, le droit de rétractation ne s’applique pas aux services exécutés instantanément sous forme électronique dont l’exécution a commencé avec l’accord de l’Acheteur — ce qui est le cas lorsque le compte est ouvert immédiatement à la demande de l’abonné.",
    ] },
    { h: "7. Résiliation et remboursement", p: [`Ces conditions figurent séparément sur ${ROUTES.refund.fr} et font partie intégrante du présent contrat.`] },
    { h: "8. Données et confidentialité", p: [`Les données saisies par l’abonné appartiennent à l’abonné. Le traitement des données personnelles est décrit sur ${ROUTES.privacy.fr}.`] },
    { h: "9. Responsabilité", p: ["Le Vendeur fournit le service avec une diligence raisonnable mais ne garantit pas un fonctionnement ininterrompu ou exempt d’erreurs. Sa responsabilité est limitée aux redevances d’abonnement payées au cours des 12 derniers mois."] },
    { h: "10. Droit applicable et litiges", p: ["Le droit turc s’applique. Les commissions d’arbitrage des consommateurs et les tribunaux de la consommation sont compétents dans les limites financières fixées par le ministère du Commerce ; à défaut, les tribunaux d’İstanbul."] },
  ],
};

export const REFUND_FR: PrivacyContent = {
  meta: {
    title: "Politique d’annulation et de remboursement",
    description: "Conditions de résiliation, de rétractation et de remboursement des services d’abonnement ArvoOS, y compris les essais, les fins de période et les prélèvements erronés.",
  },
  hero: {
    eyebrow: "Annulation", title: "Politique d’annulation", subtitle: "et de remboursement",
    lead: `Fonctionnement des résiliations et des remboursements pour les produits d’abonnement d’ArvoOS (${produits} et produits ajoutés ultérieurement).`,
    actions: [],
  },
  updated: majFr,
  sections: [
    { h: "1. Résiliation d’un abonnement", p: [avertissement], list: [
      `L’abonnement peut être résilié depuis le panneau ou en écrivant à ${COMPANY.email}.`,
      "La résiliation prend effet à la fin de la période payée ; le service reste disponible jusque-là.",
      "Aucun prélèvement automatique n’est effectué après la résiliation.",
      "Un abonnement annuel court sur 12 mois ; une résiliation avant la fin de l’année est réglée selon la section 5.",
    ] },
    { h: "2. Essais", p: ["Les essais sont gratuits et ne se transforment pas automatiquement en abonnement payant. Si aucun paiement n’est effectué, le compte est simplement fermé."] },
    { h: "3. Droit de rétractation", p: ["Les consommateurs peuvent se rétracter dans un délai de 14 jours. Lorsque le compte est ouvert immédiatement à la demande de l’abonné, l’exécution a commencé et le droit de rétractation ne s’applique plus (Règlement sur les contrats à distance, art. 15/1-(ğ))."] },
    { h: "4. Remboursements", list: [
      "Lorsque la rétractation s’applique, le montant est remboursé dans un délai de 14 jours sur le moyen de paiement d’origine.",
      "Pour les abonnements mensuels, aucun remboursement partiel n’est effectué pour une période déjà commencée ; le service reste disponible jusqu’à la fin de cette période.",
      "Pour les abonnements annuels, la résiliation anticipée est réglée selon la section 5 ; la part non utilisée du montant prépayé est remboursée.",
    ] },
    { h: "5. Résiliation anticipée d’une offre annuelle", list: [
      "Un abonnement annuel est payé d’avance : 10 mois de redevance pour 12 mois d’utilisation.",
      "Si l’abonné résilie avant la fin de l’année, les mois pendant lesquels le service est resté disponible sont recalculés au prix catalogue mensuel. Ce montant est déduit de la somme payée et le solde restant est remboursé. Tout mois commencé est compté comme un mois entier.",
      "Le calcul ne peut pas être négatif : si la valeur des mois utilisés au tarif mensuel dépasse le montant prépayé, l’abonné ne doit rien de plus — il n’y a simplement pas de remboursement.",
      "Les remboursements sont effectués dans un délai de 14 jours à compter de la demande, sur le moyen de paiement d’origine.",
    ] },
    { h: "6. Changements d’offre", list: [
      "Le passage à une offre supérieure prend effet le jour de la demande ; seule la différence pour les jours restants de la période est facturée et aucun remboursement n’est dû.",
      "Le passage à une offre inférieure prend effet à la fin de la période en cours ; aucun remboursement n’est effectué pour une période déjà commencée.",
      "Si un produit est entièrement abandonné alors qu’il faisait l’objet d’une offre annuelle, la section 5 s’applique.",
    ] },
    { h: "7. Prélèvements erronés ou en double", p: [`Remboursés intégralement dès leur identification, sans condition. Contact : ${COMPANY.email}.`] },
    { h: "8. Interruptions imputables à ArvoOS", p: ["Si le service est indisponible pendant une période prolongée du fait d’ArvoOS, le montant correspondant est remboursé ou crédité sur la période suivante, sur demande."] },
  ],
};

export const DELIVERY_FR: PrivacyContent = {
  meta: {
    title: "Livraison et exécution",
    description: "Quand les comptes sont ouverts, comment l’accès est fourni, et pourquoi il n’y a pas de livraison physique pour les services d’abonnement ArvoOS.",
  },
  hero: {
    eyebrow: "Livraison", title: "Livraison", subtitle: "et exécution",
    lead: `Les produits ArvoOS (${produits} et produits ajoutés ultérieurement) sont hébergés dans le cloud : il n’y a pas de livraison physique ; le service est exécuté dès que le compte est mis à disposition.`,
    actions: [],
  },
  updated: majFr,
  sections: [
    { h: "1. Aucune livraison physique", p: [avertissement, "Les services vendus sont numériques. Il n’y a ni expédition, ni frais de livraison, ni adresse de livraison ; le service est fourni via Internet."] },
    { h: "2. Ouverture du compte", list: [
      "Dans un délai d’un jour ouvré après confirmation du paiement, généralement immédiatement.",
      "Lorsqu’un travail de mise en place est convenu (utilisateurs, paramétrage des modules, reprise des données), le délai est indiqué dans l’offre.",
      "L’utilisateur autorisé reçoit par e-mail un lien de connexion et une étape de création de mot de passe.",
    ] },
    { h: "3. Adresses d’accès", p: ["Les services s’utilisent dans un navigateur aux adresses suivantes :"], list: erisimSatirlari },
    { h: "4. Prérequis", p: ["Un navigateur à jour et une connexion Internet ; rien à installer. Les maintenances planifiées sont annoncées à l’avance."] },
    { h: "5. Problèmes", p: [`Si votre compte n’est pas ouvert dans les délais ou si vous ne parvenez pas à vous connecter, contactez ${COMPANY.email}.`] },
  ],
};
