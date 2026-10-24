# Bilan technique de Royaumes

- Date : 2026-10-24
- Version examinée : étiquette `td11-fin`, mise à jour au rendu de l'évaluation (module Forge)
- Auteur : Quentin STEMPFER

Ce bilan dresse l'état technique du projet au terme de son développement, à partir de ses
décisions d'architecture, de ses indicateurs de qualité, de sa dette technique et de ses
revues. Il s'adresse à la personne qui reprendrait le projet. Chaque tableau présente l'état à
l'étiquette `td11-fin`, puis au rendu de l'évaluation, qui a ajouté le module Forge.

## 1. Le système livré

| Élément | `td11-fin` | Rendu |
| --- | --- | --- |
| Modules métier | 6 | 7 (ajout de `forge`) |
| Briques de la plateforme | 9 | 9 |
| Services extraits | 1 (Village, non déployé) | 1 |
| Lignes de code, hors tests (`src`, `app`) | 8 253 | 9 705 |
| Fichiers de test, nombre de tests | 33, 232 | 37, 289 |
| Commits | 75 | 100 |
| Hébergement | Vercel (Francfort), base Neon (Francfort) | Inchangé |

| Module | Stockage | Lignes, hors tests (`td11-fin`) | Lignes, hors tests (rendu) |
| --- | --- | --- | --- |
| `realm` | Event Sourcing | 1 093 | 1 097 |
| `dungeon` | Event Sourcing, projection des expéditions ouvertes | 2 064 | 2 064 |
| `market` | Event Sourcing, projection des offres, saga | 1 271 | 1 308 |
| `ranking` | Projection du journal | 459 | 459 |
| `tavern` | Tables ordinaires | 678 | 678 |
| `system` | Aucun | 73 | 73 |
| `forge` | Event Sourcing, projection de la capacité des ateliers, saga | — | 1 368 |
| Service `village` | Racine de composition du service extrait | 77 | 77 |

Mesures : la boucle de la partie 2 du TD11 (`git ls-files … | grep -v '\.test\.ts$' | xargs cat | wc -l`),
appliquée à chacune des deux étapes. Les modules existants n'ont presque pas changé pendant
l'évaluation : 4 lignes pour le Village (le bâtiment forge), 37 pour le Marché (l'échange
d'objets).

## 2. Les décisions d'architecture

| ADR | Décision | Mise à l'épreuve | Bilan |
| --- | --- | --- | --- |
| 0001 | Monolithe modulaire | Extraction du Village (TD11) ; ajout d'un module complet à l'évaluation | A tenu : l'extraction n'a modifié ni le domaine du Village ni ses consommateurs, et la Forge s'est ajoutée par les seules entrées publiques, sans modifier les règles d'architecture |
| 0002 | Event Sourcing pour le Village | Projections du Classement (TD8) et de la Forge (évaluation), relais du service extrait | A tenu : chaque nouveau besoin s'est servi de l'historique existant, sans migration de données |
| 0003 | Server-Sent Events alimentés par le journal | Canaux discrets, globaux et à source propre ; canal de la Forge | A tenu, au prix d'une charge qui croît avec le nombre de flux ouverts (deux par joueur sur l'écran du Marché) |
| 0004 | Manches simultanées et échéances paresseuses | Échéances de fabrication et de paiement de la Forge | A tenu : le même principe a servi sans tâche de fond |
| 0005 | Intelligence artificielle déterministe | Script de simulation des expéditions | A tenu : comportements reproductibles et testés ; l'équilibre à quatre joueurs reste à revoir |
| 0006 | CQRS et projections rattrapées à la lecture | Mesure de performance du TD11 ; projection de la Forge | A tenu, après une optimisation mesurée (rattrapage évité lorsque la projection est à jour) |
| 0007 | Saga orchestrée et boîte d'envoi | Panne partielle du TD11 ; sagas de paiement, de compensation et d'échange d'objets de la Forge | A tenu : la Forge a orchestré sa saga et participé à celle du Marché sans nouveau code dans la plateforme |
| 0008 | Taverne sans Event Sourcing, réécriture ciblée du journal | Revue de conformité (TD10) ; ajout de la Forge | A tenu : la Forge, sans nom ni texte libre dans ses événements, n'a rien à réécrire |
| 0009 | Extraction du Village, préparée mais non déployée | Tests de contrat, et tests de la Forge avec un Village extrait | A tenu : les deux configurations passent les mêmes tests ; trois dettes restent à rembourser avant un déploiement |
| 0010 | La forge, bâtiment du Village, et la capacité tenue par une projection | Tests de la projection ; Village extrait | A tenu : la capacité est lue dans le langage publié, sans modifier les contrats du Village |
| 0011 | Journal d'événements pour les commandes de la Forge | Commandes simultanées ; mouvements d'objets du Marché | A tenu : la concurrence optimiste garantit la capacité ; le flux s'allonge avec les échanges (DT-011) |
| 0012 | Paiement des commandes par une saga avec le Village | Village extrait ; réponses en double ou tardives | A tenu ; sa conséquence sur les paiements abandonnés a été corrigée par l'ADR 0014 |
| 0013 | Échange des objets de la Forge au Marché | Six tests de l'API, dont un avec un Village extrait | A tenu : la saga du Marché n'a pas changé d'étapes ; une offre ne mêle pas ressources et objets |
| 0014 | Annulation compensée, expiration du paiement, canal de l'atelier | Tests de conservation des ressources ; paiement tardif | A tenu : aucune ressource n'est créée ni perdue au-delà de la part prévue par les règles |

## 3. La qualité

| Caractéristique | Indicateur | Valeur | Appréciation |
| --- | --- | --- | --- |
| Adéquation fonctionnelle | Tests réussis ; couverture des domaines | 232 tests à `td11-fin`, 289 au rendu, tous réussis ; domaine de la Forge couvert à 100 % des lignes | Satisfaisante : chaque règle de la fiche de la Forge est vérifiée par un test du domaine |
| Efficacité des performances | Débit et p99 des lectures ; respect du budget | `perf/apres.json` : de 678 (Marché) à 1 296 (Village) requêtes par seconde, p99 de 27 à 40 ms, aucune erreur ; budget : p99 < 500 ms | Satisfaisante, avec une large marge. La Forge ne figure pas encore dans les scénarios du test de charge |
| Fiabilité | Tests de concurrence, de reprise et d'idempotence ; messages abandonnés | Acceptations et commandes simultanées, messages remis deux fois, paiements tardifs testés ; messages abandonnés signalés et relancés par `scripts/dead-letters.ts` | Satisfaisante ; un test du temps réel est instable sous charge (attente fixe de 50 ms) |
| Sécurité | Exigences des revues de sécurité | 52 exigences, dont 51 conformes et 1 en risque accepté (S9) | Satisfaisante pour le jeu ; voir la section 5 |
| Maintenabilité | Règles d'architecture ; fonctions d'aptitude ; couverture | 8 règles et 2 fonctions d'aptitude, aucune violation ; couverture des lignes : 75,00 % à `td11-fin`, 74,50 % au rendu | Bonne pour le serveur. L'interface n'est vérifiée par aucun test automatique : c'est elle qui fait baisser la couverture au rendu |
| Flexibilité | Extraction d'un module ; changement de base entre local et production | Village exécutable dans un service ; PGlite en local et en test, Neon en production | Démontrée, sans déploiement du service |

Mesures : `pnpm test:coverage` (couverture de `src/`, hors tests), `pnpm lint:archi`, et les
résultats du test de charge du TD11 (`perf/avant.json`, `perf/apres.json`).

## 4. La dette technique

| Indicateur | Valeur |
| --- | --- |
| Entrées consignées | 18 |
| Entrées remboursées, dont à l'échéance prévue | 11, toutes à l'échéance prévue (DT-009, sans échéance fixée, remboursée dans l'incrément qui l'a suivie) |
| Entrées ouvertes | 7 |

Analyse : les sept premières entrées ont toutes été remboursées au TD prévu, et les quatre
dettes de la Forge l'ont été dans l'incrément suivant celui qui les avait créées. Les sept
entrées ouvertes se répartissent en trois groupes :

- **DT-010 et DT-011** (Forge) : pagination de l'historique et instantané de l'atelier, dont le
  coût croît avec l'activité d'un joueur, acceptable pour le volume du jeu ;
- **DT-014 à DT-016** (service Village) : elles ne concernent que le service extrait, qui n'est
  pas en production, et seraient à rembourser avant son déploiement ;
- **DT-017 et DT-018** (RGPD) : les deux actions décidées par la revue de conformité du TD10,
  restées sans suite. Elles n'avaient pas été reportées au registre ; elles le sont au moment
  de ce bilan. C'est la seule dette découverte en relisant les revues, et non consignée à sa
  création.

## 5. Les revues

| Revue | Exigences | Conformes | Non conformes ou en risque accepté | Actions ouvertes |
| --- | --- | --- | --- | --- |
| Sécurité de l'authentification | 16 | 15 | 1 en risque accepté (S9 : l'inscription révèle qu'une adresse est déjà utilisée) | Aucune : S3 est devenue DT-004, remboursée au TD11 |
| Sécurité du Donjon | 14 | 14 | 0 | Aucune |
| Sécurité du Marché | 10 | 10 | 0 | Aucune : DT-007, remboursée au TD11 |
| Sécurité de la Forge | 12 | 12 | 0 | Aucune |
| Conformité au RGPD | 10 | 7 | 2 non conformes (R8, R9), 1 en risque accepté (R10) | R8 et R9, consignées en DT-017 et DT-018 |

Chaque action ouverte figure désormais au registre de la dette.

## 6. Risques et recommandations

| N° | Risque | Signe avant-coureur | Recommandation |
| --- | --- | --- | --- |
| 1 | Charge des flux temps réel (ADR 0003) : chaque flux interroge le journal deux fois par seconde, et l'écran du Marché en ouvre deux | Temps de réponse de la base en hausse avec le nombre de joueurs connectés ; dépassement du budget de `perf/budget.json` | Ajouter les flux au test de charge ; mutualiser l'interrogation du journal entre les flux d'une même instance |
| 2 | Croissance du journal (ADR 0006 et 0008, DT-011) : reconstruction des projections, effacement d'un compte et relecture des ateliers s'allongent | Durée d'une reconstruction ou d'un effacement ; latence de `GET /api/forge` pour les joueurs les plus actifs | Instantanés des flux les plus longs ; reconstruction des projections hors consultation |
| 3 | Interface sans test automatique | Une régression signalée par un joueur, et non par `pnpm verify` | Un test de bout en bout avec Playwright, sur les parcours à deux joueurs : échange au Marché, objet de la Forge |

## 7. Conclusion

Le projet peut être repris et évoluer sans régression côté serveur : les règles d'architecture
et les fonctions d'aptitude, inchangées depuis `td11-fin`, ont suffi à guider l'ajout d'un module
complet, et les 289 tests vérifient les règles métier, les sagas et les contrats du Village
extrait. Deux conditions demeurent : rembourser les deux dettes RGPD (DT-017, DT-018) avant
toute ouverture à un public plus large, et couvrir l'interface par des tests de bout en bout,
qui ne sont aujourd'hui vérifiés qu'à la main.

## Usage de l'IA générative

Outil utilisé : Claude Code (Anthropic), dans l'éditeur.

- **Code et tests** : je prenais les décisions d'architecture, et Claude Code générait des blocs
  de code et des tests conformes à ces décisions.
- **Documents** : aide à la rédaction au format Markdown des documents, dont ce bilan.

Vérification : j'ai relu chaque modification avant de la commiter, exécuté `pnpm lint:fix`,
`pnpm verify` et `pnpm build` à chaque étape, et testé chaque fonctionnalité dans le
navigateur.