# ADR-0006 - Modèles de lecture séparés, tenus à jour par des projections rattrapées à la lecture

- Statut : accepté
- Date : 2026-10-21

## Contexte

Certaines lectures traversent les flux : le classement, et la liste des expéditions
ouvertes. Calculées par rejeu du journal, leur coût grandit avec tout l'historique du jeu,
et non avec ce qu'elles affichent (dette DT-005).

L'hébergement ne permet aucun processus permanent (ADR-0004) : rien ne peut écouter le
journal en continu. Le journal attribue à chaque événement une position globale, croissante
mais non continue (ADR-0002) : une transaction encore en cours peut laisser un trou
temporaire.

## Décision

Les lectures transversales s'appuient sur des modèles de lecture, rangés dans le schéma
PostgreSQL de leur module (`ranking`, `dungeon`). Les décisions, elles, s'appuient toujours
sur le modèle d'écriture, c'est-à-dire le journal.

Chaque modèle de lecture est tenu à jour par une projection, dont le point de reprise (la
position du dernier événement traité) est enregistré dans `platform.projections`.

Une projection est rattrapée au moment où on la consulte, dans une seule transaction, avec
le point de reprise verrouillé. Le rattrapage s'arrête devant une position manquante tant
que l'événement suivant a moins de cinq secondes.

Chaque projection porte une version. Si le code a une version plus élevée que celle des
tables, elles sont reconstruites ; s'il a une version moins élevée, il n'écrit rien.

Le classement est annoncé aux navigateurs par un canal global et discret, qui ne transmet
que la position des événements. L'interface relit le classement jusqu'à ce que la
projection ait atteint cette position.

Mise en œuvre : `src/platform/projection/projection.ts`, et les projections de chaque module
(`ranking-projection.ts`, `open-games-projection.ts`).

## Conséquences

### Positives

- Le coût d'une consultation ne dépend plus de l'historique, seulement des événements
  arrivés depuis le dernier rattrapage.
- Les modules qui écrivent ne savent rien des projections qui les lisent : le Donjon
  publie ses événements, et le Classement les exploite de son côté.
- Une nouvelle information peut être calculée pour le passé sans migration de données : il
  suffit d'augmenter la version de la projection pour qu'elle rejoue tout le journal.
- Aucune tâche de fond ni opération manuelle après un déploiement : la première
  consultation fait le rattrapage ou la reconstruction nécessaire.
- Le verrou sur le point de reprise empêche deux rattrapages simultanés d'appliquer deux
  fois le même événement.

### Négatives

- La cohérence n'est qu'à terme : un modèle de lecture peut avoir quelques secondes de
  retard sur le journal, notamment devant une position manquante.
- La reconstruction a lieu pendant une consultation, dont la durée est limitée sur Vercel :
  au-delà d'une certaine taille du journal, elle ne pourra plus aboutir.
- Après un retour à une version précédente de l'application, une projection dont la version
  avait été augmentée cesse d'avancer jusqu'au déploiement suivant.
- Le Classement dépend du langage publié des autres modules : un événement modifié ou
  ajouté sans réexamen de ses lecteurs passe inaperçu, comme on l'a vu avec la liste des
  expéditions ouvertes.
- Il y a désormais deux modèles de données à comprendre et à maintenir, et des tables
  qu'il faut savoir reconstruire.

## Alternatives écartées

- **Mettre à jour les modèles de lecture dans la commande, par le module qui écrit** : les
  lectures seraient toujours à jour, mais le Donjon devrait connaître le Classement, ce qui
  casse les frontières entre modules, et un nouveau modèle ne pourrait pas être calculé
  pour le passé.
- **Une tâche planifiée** : sur l'offre gratuite, elle ne s'exécute qu'une fois par jour,
  ce qui donnerait un classement en retard d'une journée.
- **Un processus de fond abonné au journal** : c'est le fonctionnement habituel des
  projections, mais l'hébergement ne permet aucun processus permanent.
- **Une vue matérialisée PostgreSQL** : simple à déclarer, mais entièrement recalculée à
  chaque rafraîchissement, donc avec un coût qui grandit toujours avec l'historique. Il
  faudrait en plus décider qui déclenche le rafraîchissement.
- **Garder le calcul par rejeu** : c'est justement la dette DT-005, dont le coût grandit
  avec l'historique de toutes les expéditions.

## Réexamen

À revoir si :

- une reconstruction approche la durée maximale d'une fonction Vercel ;
- les consultations simultanées deviennent assez nombreuses pour que le verrou du point de
  reprise fasse attendre les joueurs ;
- un besoin de lecture strictement à jour apparaît.

## Usage de l'IA générative

Rédaction assistée par Claude Code à partir de mes notes et du code existant. J'ai relu le
texte et vérifié qu'il correspond à l'implémentation.
