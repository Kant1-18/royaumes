# Revue de sécurité de la Forge : contrôle d'accès et intégrité des ressources et des objets

- Date : 2026-10-23
- Périmètre : API du module Forge, gestionnaires de ses messages, saga de paiement et de compensation avec le Village, mouvements d'objets demandés par le Marché, canal temps réel de l'atelier.
- Références : OWASP Top 10 (A01 Broken Access Control, A04 Insecure Design, A08 Software and Data Integrity Failures).

| N° | Exigence | Vérification | Constat | Statut |
| --- | --- | --- | --- | --- |
| F1 | Un joueur ne commande et n'annule qu'en son propre nom | Lecture de `api.ts` : le joueur est toujours `c.var.userId` ; commande envoyée avec `playerId: 'bob'` dans le corps | Aucune route ne lit d'identifiant de joueur ; le champ ajouté est ignoré, et la commande est attribuée au joueur connecté. | conforme |
| F2 | Toutes les routes de la Forge sont réservées aux joueurs connectés | Test « refuse une requête anonyme (401) » ; test « refuse d'annuler la commande d'un autre joueur, ou une commande inconnue (404) » | Les tests passent : chaque route, annulation comprise, répond 401 sans session. | conforme |
| F3 | Un joueur ne peut pas annuler la commande d'un autre joueur, ni savoir si elle existe | Test « refuse d'annuler la commande d'un autre joueur, ou une commande inconnue (404) » ; comparaison des deux réponses | La commande est cherchée dans l'atelier du joueur connecté : les deux réponses sont identiques, 404 `ORDER_NOT_FOUND`. | conforme |
| F4 | Les entrées sont validées : recette du catalogue, quantités d'objets entières et strictement positives | Test « refuse une recette inconnue (400) » ; offres de `{ axe: -1 }`, `{ axe: 0.5 }` et `{ axe: 0 }` ; test « lève une erreur pour un mouvement d'objets mal formé » | Les trois offres reçoivent une erreur 400 ; un message dont un objet n'est pas au catalogue lève une erreur. | conforme |
| F5 | Le nombre de fabrications simultanées ne dépasse jamais le niveau de la forge, même lors de commandes simultanées | Test « n'accepte qu'une commande sur deux simultanées dans une forge de niveau 1 » | Le test passe : la concurrence optimiste rejoue la seconde commande, qui est refusée ; un seul prélèvement est demandé. | conforme |
| F6 | Une commande n'est jamais payée, remboursée ni forgée deux fois | Tests « ignore une réponse du Village reçue une seconde fois », « annule une fabrication en cours et restitue au village la moitié de son coût, une fois » et « refuse d'annuler une commande inconnue, en attente de paiement, forgée ou déjà annulée » | Les tests passent : une réponse en double est sans effet, et une seconde annulation est refusée sans nouveau versement. | conforme |
| F7 | Les ressources sont conservées : le total prélevé moins le total restitué est égal au coût des objets forgés, augmenté de la part non restituée des annulations | Tests « ne prélève que le coût des commandes payées, forgées ou en fabrication », « annule une fabrication en cours… » et « libère la place d'un paiement sans réponse, et restitue tout le coût s'il arrive tard » | Les tests passent : le stock simulé du village correspond au solde attendu après paiement, annulation et paiement tardif. | conforme |
| F8 | Un joueur ne peut céder qu'un objet déjà forgé ou reçu, ni l'échanger deux fois | Tests « refuse le retrait d'un objet absent ou encore en fabrication », « ignore un retrait ou un versement reçu en double » et « refuse l'offre d'un objet que le vendeur ne possède pas » | Les tests passent : le retrait est refusé et enregistré comme un fait ; un doublon ne retire rien de plus. | conforme |
| F9 | Aucun joueur ne peut provoquer un mouvement de ressources ou d'objets autrement que par une commande, une annulation ou une offre | Lecture de `api.ts` et `messages.ts` : seuls le service et la saga enregistrent des messages dans la boîte d'envoi | Aucune route n'accepte de sujet, d'identifiant de mouvement ni de quantité ; les sujets `forge.*` ne sont produits que par le code serveur. | conforme |
| F10 | Un joueur ne peut pas avancer l'échéance d'une fabrication, ni le délai d'un paiement | Lecture de `workshop.ts` et de `forge-service.ts` : `readyAt` et le délai de paiement sont calculés avec l'horloge du serveur | Aucune route n'accepte d'instant ; l'heure du navigateur ne sert qu'à afficher le compte à rebours. | conforme |
| F11 | Le canal d'un atelier n'est accessible qu'à son propriétaire, et ne transmet aucune donnée d'événement, ni par le flux, ni par la route de repli | Tests « réserve le canal de l'atelier à son propriétaire (403) » et « annonce le paiement et la fabrication sur le canal, sans leurs données » ; route de repli `/api/stream/forge-alice/events?after=0` | Les tests passent ; la route de repli renvoie `data: {}` pour chaque événement à Alice, et 403 à Bob. | conforme |
| F12 | Un message mal formé, ou étranger à la Forge, n'a aucun effet et lève une erreur | Tests « lève une erreur pour un mouvement qui ne vient pas de la Forge » et « lève une erreur pour un mouvement d'objets mal formé » | Les tests passent : le message est retenté, puis abandonné en lettre morte, sans événement enregistré. | conforme |

## Synthèse

Les 12 exigences sont conformes.

Vérifications faites le 2026-10-23, sur la base de test : `pnpm verify` (289 tests), et une
sonde temporaire, non versionnée, pour F1, F3, F4 et F11 (corps avec un identifiant de joueur,
quantités invalides, réponses comparées, route de repli du canal).

Points de vigilance, sans écart constaté :

- **F9** : les gestionnaires `forge.withdraw-items` et `forge.deposit-items` font confiance à
  l'identifiant de joueur du message. C'est sûr tant que seul le code serveur enregistre des
  messages ; une extraction de la Forge dans un service demanderait d'authentifier les
  messages entre services.
- **F7** : un paiement qui arrive après son délai est restitué en entier (ADR 0014). Le joueur
  ne perd rien, mais ne reçoit pas non plus son objet.
