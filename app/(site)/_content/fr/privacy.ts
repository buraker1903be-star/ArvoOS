// Fransızca: privacy-en.ts'in çevirisi. Hukuki içerik aynı; bağlayıcı olan Türkçe metindir.
import { COMPANY } from "@/lib/site/routes";
import type { PrivacyContent } from "../privacy";

export const PRIVACY_FR: PrivacyContent = {
  meta: { title: "Politique de confidentialité", description: "Comment les données personnelles sont traitées sur le site arvo-os.com et via son formulaire de démo / contact, en application de la loi turque n° 6698 sur la protection des données personnelles (KVKK)." },
  hero: {
    eyebrow: "Confidentialité", title: "Politique de", subtitle: "confidentialité",
    lead: "Cette notice explique comment vos données personnelles sont traitées en application de la loi turque n° 6698 sur la protection des données personnelles (KVKK) lorsque vous visitez arvo-os.com et utilisez son formulaire de démo / contact.",
    actions: [],
  },
  updated: "Dernière mise à jour : 28 octobre 2026",
  sections: [
    { h: "1. Responsable du traitement", p: [
      "Cette traduction est fournie à titre informatif ; en cas de divergence, la version turque fait foi.",
      `Le responsable du traitement est ${COMPANY.legalName} (« Arvo »). Adresse : ${COMPANY.address.display}, Türkiye. E-mail : ${COMPANY.email}.`,
    ] },
    { h: "2. Données personnelles traitées", p: ["Lorsque vous envoyez le formulaire de démo / contact :"], list: [
      "Identité et coordonnées : nom et prénom, adresse e-mail, numéro de téléphone, nom de l’organisation (l’organisation et le téléphone sont facultatifs).",
      "Détails de la demande : le produit ou service qui vous intéresse, votre message, ainsi que la page et la langue depuis lesquelles le formulaire a été envoyé.",
      "Preuve de prise de connaissance : votre confirmation que vous avez lu cette notice.",
      "Sécurité : une empreinte de votre adresse IP, obtenue par hachage à sens unique et renouvelée chaque jour, utilisée pour prévenir les abus. L’adresse IP brute n’est pas conservée.",
    ] },
    { h: "3. Finalités", list: [
      "Recevoir et examiner vos demandes de démo, d’accès, d’information et de projet, et vous répondre",
      "Engager les processus de devis et de contrat lorsque vous le demandez",
      "Protéger le formulaire contre les envois automatisés et malveillants, et assurer la sécurité des informations",
      "Respecter les obligations légales",
    ] },
    { h: "4. Bases juridiques", p: ["Vos données personnelles sont traitées sur les bases juridiques suivantes, prévues à l’article 5(2) de la KVKK :"], list: [
      "(c) Le traitement est directement lié à la conclusion ou à l’exécution d’un contrat — répondre à votre demande et préparer démos et devis",
      "(f) L’intérêt légitime du responsable du traitement, à condition de ne pas porter atteinte à vos droits et libertés fondamentaux — sécurité du formulaire et gestion des demandes",
      "(ç) Le respect d’une obligation légale du responsable du traitement",
    ] },
    { h: "5. Mode de collecte", p: ["Les données sont collectées par voie électronique, auprès de vous via le formulaire du site, et automatiquement depuis votre navigateur lors de l’envoi du formulaire. Votre demande est enregistrée comme demande client dans le panneau ArvoOS propre à Arvo."] },
    { h: "6. Transferts", p: [
      "Vos données personnelles ne sont pas vendues et ne sont pas partagées avec des tiers à des fins de marketing.",
      "Les données sont stockées sur les serveurs des fournisseurs d’infrastructure cloud et de bases de données qui hébergent le site et le panneau ; ces serveurs peuvent être situés hors de Türkiye. Ces transferts sont effectués conformément à l’article 9 de la KVKK. Les données ne peuvent être communiquées aux autorités publiques habilitées que lorsque la loi l’exige.",
    ] },
    { h: "7. Durée de conservation", p: ["Les données du formulaire sont conservées aussi longtemps que nécessaire pour examiner votre demande et mener toute relation commerciale qui en découle, ainsi que pendant les durées imposées par la législation applicable ; elles sont ensuite supprimées, détruites ou anonymisées. Les empreintes IP de sécurité sont supprimées automatiquement en quelques jours."] },
    { h: "8. Cookies", p: ["Ce site n’utilise pas de cookies ni d’outils de suivi à des fins de publicité, d’analyse d’audience ou de profilage. Seuls sont utilisés des cookies techniques éventuellement nécessaires au fonctionnement sécurisé du site et un cookie de préférence qui mémorise la langue choisie (arvo_site_dil, un an)."] },
    { h: "9. Vos droits au titre de l’article 11 de la KVKK", p: ["En vous adressant au responsable du traitement, vous pouvez :"], list: [
      "Savoir si vos données personnelles sont traitées et, le cas échéant, demander des informations à ce sujet",
      "Connaître la finalité du traitement et savoir si les données sont utilisées conformément à celle-ci",
      "Connaître les tiers, en Türkiye ou à l’étranger, auxquels les données sont transférées",
      "Demander la rectification de données incomplètes ou inexactes",
      "Demander la suppression ou la destruction des données dans les conditions de l’article 7 de la KVKK",
      "Demander que les rectifications, suppressions et destructions soient notifiées aux tiers auxquels les données ont été transférées",
      "Vous opposer à un résultat défavorable découlant exclusivement d’une analyse automatisée",
      "Réclamer réparation du préjudice causé par un traitement illicite",
    ] },
    { h: "10. Comment exercer vos droits", p: [`Adressez vos demandes par e-mail à ${COMPANY.email} ou par écrit à ${COMPANY.address.display}, Türkiye. Les demandes sont traitées gratuitement dans un délai maximal de trente jours, selon leur nature (article 13 de la KVKK).`] },
    { h: "11. Visiteurs de l’Espace économique européen et du Royaume-Uni (RGPD)", p: [
      "Si vous vous trouvez dans l’EEE ou au Royaume-Uni et que nous vous proposons nos services, vos données personnelles sont également traitées conformément au Règlement général sur la protection des données (UE) 2016/679 (RGPD) et au UK GDPR. Le responsable du traitement est Arvo, comme indiqué à la section 1.",
      "Bases juridiques (art. 6, paragraphe 1, RGPD) : mesures précontractuelles — répondre à votre demande, préparer démonstrations et propositions (b) ; intérêt légitime — sécurité du formulaire et gestion des demandes (f) ; respect d’obligations légales (c).",
      "Vos données peuvent être traitées en Türkiye et sur des serveurs d’hébergeurs situés hors de l’EEE. Vous pouvez nous écrire pour obtenir des informations sur les garanties sur lesquelles reposent ces transferts. Adressez vos demandes par les canaux de la section 10 ; les demandes fondées sur le RGPD reçoivent une réponse dans un délai d’un mois.",
      "En vertu du RGPD, vous pouvez :",
    ], list: [
      "Accéder à vos données et en obtenir une copie (art. 15)",
      "Faire rectifier des données inexactes (art. 16) et les faire effacer (art. 17)",
      "Limiter le traitement (art. 18)",
      "Demander la portabilité de vos données (art. 20)",
      "Vous opposer au traitement fondé sur l’intérêt légitime (art. 21)",
      "Introduire une réclamation auprès de l’autorité de contrôle de la protection des données du pays de l’EEE où vous vivez ou travaillez ou, au Royaume-Uni, auprès de l’Information Commissioner’s Office (ICO)",
    ] },
    { h: "12. Modifications", p: ["Cette notice peut être mise à jour si nécessaire ; la version en vigueur est toujours publiée sur cette page."] },
  ],
};
