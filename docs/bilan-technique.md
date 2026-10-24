# Bilan technique

Ce bilan présente l'état technique de Royaumes au rendu de l'évaluation, qui a ajouté le module
Forge, et le compare à l'étiquette `td11-fin`. Les indicateurs ont été mesurés le 2026-10-24,
sur le dépôt à chacune des deux étapes.

## Décisions d'architecture

| N° | Décision | Statut | Apport |
| --- | --- | --- | --- |
| [0001](adr/0001-monolithe-modulaire.md) | Monolithe modulaire plutôt que microservices | Accepté | Modules isolés par leurs entrées publiques, contrôlés par dependency-cruiser |
| [0002](adr/0002-event-sourcing-village.md) | Event Sourcing pour le Village | Accepté | Historique complet du village, concurrence optimiste |
| [0003](adr/0003-server-sent-events.md) | Server-Sent Events, alimentés par le journal, pour le temps réel | Accepté | Un seul mécanisme de diffusion pour tous les modules |
| [0004](adr/0004-manches-simultanees.md) | Manches simultanées et échéances paresseuses pour le Donjon | Accepté | Échéances sans tâche de fond |
| [0005](adr/0005-intelligence-artificielle.md) | Intelligence artificielle déterministe, sans tâche de fond | Accepté | Compagnons reproductibles et testables |
| [0006](adr/0006-cqrs-projections.md) | CQRS : modèles de lecture tenus par des projections rattrapées à la lecture | Accepté | Lectures rapides, tables reconstructibles |
| [0007](adr/0007-saga-boite-envoi.md) | Saga orchestrée et boîte d'envoi transactionnelle pour les opérations entre modules | Accepté | Opérations entre modules sans perte ni double effet |
| [0008](adr/0008-donnees-personnelles.md) | Stockage classique pour la Taverne, et réécriture ciblée du journal pour l'effacement | Accepté | Export et effacement des données personnelles |
| [0010](adr/0010-forge-stockage.md) | La forge, bâtiment du Village, et la capacité des ateliers tenue par une projection | Accepté | Capacité lue dans le langage publié du Village, sans le modifier |
| [0011](adr/0011-forge-commandes.md) | Journal d'événements pour les commandes de la Forge, un flux par atelier | Accepté | Capacité garantie par la concurrence optimiste ; état « forgé » déduit à la lecture |
| [0012](adr/0012-forge-communication.md) | Paiement des commandes de la Forge par une saga orchestrée avec le Village | Accepté | Paiement sans appel direct, identique avec un Village extrait |
| [0013](adr/0013-forge-marche.md) | Échange des objets de la Forge au Marché, la Forge participant à la saga d'échange | Accepté | Objets échangeables sans modifier les étapes de la saga du Marché |
| [0014](adr/0014-forge-compensation-temps-reel.md) | Annulation compensée, expiration du paiement et canal temps réel de l'atelier | Accepté | Étape compensable, atelier jamais bloqué, écrans à jour sans rechargement |

Le numéro 0009 est réservé à une décision du TD11, qui reste à consigner.

## Qualité

| Indicateur | `td11-fin` | Rendu | Évolution |
| --- | --- | --- | --- |
| Fichiers de test | 33 | 37 | +4 |
| Tests | 232 | 289 | +57 |
| Tests supprimés ou désactivés | — | 0 | Aucun |
| Couverture des instructions | 73,41 % | 73,05 % | −0,36 point |
| Couverture des branches | 64,20 % | 64,04 % | −0,16 point |
| Couverture des fonctions | 70,05 % | 68,78 % | −1,27 point |
| Couverture des lignes | 75,00 % | 74,50 % | −0,50 point |
| Règles de dependency-cruiser | 8 | 8 | Inchangées |
| Fonctions d'aptitude | 2 | 2 | Inchangées |
| Violations des règles d'architecture | 0 | 0 | — |
| Fichiers analysés par dependency-cruiser | 143 | 161 | +18 |
| Dépendances analysées | 454 | 534 | +80 |

Mesures : `pnpm test:coverage` (couverture de `src/`, hors tests), et
`pnpm lint:archi` pour les règles d'architecture. Les règles et les fonctions d'aptitude n'ont
pas été modifiées : la Forge les respecte telles qu'elles étaient à `td11-fin`.

La couverture globale baisse légèrement, alors que le code de la Forge est bien couvert :

| Partie de la Forge | Couverture des lignes |
| --- | --- |
| Domaine (`workshop.ts`, `saga.ts`, `view.ts`, `recipes.ts`) | 100 % |
| Application (`forge-service.ts`) | 95,9 % |
| Infrastructure (dépôt, projection, lecture de la capacité) | 94,1 % |
| Écran (`ui.tsx`) | 0 % |

La baisse vient des écrans : comme ceux des autres modules, l'écran de la Forge, et les ajouts
à l'écran du Marché, ne sont couverts par aucun test automatique. Ils ont été vérifiés à la main
dans le navigateur.

## Dette technique

Le [registre de la dette](qualite/dette-technique.md) comptait 7 entrées à `td11-fin`, toutes
remboursées. L'évaluation en a ajouté 6 :

| N° | Raccourci | Statut au rendu |
| --- | --- | --- |
| DT-008 | Aucune annulation d'une commande payée | Remboursée : annulation compensée (ADR 0014) |
| DT-009 | Paiement en attente compté comme actif sans limite de durée | Remboursée : délai de paiement (ADR 0014) |
| DT-010 | Historique complet des commandes dans la vue de l'atelier | Ouverte |
| DT-011 | Flux de l'atelier relu en entier à chaque requête | Ouverte |
| DT-012 | Écran de la Forge sans temps réel | Remboursée : canal de l'atelier (ADR 0014) |
| DT-013 | Inventaire de l'écran du Marché sans temps réel | Remboursée : `useInventory` (ADR 0014) |

Les deux dettes ouvertes croissent avec l'activité d'un joueur : le nombre de ses commandes pour
DT-010, et le nombre de ses commandes et de ses échanges au Marché pour DT-011. Elles restent
acceptables pour le volume du projet ; un instantané de l'atelier et une pagination de
l'historique les rembourseraient.

## Risques

| Risque | Conséquence | Mesure ou piste |
| --- | --- | --- |
| Charge des flux temps réel | Chaque flux interroge le journal deux fois par seconde, et l'écran du Marché en ouvre maintenant deux | Compromis de l'ADR 0003, à réexaminer si le nombre de joueurs connectés augmente |
| Délai de paiement plus court que les relances de la boîte d'envoi | Un paiement très retardé est restitué en entier, et le joueur doit recommander | Aucune perte de ressources ; délai réglable dans `workshop.ts` (ADR 0014) |
| Confiance accordée aux messages `forge.*` | Les gestionnaires acceptent l'identifiant de joueur du message | Sûr tant que seul le serveur enregistre des messages ; une extraction de la Forge demanderait d'authentifier les messages entre services |
| Écrans non testés | Une régression de l'interface n'est détectée qu'à la main | Des tests de bout en bout, par exemple avec Playwright |
| Test instable du temps réel (`src/platform/realtime/stream-api.test.ts`) | Échec occasionnel de `pnpm verify` lorsque la machine est chargée : le test attend 50 ms fixes avant d'enregistrer un événement | Attendre l'abonnement effectif du flux plutôt qu'un délai fixe |
| Croissance du flux d'un atelier (DT-011) | Le coût de chaque requête de la Forge augmente avec l'historique du joueur | Instantané de l'atelier |
