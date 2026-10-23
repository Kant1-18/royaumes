# ADR-0010 - La forge, bâtiment du Village, et la capacité des ateliers tenue par une projection

- Statut : accepté
- Date : 2026-10-23

## Contexte

Dans la Forge, le nombre de fabrications simultanées d'un joueur est limité par le niveau de
la forge de son village. La Forge doit connaître ce niveau à chaque commande.

Les bâtiments appartiennent au Village, qui publie chaque amélioration dans l'événement
`BuildingUpgraded`. Un module ne touche pas aux données d'un autre (ADR-0007), et le Village
peut être extrait dans un service dont les événements sont recopiés dans le journal de
l'application. Les modules ne lisent le journal que par son API, qui relit un flux entier.

## Décision

La forge est un bâtiment du Village, de niveau 0 à 10, amélioré selon la règle de coût
commune et sans production. La Forge ne fait que lire ce niveau.

La capacité de chaque atelier est conservée dans la table `forge.workshops`, propre au module.
Elle est tenue par une projection des événements `BuildingUpgraded` de la forge, qui retient
le niveau atteint, et rattrapée à chaque lecture (ADR-0006). Sans ligne, la capacité est nulle.

## Conséquences

### Positives

- Le Village reste seul maître de ses bâtiments, et la forge suit les mêmes règles que les
  autres.
- Lire la capacité coûte une requête sur une clé primaire, quelle que soit la taille de
  l'historique du village.
- La Forge ne dépend pas de la disponibilité du Village, extrait ou non.
- La table peut être reconstruite à tout moment à partir du journal, sans risque de double
  comptage.

### Négatives

- La Forge a demandé de modifier un module existant.
- Le module ajoute une table et une migration à maintenir.
- La capacité lue peut être en retard sur la dernière amélioration, sans jamais dépasser la
  capacité réelle, puisqu'un niveau ne fait qu'augmenter.
- La Forge dépend de la forme de l'événement `BuildingUpgraded`.
- Le niveau de la forge d'un compte effacé reste dans la table sous forme pseudonyme, comme
  les événements du Village (ADR-0008).

## Alternatives écartées

- **Une forge propre au module Forge** : elle dupliquerait la règle de coût des bâtiments, et
  son amélioration demanderait une saga pour payer le Village.
- **Un appel au Village à chaque commande** : la Forge dépendrait de sa disponibilité, et
  d'un appel réseau lorsqu'il est extrait.
- **La relecture du flux du village à chaque commande** : chaque commande relirait tout
  l'historique du village pour un seul nombre, le défaut corrigé au TD8.
- **Une capacité tenue par le Village** : il devrait connaître la notion d'atelier, propre à
  la Forge.

## Réexamen

À revoir si un niveau de bâtiment peut diminuer, si la Forge est extraite dans un service, ou
si le Village change la forme de `BuildingUpgraded`.

## Usage de l'IA générative

Claude Code a généré certains blocs de code TypeScript du module, conformément aux décisions
d'architecture que j'avais prises.
Il m'a aussi aidé à rédiger ce document au format Markdown.
J'ai relu le texte et vérifié qu'il correspond au code.
