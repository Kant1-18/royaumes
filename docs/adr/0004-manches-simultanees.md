# ADR-0004 - Manches simultanées aux échéances paresseuses pour les combats du Donjon

- Statut : accepté
- Date : 2026-10-20

## Contexte

Un combat du Donjon réunit jusqu'à quatre joueurs humains. Aucun ne doit pouvoir bloquer
les autres en ne jouant pas, et aucun ne doit être avantagé par l'ordre dans lequel on joue.
Les choix de chacun doivent rester secrets jusqu'à la résolution de la manche.

L'hébergement ne permet ni minuteur en mémoire ni tâche de fond, et les tâches planifiées
de l'offre gratuite ne s'exécutent qu'une fois par jour : rien ne peut « se réveiller » au
bout de trente secondes pour clore une manche. Enfin, l'état d'une expédition est
reconstruit à partir de ses événements (ADR-0002) : tout calcul doit pouvoir être refait à
l'identique.

## Décision

Les héros choisissent leur action en même temps. Une manche est résolue dès que tous ont
choisi, ou à son échéance de trente secondes ; un héros qui n'a rien choisi se défend.

L'échéance est une donnée enregistrée dans les événements (`RoomEntered`, `RoundResolved`),
et une manche échue est toujours résolue à l'instant de son échéance, pas à l'instant où
quelqu'un s'en aperçoit.

Personne ne surveille l'échéance : une lecture calcule la résolution des manches échues
sans rien enregistrer, et toute commande acceptée commence par l'enregistrer. Quand son
compte à rebours atteint zéro, le navigateur envoie une commande d'échéance
(`CheckDeadline`), qui ne fait rien d'autre que provoquer cet enregistrement.

Le hasard est tiré dans `decide`, avec un générateur à graine dérivée de la graine de
l'expédition et du numéro de manche, et ses résultats sont enregistrés dans les événements.

Une action porte le numéro de la manche visée, et elle est refusée si cette manche est déjà
résolue.

Mise en œuvre : `src/modules/dungeon/domain/` (`rules.ts`, `view.ts`, `random.ts`).

## Conséquences

### Positives

- Aucun joueur n'attend indéfiniment : au pire, la manche se résout au bout de trente
  secondes, et l'ordre de jeu ne donne d'avantage à personne.
- Le fonctionnement ne dépend d'aucun minuteur ni d'aucune tâche de fond : il tient dans
  l'offre gratuite, et n'importe quelle instance peut traiter n'importe quelle requête.
- Le résultat ne dépend pas du moment où il est calculé : une manche échue donne le même
  résultat qu'on la résolve tout de suite ou dix minutes plus tard, à la lecture comme à
  l'écriture.
- Les tirages sont reproductibles et enregistrés : rejouer le journal redonne exactement
  le même combat, et les tests peuvent fixer la graine.
- Le numéro de manche empêche qu'une action envoyée trop tard s'applique par erreur à la
  manche suivante.
- Les lectures ne modifient rien : elles restent sans effet de bord et ne créent aucun
  conflit d'écriture.

### Négatives

- Quand plus aucun joueur ne se manifeste, le journal peut rester en retard sur ce
  qu'affichent les lectures : les manches échues sont visibles mais pas enregistrées.
- Le temps réel dépend des navigateurs : c'est la commande d'échéance envoyée par l'un
  d'eux qui enregistre la résolution et déclenche la notification des autres. Si tous les
  onglets sont fermés, rien ne se passe.
- Une expédition abandonnée n'enregistre jamais `GameEnded` : le classement du TD8, qui
  s'appuie sur cet événement, ne la verra pas.
- Les héros pilotés par l'ordinateur du TD7 ne pourront pas compter sur un navigateur pour
  agir : il faudra un autre déclencheur.
- Le modèle surprend à la première lecture du code : une vue peut afficher une manche que
  le journal ne contient pas encore, et le navigateur envoie une commande qui ne fait
  apparemment rien.
- Le générateur à graine n'est pas cryptographique : connaître la graine permet de prévoir
  les tirages. Elle n'est donc jamais transmise aux joueurs.

## Alternatives écartées

- **Le tour par tour strict** : simple à comprendre, mais un joueur absent bloque tous les
  autres, et celui qui joue en dernier voit les choix des autres, ce qui l'avantage.
- **Un minuteur ou une tâche planifiée** : ce serait la façon naturelle de clore une manche
  à l'heure, mais un minuteur en mémoire disparaît avec l'instance sans serveur, et les
  tâches planifiées de l'offre gratuite ne passent qu'une fois par jour.
- **Une lecture qui enregistre elle-même la résolution** : le journal serait toujours à
  jour, mais chaque lecture pourrait écrire, créer des conflits avec les commandes et
  d'autres lectures, et les flux SSE relus deux fois par seconde (ADR-0003) deviendraient
  des écritures.
- **Un tirage par `Math.random` dont seul le résultat serait enregistré** : le journal
  resterait cohérent, mais une lecture qui calcule une manche échue obtiendrait un résultat
  différent de celui qu'enregistrera ensuite la commande. Le joueur verrait le combat
  changer, et les tests ne pourraient pas fixer le hasard.

## Réexamen

À revoir si :

- il devient nécessaire d'enregistrer la fin d'une expédition abandonnée, par exemple pour
  le classement du TD8 ;
- les héros pilotés par l'ordinateur du TD7 demandent un déclencheur qui ne passe pas par
  un navigateur ;
- un service de planification de tâches compatible avec l'hébergement devient disponible.

## Usage de l'IA générative

aucun
