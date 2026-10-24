# Rendu de l'évaluation

- Auteur : Quentin STEMPFER
- Module : `forge`
- Adresse du déploiement : <à compléter>
- Fiche de cadrage : [fiche-cadrage.md](fiche-cadrage.md)

## Exigences minimales

| N° | Fichiers principaux | Tests qui la vérifient |
| --- | --- | --- |
| E1 | `src/modules/forge/` : `domain/` (règles pures), `application/` (service, ports), `infrastructure/` (dépôt, projection, schéma), `api.ts`, `messages.ts`, `personal-data.ts`, `index.ts`, `contracts.ts`, `ui.tsx` | `pnpm lint:archi` (règles `pure-domain`, `application-ignores-infrastructure`, `module-encapsulation`) ; `src/bootstrap/architecture.test.ts` |
| E2 | `src/bootstrap/create-api.ts` (module, gestionnaires, règle du canal, routes protégées, données personnelles) ; `app/(jeu)/forge/page.tsx` ; entrée « Forge » de `src/ui/app-shell.tsx` | `src/bootstrap/forge-api.test.ts` (application assemblée par `createTestApi`) |
| E3 | `src/modules/forge/domain/workshop.ts` (decider), `saga.ts`, `view.ts`, `recipes.ts` | `src/modules/forge/domain/workshop.test.ts` |
| E4 | Journal d'événements, un flux `forge-<joueur>` par atelier : `infrastructure/event-store-workshop-repository.ts` ; schéma `forge` : `infrastructure/schema.ts`, `drizzle/0013_forge.sql` ; justification : ADR 0010 et 0011 | `src/modules/forge/application/forge-service.test.ts` ; `src/modules/forge/infrastructure/workshops-projection.test.ts` ; fonction d'aptitude « range chaque table dans le schéma d'une brique de la plateforme ou d'un module » |
| E5 | `src/modules/forge/api.ts` (le joueur est toujours `c.var.userId`), `requireUser` sur `/forge` et `/forge/*` dans `create-api.ts`, `PlaceOrderInput` et `ItemTransferRequest` dans `contracts.ts` | `forge-api.test.ts` : « refuse une requête anonyme (401) », « refuse une recette inconnue (400) », « refuse d'annuler la commande d'un autre joueur, ou une commande inconnue (404) » ; revue de sécurité F1 à F4 |
| E6 | Boîte d'envoi : `messages.ts`, `FORGE_TOPICS` dans `contracts.ts`, `toMessage` dans `forge-service.ts` (sujets `realm.withdraw` et `realm.deposit` du Village) ; langage publié du Village : `infrastructure/workshops-projection.ts` (`BuildingUpgraded`) ; Marché : `market/contracts.ts` et `market/application/market-service.ts` | `forge-service.test.ts` (Village simulé, « ignore une réponse du Village reçue une seconde fois », « répond au demandeur d'un mouvement d'objets, une seule fois ») ; `forge-api.test.ts` : « fonctionne de la même manière avec un Village extrait » ; `market-api.test.ts` : bloc « échange d'objets de la Forge » |
| E7 | `src/modules/forge/personal-data.ts` : export des commandes et des mouvements d'objets. Aucun nom ni texte libre dans les événements, donc rien à réécrire ; aucune table personnelle à vider | `forge-api.test.ts` : « inclut les commandes de l'atelier dans l'export des données du joueur » ; fonction d'aptitude « déclare les données personnelles de chaque module qui conserve des données » |
| E8 | Correspondance des règles 1 à 9 et des tests : voir [ci-dessous](#correspondance-des-règles-et-des-tests) ; chaque route a au moins un test de l'API | `workshop.test.ts`, `village.test.ts`, `forge-service.test.ts`, `forge-api.test.ts`, `market-api.test.ts` |
| E9 | `.dependency-cruiser.cjs` et `src/bootstrap/architecture.test.ts` inchangés depuis `td11-fin` | `pnpm lint:archi` : aucune violation (161 fichiers, 534 dépendances) ; les deux fonctions d'aptitude passent |
| E10 | Migration `drizzle/0013_forge.sql`, appliquée au déploiement par `pnpm vercel-build` | <à compléter après la vérification en production> |

### Correspondance des règles et des tests

| Règle de la fiche | Test du domaine | Test de l'API |
| --- | --- | --- |
| 1. Bâtiment forge, niveaux 0 à 10, sans production | `village.test.ts` : bloc « Village - forge » | `forge-api.test.ts` : construction de la forge dans `forgeBuilt` |
| 2. Seul un objet du catalogue | « refuse un objet qui n'est pas au catalogue des recettes » | « refuse une recette inconnue (400) » |
| 3. Refus tant que la forge n'est pas construite | « refuse toute commande tant que la forge du village n'est pas construite » | « refuse toute commande tant que la forge n'est pas construite (409) » |
| 4. Commandes simultanées limitées au niveau de la forge | « limite le nombre de commandes simultanées au niveau de la forge » ; « libère la place d'une commande forgée ou dont le paiement a été refusé » | « refuse une commande au-delà de la capacité de l'atelier (409) » ; service : « n'accepte qu'une commande sur deux simultanées dans une forge de niveau 1 » |
| 5. Paiement avant la fabrication ; échec avec les quantités manquantes | « demande au Village le prélèvement du coût de la recette » ; « fait échouer la commande si le stock ne suffit pas, sans rien à compenser » | « fait échouer la commande que le village ne peut pas payer, sans rien prélever » |
| 6. Fabrication pendant la durée de la recette, puis inventaire | « forge l'objet à l'échéance de sa fabrication, qui commence au paiement » | « fait payer la commande au village, puis forge l'objet à son échéance » |
| 7. Annulation pendant la fabrication, 50 % restitués | Bloc « Forge - annulation » (3 tests) | « annule une fabrication en cours, et restitue au village la moitié de son coût » |
| 8. Réponse en double sans effet | Bloc « Forge - idempotence » ; « refuse d'annuler une commande… déjà annulée » | Service : « ignore une réponse du Village reçue une seconde fois » |
| 9. Conservation des ressources | « ne garde que le coût des objets payés, et la part non restituée des annulations » | Service : « annule une fabrication en cours… une fois » et « libère la place d'un paiement sans réponse… » |

## Bonus revendiqués

| N° | Description | Fichiers | Tests | Documentation |
| --- | --- | --- | --- | --- |
| B5 (+2) | Saga avec une étape compensable : le paiement par le Village, puis la restitution de la moitié du coût à l'annulation, ou de la totalité d'un paiement arrivé après son délai | `domain/workshop.ts` (`CancelOrder`, `refundOf`, `OrderExpired`), `domain/saga.ts`, `application/forge-service.ts` (`toMessage`, `cancelOrder`) | `workshop.test.ts` : blocs « annulation », « délai de paiement », « conservation des ressources » ; `forge-service.test.ts` : « annule une fabrication en cours… une fois » ; `forge-api.test.ts` : « annule une fabrication en cours… » | ADR 0012 et 0014 ; `architecture.md` : diagrammes « Paiement » et « Annulation » |
| B2 (+1) | Échéances sans tâche de fond : l'état « forgé » et l'expiration du paiement sont déduits à la lecture | `domain/workshop.ts` (`isForged`, `isPaymentExpired`), `domain/view.ts` | « forge l'objet à l'échéance de sa fabrication… » ; bloc « Forge - délai de paiement » ; service : « ajoute l'objet à l'inventaire à l'échéance de sa fabrication » | ADR 0011 et 0014 |
| B4 (+1) | Projection de la capacité des ateliers, avec point de reprise et version, tenue à partir des événements `BuildingUpgraded` du Village | `infrastructure/workshops-projection.ts`, `infrastructure/drizzle-capacity-reader.ts`, `infrastructure/schema.ts` | `workshops-projection.test.ts` (3 tests) | ADR 0010 ; `architecture.md` |
| B1 (+1) | Canal temps réel `forge-<joueur>`, discret et réservé au propriétaire ; inventaire tenu à jour dans l'écran du Marché | `index.ts` (`channelPolicy`), `ui.tsx` (`useChannel`, `useInventory`), `market/ui.tsx` | `forge-api.test.ts` : « réserve le canal de l'atelier à son propriétaire (403) », « annonce le paiement et la fabrication sur le canal, sans leurs données » | ADR 0014 ; README, section « Temps réel » |
| B6 (+1) | Communication avec deux modules existants : le Village (paiement, compensation, capacité) et le Marché (échange d'objets) | `messages.ts`, `market/application/market-service.ts`, `market/contracts.ts`, `market/ui.tsx` | `market-api.test.ts` : bloc « échange d'objets de la Forge » (6 tests, Village extrait compris) | ADR 0013 ; `architecture.md` : diagramme « Échange d'un objet au Marché » |

Le total revendiqué dépasse le plafond de 5 points : B6 est déclaré en complément.

## Écarts avec la fiche de cadrage

La fiche est restée dans son état validé ; les écarts sont recensés ici.

1. **Échange des objets au Marché, ajouté.** La fiche ne prévoyait pas d'échanger les objets
   forgés. Pour leur donner une valeur de jeu, la Forge est devenue une participante de la
   saga du Marché : elle retire et verse des objets à sa demande. Le Marché a été modifié
   par ses entrées publiques uniquement : son contrat de publication accepte des objets, son
   service aiguille chaque mouvement vers la Forge ou le Village, et son écran propose les
   objets en stock. Chaque côté d'une offre porte un seul type de bien (ADR 0013).
2. **Expiration du paiement, ajoutée.** La fiche ne fixait aucune limite à l'attente d'un
   paiement. Une commande dont le paiement reste sans réponse expire au bout de dix minutes,
   et libère sa place ; un paiement qui arrive ensuite est restitué en entier (ADR 0014). La
   règle 9 s'étend donc à ce cas : la totalité du coût d'une commande expirée est restituée.
3. **Table `forge.workshops` conservée à l'effacement.** La fiche annonçait sa suppression avec
   le compte. C'est un modèle de lecture, reconstruit à partir du journal : supprimer la ligne
   ne servirait à rien, puisqu'elle serait recréée à la reconstruction suivante. Elle ne
   contient que l'identifiant, pseudonymisé comme dans le journal, et le niveau de la forge.

## Indicateurs au rendu

| Indicateur | À l'étiquette `td11-fin` | Au rendu |
| --- | --- | --- |
| Nombre de tests | 232 | 289 |
| Couverture des lignes | 75,00 % | 74,50 % |
| Violations des règles d'architecture | 0 | 0 |

Le détail, dont la couverture de chaque partie de la Forge, figure dans le
[bilan technique](../bilan-technique.md).

## Usage de l'IA générative

Outil utilisé : Claude Code (Anthropic), dans l'éditeur.

- **Code** : je prenais les décisions d'architecture, et Claude Code générait des blocs
  de code à intégrer dans les fichiers.
- **Documents** : aide à la rédaction au format Markdown des documents.

Vérification : j'ai relu chaque modification avant de la commiter, exécuté `pnpm lint:fix`,
`pnpm verify` et `pnpm build` à chaque étape, et testé chaque fonctionnalité dans le
navigateur, à deux comptes pour les échanges et le temps réel. J'ai refusé et/ou corrigé quand l'IA prenait 
trop d'initiative comme par exemple une lecture directe de la route HTTP de la Forge par le Marché, 
contraire à l'architecture du projet.
