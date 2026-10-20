# ADR-0003 - Server-Sent Events alimentés par le journal pour la diffusion en temps réel

- Statut : accepté
- Date : 2026-10-20

## Contexte

Les joueurs doivent voir les changements sans recharger la page : d'abord entre les onglets
d'un même joueur, puis entre les participants d'une partie du Donjon (TD6). Les actions
passent déjà par l'API en HTTP authentifié ; seul le sens serveur vers navigateur manque.

L'hébergement impose ses limites : durée d'exécution plafonnée sur Vercel, instances
multiples sans mémoire partagée, aucune infrastructure supplémentaire avec l'offre gratuite.
Le journal d'événements de l'ADR-0002, avec ses versions croissantes par flux, existe déjà.

## Décision

Les changements sont diffusés par des Server-Sent Events sur `/api/stream/<canal>`. Un canal
correspond à un flux du journal, et l'identifiant de chaque message est la version de
l'événement : après une coupure, le navigateur reprend grâce à l'en-tête `Last-Event-ID`.

Le serveur relit le journal toutes les demi-secondes et ferme le flux au bout de 240
secondes ; le navigateur se reconnecte alors de lui-même.

Seuls les joueurs connectés ont accès aux flux. Chaque module déclare la règle d'accès à ses
canaux, et un canal qu'aucune règle ne couvre est refusé.

À chaque notification, l'interface relit sa vue auprès de l'API au lieu d'appliquer
elle-même l'événement.

Mise en œuvre : `src/platform/realtime/` (`stream-api.ts`, `channel-policy.ts`,
`use-channel.ts`).

## Conséquences

### Positives

- SSE repose sur une simple réponse HTTP : la route passe par la même API, le même cookie de
  session et les mêmes contrôles d'accès que le reste, sans protocole supplémentaire.
- La reconnexion et la reprise sont gérées par le navigateur (`EventSource`) : grâce aux
  versions du journal, aucun événement n'est perdu après une coupure ou une fermeture
  volontaire du flux.
- Comme le serveur ne garde aucun état, le fonctionnement est le même avec une ou plusieurs
  instances, et tient dans l'offre gratuite sans ajouter de service.
- Le mécanisme est générique : le Donjon n'aura qu'à déclarer ses canaux et leur règle
  d'accès pour en profiter.
- Relire la vue plutôt qu'appliquer les événements évite de dupliquer la logique du jeu dans
  le navigateur.

### Négatives

- Chaque onglet ouvert interroge le journal deux fois par seconde, même quand rien ne se
  passe : soit environ 120 lectures par minute et par onglet, qui pèsent sur la base à
  mesure que le nombre de joueurs connectés augmente.
- Un événement peut mettre jusqu'à une demi-seconde à être reçu, un peu plus s'il tombe
  pendant la reconnexion qui suit la fermeture du flux. Ça convient au Village, mais ce n'est
  pas du temps réel au sens strict.
- Chaque notification provoque une requête supplémentaire pour relire la vue, et toutes les
  quatre minutes une nouvelle connexion est ouverte.
- Un flux ouvert occupe une fonction Vercel pendant toute sa durée, ce qui consomme le
  quota de temps d'exécution de l'offre gratuite.
- SSE ne fonctionne que dans un sens : si un jour le navigateur doit envoyer des messages
  très fréquents, il faudra autre chose.

## Alternatives écartées

- **Les WebSocket** : ils permettent d'échanger dans les deux sens, mais on n'en a pas
  besoin puisque les actions passent déjà par l'API. Surtout, les fonctions Vercel ne
  peuvent pas maintenir de connexion WebSocket ; il faudrait un serveur ou un service à
  part, ce que l'offre gratuite ne permet pas.
- **L'interrogation périodique par le navigateur** : le navigateur redemanderait la vue à
  intervalle régulier. C'est le plus simple, mais chaque requête refait tout le parcours
  (authentification, chargement du village), et il faudrait choisir entre un délai long ou
  beaucoup de requêtes inutiles. SSE fait la même chose côté serveur, à moindre coût, avec
  une reprise propre.
- **Une notification partagée entre instances** (`LISTEN/NOTIFY` de PostgreSQL ou un
  service de messagerie) : elle éviterait de relire le journal en boucle, puisque chaque
  instance serait prévenue d'une nouvelle écriture. Mais `LISTEN` demande une connexion
  permanente à la base, ce qui ne s'accorde pas avec des fonctions éphémères et un pool de
  connexions limité, et un service de messagerie serait une infrastructure de plus à
  héberger.

## Réexamen

À revoir si :

- le nombre de joueurs connectés en même temps devient tel que les lectures du journal
  pèsent sur la base ;
- un besoin de communication du navigateur vers le serveur à très faible délai apparaît,
  par exemple pour un mode de jeu plus rapide dans le Donjon ;
- l'hébergeur propose une prise en charge stable des WebSocket, ou un mécanisme de
  notification utilisable depuis des fonctions sans serveur.

## Usage de l'IA générative

Aucun
