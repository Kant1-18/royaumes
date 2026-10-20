# ADR-0002 - Event Sourcing comme mode de persistance du Village

- Statut : accepté
- Date : 2026-10-20

## Contexte

Un village n'est jamais créé d'un seul coup. Il évolue au fil des actions du joueur : on le
fonde, puis on améliore ses bâtiments, et chaque action dépend de l'état du moment (a-t-on
assez de ressources ?).

Deux besoins à venir s'intéressent à ce qui s'est passé, pas seulement au résultat : la
diffusion des changements en temps réel (TD5) et la construction de vues de lecture à partir
de l'activité des joueurs, comme un classement (TD8).

Enfin, l'hébergement sans serveur (ADR-0001) fait tourner plusieurs instances en parallèle.
Deux requêtes sur le même village (deux onglets, un double clic) peuvent donc être traitées
en même temps, sans autre point commun que la base de données.

## Décision

On ne stocke pas l'état du village : on le reconstruit en rejouant ses événements
(`VillageFounded`, `BuildingUpgraded`).

Les événements vont dans un journal générique de la plateforme, la table `platform.events`,
en ajout seul. Chaque village a son flux, `village-<joueur>`, où les événements sont numérotés
par version.

Une contrainte d'unicité sur (flux, version) empêche deux écritures concurrentes de passer
toutes les deux. Celle qui perd relit l'état et rejoue sa commande, au plus trois fois.

Un événement contient tout ce qu'il faut pour l'appliquer. Par exemple, `BuildingUpgraded`
enregistre le coût réellement payé : si les règles de coût changent plus tard, le rejeu donne
toujours le même résultat.

J'ai placé la table `platform.events` dans la plateforme plutôt que dans le module Village,
parce qu'elle ne sait rien du jeu : elle range des événements par flux et par version, sans
chercher à comprendre ce qu'ils contiennent. Les données sont stockées telles quelles en
`jsonb`, et c'est le module qui sait les relire. Ce choix permettra aux autres modules
d'utiliser le même journal plus tard, sans recréer une table ni refaire la gestion de la
concurrence. La table est décrite dans `src/platform/event-store/schema.ts`, et le lien avec
le Village se fait dans `src/modules/realm/infrastructure/event-store-village-repository.ts`.

## Conséquences

### Positives

- On garde tout l'historique d'un village : on peut savoir comment il en est arrivé là et
  retrouver son état à n'importe quel moment.
- Les événements servent directement au temps réel (TD5) et aux vues de lecture (TD8), qui
  pourront même être construites à partir de l'activité passée.
- La concurrence est gérée sans verrou : la base refuse l'écriture en conflit, et le nouvel
  essai est invisible pour le joueur.
- Le journal n'est pas lié au Village : les autres modules pourront s'en servir tels quels.

### Négatives

- Un événement enregistré ne peut plus être modifié. Si sa structure évolue, le code doit
  continuer à lire les anciennes versions ou les convertir à la lecture, et une erreur ne se
  corrige qu'en ajoutant un événement qui la compense.
- Il faut rejouer tout le flux pour obtenir l'état, et ce flux ne fait que grandir.
- On ne peut pas interroger directement les villages selon leur état (« tous ceux qui ont une
  caserne niveau 3 ») : il faut une vue de lecture dédiée.
- Le modèle est moins intuitif qu'une simple table, surtout pour quelqu'un qui découvre le
  projet.

## Alternatives écartées

- **Une table d'état propre au module** : plus simple à lire et à requêter, mais on ne garde
  que le dernier état. Pour le TD5 et le TD8, il faudrait reconstituer après coup ce qui a
  changé, ou publier les changements à part, au risque que les deux divergent.
- **Le verrouillage pessimiste** (`SELECT … FOR UPDATE`) : il évite les conflits, mais garde
  une transaction ouverte pendant tout le traitement. En sans serveur, avec peu de connexions
  disponibles, une instance lente bloquerait tout le monde, ce qui est cher payé pour des
  conflits aussi rares.

## Réexamen

À revoir si :

- un village accumule assez d'événements pour que le rejeu ralentisse les réponses (on
  ajouterait d'abord des instantanés) ;
- trois essais ne suffisent plus à absorber les conflits ;

## Usage de l'IA générative

aucun
