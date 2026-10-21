# ADR-0005 - Une intelligence artificielle déterministe, exécutée dans le domaine, sans tâche de fond

- Statut : accepté
- Date : 2026-10-21

## Contexte

On veut des monstres qui ne se battent pas de la même façon selon la difficulté choisie au
départ. On veut aussi qu'un joueur seul puisse partir à l'aventure, avec des compagnons
joués par l'ordinateur pour compléter son groupe.

Seulement, notre hébergement ne garde rien en marche entre deux requêtes (ADR-0004) : aucun
personnage ne peut donc décider, de lui-même, que c'est le moment d'agir.

Enfin, une expédition n'est qu'une suite d'événements rejoués (ADR-0002), et une simple
lecture peut déjà calculer une manche échue sans l'enregistrer (ADR-0004). La même manche
risque ainsi d'être résolue deux fois, à la lecture puis à la commande suivante : il faut
qu'elle tombe chaque fois sur le même résultat.

## Décision

Les décisions de l'intelligence artificielle sont des fonctions pures du domaine, appelées
au moment de la résolution d'une manche (`resolveRound`) : `chooseCompanionAction` pour les
compagnons, et la stratégie du niveau de difficulté pour les monstres.

Elles ne tirent au sort qu'au moyen du générateur de la manche, dont la graine est dérivée
de la graine de l'expédition et du numéro de manche. La stratégie le reçoit dans son
contexte ; le compagnon ne tire rien.

Leurs résultats sont enregistrés dans l'événement `RoundResolved` : les actions de tous les
héros, compagnons compris, et les effets, cibles des monstres comprises. La relecture du
journal applique ces résultats sans rappeler l'intelligence artificielle.

Le comportement des monstres est isolé derrière un port de stratégie (`MonsterStrategy`),
dont chaque niveau de difficulté fournit une mise en œuvre : au niveau facile, la cible est
tirée au hasard ; au niveau difficile, les monstres achèvent un héros qu'ils sont sûrs
d'abattre, puis visent le plus faible des héros qui ne se défendent pas.

Un compagnon n'agit que si au moins un joueur a choisi une action pour la manche. Sinon, il
se défend, comme un héros sans choix : il accompagne les joueurs, il ne joue pas à leur
place.

L'équilibre du jeu est mesuré par simulation : des expéditions entières sont jouées en
mémoire par des joueurs simulés (`scripts/simulate-dungeon.ts`). Des tests statistiques,
sur 200 graines fixes, protègent les écarts attendus entre les niveaux.

Mise en œuvre : `src/modules/dungeon/domain/` (`monster-strategies.ts`, `companion.ts`,
`rules.ts`, `simulation.ts`).

## Conséquences

### Positives

- Aucune infrastructure supplémentaire : l'intelligence artificielle tient dans l'offre
  gratuite, et n'importe quelle instance peut résoudre n'importe quelle manche.
- Le résultat ne dépend pas du moment où il est calculé : une lecture et la commande qui
  suit affichent la même manche, à l'action de compagnon et à la cible de monstre près.
- Les décisions sont testables sans base ni réseau : une situation construite à la main
  suffit, et la graine fixe le hasard.
- Le journal explique chaque manche : on peut voir après coup ce qu'a choisi un compagnon
  ou quel héros un monstre a visé.
- Faire évoluer une intelligence artificielle ne réécrit pas le passé : les anciennes
  expéditions se relisent avec les décisions enregistrées, pas avec les règles nouvelles.
- Ajouter un niveau de difficulté revient à écrire une stratégie, sans toucher aux règles
  du combat.
- La simulation joue des milliers d'expéditions en quelques secondes : l'équilibre est
  mesuré plutôt que deviné, et les tests signalent un réglage qui le casse.

### Négatives

- Un personnage piloté par l'ordinateur ne peut pas agir entre deux échéances : il ne
  décide qu'au moment où une manche est résolue, et ne peut ni réagir en cours de manche,
  ni ouvrir une porte, ni faire avancer une expédition dont les joueurs sont absents.
- La qualité de l'équilibre dépend de la règle suivie par les joueurs simulés : ils se
  défendent en danger et ne soignent jamais. Des joueurs réels plus habiles, ou plus
  maladroits, ne retrouveront pas les taux mesurés.
- Les décisions doivent rester assez rapides pour être prises pendant une lecture, et les
  flux SSE relisent l'état deux fois par seconde (ADR-0003) : une intelligence artificielle
  coûteuse ralentirait toutes les lectures.
- Un compagnon décide sur la situation du début de manche, sans connaître les choix des
  joueurs : il peut soigner un héros qu'un autre joueur soigne déjà.
- Les tests statistiques portent sur des graines fixes : ils sont reproductibles, mais un
  réglage peut passer de justesse sur ces graines et échouer sur d'autres.
- Le moindre changement dans l'ordre des tirages modifie toutes les parties simulées, et
  oblige à revoir les seuils des tests.

## Alternatives écartées

- **Une boucle de jeu exécutée par un processus permanent** : les personnages pourraient
  agir à tout moment, mais l'hébergement ne permet ni processus permanent ni minuteur qui
  survive à la requête (ADR-0004).
- **Des décisions prises par le navigateur d'un joueur** : le serveur n'aurait rien à
  calculer, mais un joueur pourrait modifier les choix de ses compagnons ou des monstres,
  et rien ne se passerait si son onglet était fermé. Deux navigateurs pourraient aussi
  proposer deux décisions différentes.
- **Un recalcul des décisions lors de la relecture plutôt que leur enregistrement** :
  l'événement serait plus léger, mais toute modification d'une stratégie changerait
  rétroactivement les expéditions passées, et le journal ne suffirait plus à comprendre ce
  qui s'est produit.

## Réexamen

À revoir si :

- il faut un personnage qui agit en temps réel, entre deux échéances, ou qui fait avancer
  une expédition sans joueur présent ;
- une intelligence artificielle devient trop coûteuse en calcul pour être exécutée lors
  d'une lecture, par exemple une recherche sur plusieurs manches ;
- les taux de victoire observés chez les joueurs réels s'écartent nettement de ceux de la
  simulation : la règle des joueurs simulés serait alors à revoir ;
- l'hébergement permet un processus permanent ou des tâches planifiées fréquentes.

## Usage de l'IA générative

Aucun.
