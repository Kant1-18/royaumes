# Revue de sécurité du Donjon : dissimulation d'informations et intégrité du jeu

- Date : 2026-10-20
- Périmètre : API du module Donjon, canal temps réel des expéditions, tirages au sort.
- Références : OWASP Top 10 (A01 Broken Access Control, A04 Insecure Design).

| N° | Exigence | Vérification | Constat | Statut |
| --- | --- | --- | --- | --- |
| D1 | La vue d'une expédition ne contient ni la graine ni le contenu des salles non explorées | Test « ne transmet ni la graine ni le contenu des salles suivantes » | Le test passe : la vue ne contient ni `seed` ni les salles suivantes. | conforme |
| D2 | L'action choisie par un héros n'est connue que de son joueur jusqu'à la résolution de la manche | Tests « cache l'action choisie par les autres héros » et « ne révèle pas l'action d'un héros aux autres joueurs » ; outils de développement | Tests passés avec deux comptes, l'action d'un allié reste masquée dans la vue et le flux. | conforme |
| D3 | Le canal d'une expédition n'est accessible qu'à ses membres | Test « réserve le canal d'une expédition à ses membres (403) » | Le test passe : un non-membre reçoit une erreur 403. | conforme |
| D4 | Le canal d'une expédition ne transmet aucune donnée d'événement, ni par le flux, ni par la route de repli | Tests du bloc « Canal discret » et « signale l'action d'un héros sans la révéler » | Les tests passent : seuls le type et la version des événements sont transmis. | conforme |
| D5 | Un joueur ne peut agir qu'en son propre nom | Lecture de `api.ts` : aucune route n'accepte d'identifiant de joueur | Toutes les routes lisent le joueur dans `c.var.userId`, issu de la session. | conforme |
| D6 | Seul l'hôte lance l'expédition, et seul le héros dont c'est le tour ouvre une porte | Tests « ne laisse que l'hôte lancer l'expédition » et « fait ouvrir les portes à tour de rôle » | Les tests passent : `NOT_HOST` pour un non-hôte, `NOT_YOUR_TURN` hors de son tour. | conforme |
| D7 | Un joueur ne peut ni choisir ni prévoir le résultat d'un tirage au sort | Lecture de `dungeon-service.ts` : graine tirée par le serveur ; exigence D1 | Graine tirée par le serveur (`crypto.getRandomValues`) et jamais transmise (D1). | conforme |
| D8 | L'échéance d'une manche est appréciée par l'horloge du serveur | Commande d'échéance envoyée avant l'échéance | Une échéance envoyée avant la fin du compte à rebours laisse la manche inchangée. | conforme |
| D9 | Une action destinée à une manche déjà résolue est refusée | Test « refuse un choix pour une manche déjà résolue » | Le test passe : le choix est refusé avec `ROUND_OVER`. | conforme |
| D10 | Connaître l'adresse d'une expédition ne permet pas d'y agir sans en être membre | Action envoyée par un joueur qui n'est pas membre | Un non-membre reçoit 403 `NOT_A_MEMBER` ; il peut consulter la vue, ce qui est voulu (rejoindre par l'adresse, vue publique, UUID non devinable). | conforme |
| D11 | Aucun joueur ne peut agir au nom d'un compagnon ni écouter le canal en son nom | Test « présente le compagnon comme prêt, et ne le compte pas parmi les membres » ; fonction `isMember` de `rules.ts` | Le test passe : un compagnon n'est pas membre, ses actions sont refusées (`NOT_A_MEMBER`) et le canal lui est fermé. | conforme |
| D12 | L'intelligence artificielle ne transmet aux joueurs aucune information qu'ils n'auraient pas autrement | Lecture de `companion.ts` et `monster-strategies.ts` ; vue filtrée inchangée | Le compagnon décide sur le début de manche sans connaître les actions des joueurs, et les monstres, qui les connaissent, ne sont révélés qu'une fois la manche résolue, dans `RoundResolved`. | conforme |
| D13 | Le canal du classement ne transmet aucune donnée d'événement, en particulier la graine d'une expédition | Test « annonce sur son canal les événements du classement, sans leurs données » | Règle du canal discrète (`redact: true`) ; le test passe : la réponse ne contient pas `seed`. | conforme |
| D14 | Les informations transmises par le canal du classement sont déjà accessibles à tout joueur connecté | Lecture de la fonction `present` de `stream-api.ts` ; réponse de l'API du classement | Restent position, type, version et flux : les identifiants de joueurs sont déjà publics via l'API du classement, et ceux d'expéditions ne permettent ni d'agir (D10) ni d'écouter (D3). | conforme |

## Synthèse

Les 14 exigences sont conformes.
