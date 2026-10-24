# ADR-0009 - Extraction du Village en service autonome, préparée mais non déployée

- Statut : accepté
- Date : 2026-10-22

## Contexte

L'ADR 0001 a retenu un monolithe modulaire, avec une promesse : des frontières entre modules
assez strictes pour qu'un module puisse être extrait dans un service, le jour où le besoin
apparaîtrait. Cette promesse n'avait jamais été vérifiée.

Les raisons d'extraire un module sont précises : une charge très différente de celle des
autres modules, une équipe distincte chargée du module, un rythme de déploiement propre, ou
une technologie différente. Aucune ne s'applique aujourd'hui au jeu, développé par une seule
personne et joué par quelques dizaines de joueurs.

Le Village est le meilleur candidat : son domaine ne dépend d'aucun autre module, il ne lit
les données d'aucun autre module, et sa relation avec le Marché passe déjà par des messages.
L'inventaire de ses dépendances en révèle cependant deux qui ne passent pas par le code : le
Classement et le canal temps réel du village lisent ses événements dans le journal commun.
Aucune importation ne les trahit, et aucune règle de dependency-cruiser ne les signale.

## Décision

Le Village peut s'exécuter dans un service autonome (`src/services/village`, démarré par
`scripts/village-service.ts`), doté de sa propre base, de son propre journal et de sa propre
boîte d'envoi. Le service assemble le module Village sans le modifier, par son seul point
d'entrée public.

L'application devient alors une passerelle : elle reçoit une version distante du module
Village (`src/modules/realm/remote.ts`), de même forme que la version exécutée dans le
processus (API, règle du canal, gestionnaires de messages, données personnelles). Le reste de
l'application ne voit pas la différence.

Les messages de la saga du Marché franchissent la frontière par une boîte de réception
(`src/platform/outbox/inbox-api.ts`), sans changer les garanties de la boîte d'envoi :
livraison au moins une fois, gestionnaires idempotents.

Un relais recopie le flux d'événements publié par le service dans le journal de
l'application, avec le même flux et la même version : le Classement et le canal temps réel
continuent de le lire là, sans modification. Une copie déjà déposée est refusée par la
contrainte d'unicité du journal : le relais est idempotent.

Les échanges entre les deux processus sont authentifiés par un secret partagé
(`SERVICE_SECRET`, `src/platform/http/service-auth.ts`), qui n'est jamais versionné.

Le service n'est pas déployé : en production, faute des variables `REALM_SERVICE_URL` et
`SERVICE_SECRET`, le Village s'exécute dans l'application. L'ADR 0001 reste l'architecture du
projet ; cet ADR précise les conditions dans lesquelles il céderait la place, pour le Village,
à un service déployé.

## Conséquences

### Positives

- Les frontières du Village sont démontrées, et non plus supposées : l'extraction n'a demandé
  aucune modification de son domaine ni de ses consommateurs.
- Six tests de contrat (`src/bootstrap/village-service.test.ts`) vérifient ces frontières à
  chaque construction, et les modules ajoutés depuis, comme la Forge, sont testés avec un
  Village extrait.
- L'extraction est réversible sans migration de données : il suffit de retirer deux variables
  d'environnement.
- La boîte de réception et l'authentification entre services sont réutilisables pour tout
  autre module.
- Le coût réel d'une extraction est mesuré : le module distant, le relais et la racine de
  composition du service.

### Négatives

- Deux chemins d'exécution du Village sont à maintenir, l'un dans le processus, l'autre
  distant.
- Les événements du Village sont copiés dans le journal de l'application, avec une cohérence
  différée : un événement n'y apparaît qu'une fois relayé.
- Des dettes doivent être remboursées avant tout déploiement du service : ses migrations, la
  pagination de son flux publié et la distribution de sa boîte d'envoi (DT-014 à DT-016).
- L'authentification par secret partagé permettrait, en cas de fuite, de se faire passer
  pour n'importe quel joueur auprès du service.

## Alternatives écartées

- **Déployer le service** : aucune raison d'extraire ne s'applique, et un second déploiement
  ajouterait un coût d'exploitation sans bénéfice.
- **Ne pas extraire** : les frontières seraient restées une hypothèse, que rien ne vérifiait.
- **Faire lire à distance le flux publié par le Classement et le canal temps réel** : il
  aurait fallu modifier ces consommateurs ; le relais les laisse inchangés.
- **Extraire un autre module, comme le Marché** : sa saga lie son sort à celui du Village, et
  il lit les contrats de plusieurs modules.
- **Un jeton signé ou le TLS mutuel pour authentifier les échanges** : plus sûrs, mais plus
  coûteux à mettre en place, pour un service qui n'est pas déployé.

## Réexamen

À revoir si l'un des signes suivants apparaît :

- le Village dépasse le budget de performance (`perf/budget.json`) alors que les autres
  modules le respectent ;
- une seconde équipe est chargée du Village ;
- le Village doit être déployé plus souvent que le reste du jeu ;
- le Village a besoin d'une technologie ou d'une base différente.

## Usage de l'IA générative

Claude Code m'a aidé à rédiger ce document au format Markdown, à partir de l'énoncé du TD11 et
du code de l'extraction déjà présent dans le dépôt. J'ai relu le texte et vérifié qu'il
correspond au code.
