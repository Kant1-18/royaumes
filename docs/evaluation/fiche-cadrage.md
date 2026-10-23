# Fiche de cadrage : `Forge`

- Auteur : Quentin STEMPFER
- Date : 2026-10-23
- Nom technique du module : `forge`

## L'idée

La Forge permet au joueur de fabriquer des objets à partir de recettes, en consommant les
ressources de son village. Chaque recette a un coût et une durée de fabrication. La Forge
donne enfin un débouché aux ressources accumulées. Elle constitue aussi une collection
d'objets que le joueur peut faire valoir.

La forge est aussi un bâtiment du village, que le joueur construit puis améliore jusqu'au
niveau 10, comme les autres bâtiments. Elle ne produit aucune ressource, son
niveau fixe le nombre d'objets que le joueur peut fabriquer en même temps. Le joueur doit
donc choisir entre investir dans sa production et investir dans son atelier.

Recettes de départ :

| Objet | Coût | Durée |
| --- | --- | --- |
| Hache (`axe`) | 60 bois, 20 pierre | 2 min |
| Pioche (`pickaxe`) | 40 bois, 60 pierre | 3 min |
| Bouclier (`shield`) | 100 bois, 40 pierre, 10 or | 4 min |
| Épée (`sword`) | 30 bois, 80 pierre, 20 or | 5 min |
| Couronne (`crown`) | 50 pierre, 100 or | 10 min |

## Les règles métier

Règle du bâtiment, portée par le domaine du Village :

1. La forge est un bâtiment du village, de niveau 0 (non construite) à 10. Elle s'améliore
   selon la règle de coût commune aux bâtiments, et ne produit aucune ressource.

Règles de l'atelier, portées par le domaine de la Forge :

2. Seul un objet du catalogue des recettes peut être commandé.
3. Une commande est refusée tant que la forge du village n'est pas construite.
4. Le nombre de commandes simultanées, en attente de paiement ou en fabrication, ne peut pas
   dépasser le niveau de la forge.
5. Le coût de la recette est prélevé dans le village avant le début de la fabrication. Si le
   stock ne suffit pas, la commande échoue, avec l'indication des quantités manquantes, et
   aucun objet n'est fabriqué.
6. Une fois le paiement obtenu, l'objet est en fabrication pendant la durée de sa recette.
   Il n'est forgé qu'à l'échéance, et rejoint alors l'inventaire du joueur.
7. Une commande ne peut être annulée que pendant sa fabrication. L'annulation restitue au
   village 50 % du coût de la recette, arrondi à l'entier inférieur pour chaque ressource ;
   une ressource dont le remboursement est nul n'est pas versée. Le reste est perdu.
8. Une réponse du Village reçue en double est sans effet : une commande n'est jamais payée,
   remboursée ni forgée deux fois.
9. Les ressources sont conservées : pour chaque joueur, le total prélevé moins le total
   restitué est égal au coût des objets forgés, augmenté de la part non restituée des
   commandes annulées.

## Les commandes et les lectures

| Action du joueur | Commande ou lecture | Route envisagée |
| --- | --- | --- |
| Construire ou améliorer la forge | Commande (module Village) | `POST /api/realm/village/upgrade` (route existante) |
| Consulter les recettes | Lecture | `GET /api/forge/recipes` |
| Consulter son atelier (capacité, commandes en cours, inventaire) | Lecture | `GET /api/forge` |
| Commander un objet | Commande | `POST /api/forge/orders` |
| Annuler une fabrication en cours | Commande | `POST /api/forge/orders/:orderId/cancel` |

## Le stockage envisagé

- **Commandes et inventaire** : le journal d'événements, selon le modèle decider, avec un
  flux `forge-<userId>` par joueur. L'historique des objets forgés a une valeur de jeu : il
  fonde l'inventaire et la collection du joueur, et il ne doit pas disparaître, contrairement
  aux messages de la Taverne. La concurrence optimiste protège la règle 4 contre deux
  commandes simultanées.
- **Niveau de la forge** : une table de lecture `forge.workshops`, dans le schéma `forge`,
  tenue par une projection avec son point de reprise et sa version.

## La communication avec les modules existants

- **Village → Forge, lecture du langage publié** : la projection de la Forge lit les
  événements `BuildingUpgraded` du Village dont le bâtiment est `forge`, pour connaître la
  capacité de l'atelier de chaque joueur.
- **Forge → Village, messages de la boîte d'envoi** : la Forge orchestre une saga. Elle
  demande `realm.withdraw` pour le paiement puis, en cas d'annulation, `realm.deposit` pour
  la compensation partielle, avec un identifiant de mouvement dérivé de la commande. Le
  Village répond au sujet indiqué dans `replyTo`, sans connaître la Forge.
- **Modification du Village** : l'ajout du bâtiment `forge` à son catalogue. Les contrats
  existants (`REALM_TOPICS`, `UpgradeBuildingInput`) ne changent pas de forme.

## Les données personnelles

- L'historique des commandes et l'inventaire, rattachés à l'identifiant du joueur : exportés ;
  après l'effacement du compte, les événements sont conservés sous forme pseudonyme, comme
  ceux du Village (ADR-0008).
- Le niveau de la forge, dans la table de lecture : supprimé avec le compte. Il figure déjà
  dans l'export du Village, avec les niveaux des autres bâtiments.
- La Forge ne conserve ni nom ni texte libre : aucun événement n'est à réécrire.

## Les bonus visés

1. B5 : une saga avec une étape compensable entre la Forge et le Village (paiement, puis
   remboursement partiel à l'annulation).
2. B2 : l'échéance de fabrication, gérée sans tâche de fond.
3. B4 : la capacité de l'atelier tenue par une projection, avec son point de reprise et sa
   version.
4. B1 : un canal temps réel `forge-<userId>`, réservé à son propriétaire.
