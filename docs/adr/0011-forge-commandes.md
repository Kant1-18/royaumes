# ADR-0011 - Journal d'événements pour les commandes de la Forge, un flux par atelier

- Statut : accepté
- Date : 2026-10-23

## Contexte

Un joueur commande des objets à la Forge ; chaque commande est payée, fabriquée pendant une
durée propre à sa recette, puis rejoint son inventaire. L'historique des commandes a une
valeur de jeu : il constitue cet inventaire. La règle de capacité porte sur l'ensemble des
commandes en cours d'un joueur.

Le projet dispose d'un journal d'événements avec concurrence optimiste (ADR-0002) et
d'échéances évaluées sans tâche de fond (ADR-0004).

## Décision

Les commandes sont conservées dans le journal, selon le modèle decider. Un seul flux par
joueur, `forge-<userId>`, contient toutes ses commandes : l'atelier est l'agrégat.

En cas de conflit de version, le service relit l'atelier et rejoue la décision : deux
commandes simultanées ne peuvent donc pas dépasser la capacité. Les messages de la saga sont
enregistrés dans la même transaction que les événements (ADR-0007).

Le coût de la recette est copié dans l'événement de commande. L'état « forgé » n'est pas
enregistré : il se déduit de l'échéance de la fabrication, au moment de la lecture.

## Conséquences

### Positives

- L'historique complet des commandes est conservé, et l'inventaire se reconstitue toujours
  à partir des faits.
- La règle de capacité est garantie sans verrou, par la seule version du flux.
- Les fabrications s'achèvent sans tâche de fond.
- Un rééquilibrage des recettes ne modifie pas les commandes déjà passées.

### Négatives

- Le flux d'un atelier est relu en entier à chaque commande, consultation et export : le
  coût grandit avec l'historique du joueur.
- La vue présente tout l'historique des commandes, sans pagination.
- Les événements d'un compte effacé sont conservés sous forme pseudonyme (ADR-0008).

## Alternatives écartées

- **Des tables classiques** : l'historique se réduirait à l'état courant, et la capacité
  demanderait un verrou explicite sur les commandes du joueur.
- **Un flux par commande**, comme une offre du Marché : aucune version commune ne protégerait
  la capacité, et deux commandes simultanées pourraient la dépasser.
- **Un événement « objet forgé » déclenché par un message différé** : un message de plus par
  commande, et un inventaire dépendant de la distribution des messages.
- **Un instantané de l'atelier dès maintenant** : une complexité sans besoin mesuré, tant que
  les joueurs passent peu de commandes.

## Réexamen

À revoir si le nombre de commandes par joueur rend la relecture du flux coûteuse, ou si les
objets acquièrent un effet que d'autres modules doivent connaître.

## Usage de l'IA générative

Claude Code a généré certains blocs de code TypeScript du module, conformément aux décisions
d'architecture que j'avais prises.
Il m'a aussi aidé à rédiger ce document au format Markdown.
J'ai relu le texte et vérifié qu'il correspond au code.
