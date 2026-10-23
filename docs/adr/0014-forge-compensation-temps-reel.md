# ADR-0014 - Annulation compensée, expiration du paiement et canal temps réel de l'atelier

- Statut : accepté
- Date : 2026-10-23

## Contexte

La saga de la Forge n'avait qu'une étape : le paiement d'une commande par le Village
(ADR-0012). Une fabrication payée allait toujours jusqu'à son échéance (DT-008), et une
commande dont le message de paiement était abandonné occupait une place de l'atelier sans
limite de durée (DT-009).

L'écran de la Forge n'était mis à jour qu'aux actions du joueur (DT-012) : un paiement
traité plus tard, ou un objet reçu au Marché, n'apparaissait qu'au rechargement. L'écran du
Marché lisait l'inventaire d'objets dans les mêmes conditions (DT-013).

## Décision

### Annulation compensée

Le joueur peut annuler une fabrication en cours, et seulement elle : ni une commande en
attente de paiement, ni un objet déjà forgé. L'annulation est un événement de l'atelier,
`OrderCancelled`, qui porte la part restituée : 50 % du coût copié dans la commande, arrondi à
l'entier inférieur pour chaque ressource, sans les parts nulles. La part est réglée dans le
catalogue des recettes (`REFUND_SHARE`).

La compensation est une étape de la saga : l'annulation est enregistrée avec un message
`realm.deposit` d'identifiant `forge:<joueur>:<commande>:refund`, dans la même transaction.
Le versement ne peut pas être refusé : aucune réponse n'est demandée. Une commande annulée
ne l'est qu'une fois, et le Village ignore un versement en double.

### Expiration du paiement

Une commande dont le paiement reste sans réponse pendant 10 minutes (`PAYMENT_TIMEOUT_MS`)
est considérée comme expirée. Comme l'état « forgé », l'expiration est déduite à la lecture,
sans tâche de fond ni événement : la commande libère sa place, et l'écran la présente comme
expirée.

Si la réponse du Village arrive malgré tout après ce délai :

- un refus fait échouer la commande, comme avant ;
- un prélèvement fait expirer la commande (`OrderExpired`), et la totalité de son coût est
  restituée par `realm.deposit`. Le joueur n'a pas reçu son objet, et sa place a pu être
  reprise par une autre commande.

Cette décision remplace la conséquence de l'ADR-0012 selon laquelle un message de paiement
abandonné bloque une place de l'atelier jusqu'à sa relance.

### Canal temps réel de l'atelier

Chaque atelier a un canal `forge-<joueur>`, qui porte le nom de son flux (ADR-0003). Le canal
est réservé au propriétaire de l'atelier, et il est discret : il n'annonce que le type et la
version de chaque événement, et l'écran relit sa vue à chaque annonce. Les échéances, qui ne
produisent pas d'événement, sont relues par l'écran lui-même. Le compte à rebours compare les
échéances à l'heure du serveur, recalée sur l'instant de la dernière vue reçue (`asOf`).

L'interface de la Forge offre aux écrans des autres modules une lecture de l'inventaire tenue
à jour par ce canal : le hook `useInventory`, exporté par `forge/ui.tsx`. Le Marché l'utilise
pour proposer les objets en stock, sans connaître la route, le client ni le canal de la Forge.

Garanties : livraison au moins une fois, effet unique de chaque annulation et de chaque
restitution, cohérence différée ; l'écran se met à jour dès que le flux de l'atelier change.

## Conséquences

### Positives

- La saga de la Forge a une étape compensable : une annulation ne crée ni ne perd de
  ressources, au-delà de la part non restituée prévue par les règles.
- Un message de paiement abandonné ne bloque plus l'atelier, et aucune tâche de fond n'est
  ajoutée.
- Le Village n'a pas été modifié : la compensation utilise son versement existant.
- Un paiement traité plus tard, une annulation ou un objet échangé au Marché apparaissent
  sans recharger l'écran, dans la Forge comme dans le Marché.
- Le canal ne transmet aucune donnée d'événement, et aucun autre joueur ne peut l'écouter.

### Négatives

- Le délai de paiement peut être plus court que les relances de la boîte d'envoi : un
  paiement très retardé est restitué en entier, et le joueur doit recommander.
- Une commande expirée reste enregistrée « en attente de paiement » tant qu'aucune réponse
  n'arrive : son expiration n'existe qu'à la lecture.
- L'écran du Marché ouvre deux flux, celui des offres et celui de l'atelier : la charge
  décrite par l'ADR-0003 augmente d'autant.
- Le recalage de l'horloge inclut la durée de la requête : le compte à rebours peut avoir
  quelques centaines de millisecondes d'écart.

## Alternatives écartées

- **Restituer la totalité du coût à l'annulation** : annuler juste avant l'échéance serait
  sans risque, et la règle de jeu demandait une perte.
- **Une tâche de fond qui fait expirer les paiements** : elle ajouterait un traitement
  planifié pour un état que la lecture sait déjà déduire, comme l'échéance de fabrication.
- **Ignorer un paiement arrivé après le délai** : le Village aurait prélevé des ressources
  sans contrepartie.
- **Un canal non discret** : l'écran n'utilise pas les données des événements, et les
  transmettre n'apporterait rien.
- **Un abonnement du Marché au canal de la Forge par son propre code** : le Marché devrait
  connaître le nom du canal et la route de lecture de la Forge.

## Réexamen

À revoir si les relances de la boîte d'envoi changent de durée, si une annulation doit être
possible pendant le paiement, ou si le nombre de flux ouverts par joueur devient un problème
de charge.

## Usage de l'IA générative

Claude Code a généré certains blocs de code TypeScript du module, conformément aux décisions
d'architecture que j'avais prises.
Il m'a aussi aidé à rédiger ce document au format Markdown.
J'ai relu le texte et vérifié qu'il correspond au code.
