# ADR-0013 - Échange des objets de la Forge au Marché, la Forge participant à la saga d'échange

- Statut : accepté
- Date : 2026-10-23

## Contexte

Le Marché échange des ressources par une saga orchestrée : mise en séquestre des biens du
vendeur, paiement de l'acheteur, livraison aux deux joueurs, restitution en cas de retrait
(ADR-0007). Chaque étape est un message adressé au Village, qui répond à l'adresse indiquée.

Les joueurs veulent aussi échanger les objets forgés. Ces objets appartiennent à la Forge :
l'inventaire d'un joueur se déduit du flux de son atelier (ADR-0011). Le Marché ne peut donc
ni les lire ni les déplacer lui-même.

## Décision

La Forge devient une participante de la saga du Marché, au même titre que le Village. Elle
publie deux sujets, `forge.withdraw-items` et `forge.deposit-items`, dont le contenu
(identifiant du mouvement, joueur, objets, adresse de retour) est décrit dans ses contrats.
Elle répond avec la même forme que le Village : identifiant, issue, quantités manquantes.
Elle ne connaît pas le Marché.

Chaque mouvement est enregistré dans le flux de l'atelier du joueur. Un retrait n'est accepté
que si les objets sont déjà forgés ou reçus ; sinon, le refus est enregistré comme un fait,
et non renvoyé comme une erreur. L'identifiant du mouvement, choisi par le demandeur, rend
chaque mouvement idempotent.

Chaque côté d'une offre porte un seul type de bien : des ressources ou des objets, jamais
les deux. Le domaine du Marché et les étapes de sa saga ne changent pas. Seul son service
choisit le destinataire de chaque mouvement : la Forge pour des objets, le Village pour des
ressources. La réponse ayant la même forme, le gestionnaire des réponses du Marché ne change
pas non plus.

L'écran du Marché lit l'inventaire par l'interface publique de la Forge : la route et le
client HTTP de la Forge restent internes au module.

Garanties : celles de la saga du Marché, livraison au moins une fois, effet unique de
chaque mouvement, cohérence différée.

## Conséquences

### Positives

- La saga du Marché garde ses étapes et sa compensation : un objet en séquestre est
  restitué à l'échéance ou au retrait de l'offre, comme des ressources.
- La Forge ne connaît pas le Marché : tout autre module peut lui demander un mouvement
  d'objets.
- L'échange fonctionne de la même manière avec un Village extrait.
- Aucun code n'est ajouté à la plateforme.

### Négatives

- Le service du Marché connaît le catalogue des recettes de la Forge, pour choisir le
  destinataire d'un mouvement.
- Une offre ne peut pas mêler ressources et objets d'un même côté.
- Chaque échange allonge le flux de l'atelier, relu en entier (DT-011).
- L'inventaire affiché par le Marché n'est pas relu en temps réel (DT-013).

## Alternatives écartées

- **Un inventaire d'objets tenu par le Marché** : les objets auraient deux propriétaires,
  et la Forge ne saurait plus ce que possède un joueur.
- **Une saga chorégraphiée**, où la Forge réagirait aux événements du Marché : elle devrait
  connaître le Marché, et le déroulement serait éparpillé entre les modules.
- **Des côtés mêlant ressources et objets** : une même étape demanderait deux mouvements, à
  deux destinataires, et un refus partiel imposerait une compensation au milieu d'une étape.
- **Une lecture directe de la route HTTP de la Forge par l'écran du Marché** : le couplage
  échapperait au typage et aux règles de dépendance.

## Réexamen

À revoir si un troisième type de bien apparaît, si les joueurs veulent des côtés mêlant
ressources et objets, ou si la Forge est extraite dans un service.

## Usage de l'IA générative

Claude Code a généré certains blocs de code TypeScript des modules Forge et Marché,
conformément aux décisions d'architecture que j'avais prises.
Il m'a aussi aidé à rédiger ce document au format Markdown.
J'ai relu le texte et vérifié qu'il correspond au code.
