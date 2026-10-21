# Revue de conformité au RGPD

- Date : 2026-10-21
- Périmètre : données personnelles de l'ensemble du jeu, export et effacement, durées de conservation, journaux techniques.
- Références : RGPD, articles 5, 15, 17, 20, 25 et 30 ; registre des traitements ; ADR 0008.

| N° | Exigence | Vérification | Constat | Statut |
| --- | --- | --- | --- | --- |
| R1 | Chaque emplacement de données personnelles figure au registre des traitements | Comparaison du registre et de l'inventaire de la sous-partie 1.2 du TD10 | Les 14 tables des migrations sont couvertes ; seule `identity.verification`, inutilisée et vide, n'y figure pas. | conforme |
| R2 | L'export contient toutes les données du joueur, module par module | Test « exporte les données du joueur, module par module, en un fichier JSON » ; lecture d'un export réel | Le test passe, et l'export réel de Zéphyrine contient une section par module. | conforme |
| R3 | L'export ne contient ni les données des autres joueurs, ni les secrets du jeu ou du compte | Test « ne contient ni les données des autres joueurs, ni les secrets du jeu » ; recherche de « password » et « token » dans un export | Le test passe ; l'export réel ne contient ni « password », ni « token », ni « seed ». | conforme |
| R4 | Après la suppression d'un compte, son nom et celui de son village n'apparaissent plus dans aucune table | Suppression d'un compte de test, puis recherche de son nom dans toutes les tables | Ni « Zéphyrine » ni « Brumeval » n'apparaissent plus dans aucune table après la suppression. | conforme |
| R5 | L'effacement est tracé, sans conserver de donnée sur le joueur, et peut être relancé | Tests « enregistre l'effacement dans le registre... » et « peut être relancé sans effet supplémentaire » | Les tests passent ; la ligne du registre ne contient que la date et 2 événements réécrits. | conforme |
| R6 | Les messages de la Taverne ne sont pas conservés plus de trente jours, même sans visite | Tests de la durée de conservation ; compte rendu de la tâche quotidienne dans les journaux de Vercel | Les tests passent ; le compte rendu de la tâche n'est pas écrit dans les journaux de Vercel. | conforme |
| R7 | La présence ne constitue aucun historique des visites | Test « considère comme parti un joueur sans signal depuis deux minutes, et supprime sa ligne » | Le test passe ; une seule ligne par joueur, supprimée deux minutes après le dernier signal. | conforme |
| R8 | Les sessions expirées ne sont pas conservées indéfiniment | Requête SQL sur `identity.session` : sessions dont `expires_at` est passé | Better Auth ne supprime jamais une session expirée dont le cookie a disparu. | non conforme |
| R9 | Les journaux techniques ne contiennent pas de données personnelles au-delà du nécessaire | Lecture de `app.onError` dans `create-api.ts` ; consultation des journaux de Vercel | Une insertion de message qui échoue journalise son contenu et l'identifiant de l'auteur. | non conforme |
| R10 | Après la suppression d'un compte, l'identifiant conservé ne peut plus être relié à une personne | Recherche de l'identifiant dans `identity`, `platform.outbox` et les journaux de Vercel | Les journaux de Vercel relient l'identifiant à une adresse IP pendant une heure. | risque accepté |

## Synthèse

Sur 10 exigences, 7 sont conformes, 2 sont non conformes (R8, R9) et 1 est en risque
accepté (R10).

Manipulation sur la base de développement (R4) : un compte « Zéphyrine » a fondé
« Brumeval », ouvert une expédition, écrit dans la Taverne et signalé sa présence. Après la
suppression du compte, la recherche ne trouve ni les deux noms ni l'adresse électronique.
L'identifiant subsiste seulement dans les 2 événements réécrits de `platform.events`.

Précisions :

- **R1** : la comparaison porte sur les tables des migrations. `platform.projections` ne
  contient aucune donnée personnelle. `identity.verification` ne servirait qu'à vérifier une
  adresse, ce que le jeu ne fait pas.
- **R6** : la route quotidienne renvoie son compte rendu dans la réponse, sans l'écrire dans
  les journaux. Vercel ne garde alors que la ligne de la requête et son code, pendant une heure.
- **R8** : en développement, 0 session expirée sur 3, mais aucune n'a encore atteint ses sept
  jours. Le cookie expire en même temps que la session : le navigateur ne le présente donc
  plus, et Better Auth ne supprime pas la ligne. L'adresse IP et le navigateur restent
  conservés jusqu'à la suppression du compte, contrairement à la durée inscrite au registre
  (T2). Le comptage en production reste à faire dans la console SQL de Neon.
- **R9** : un test temporaire a fait échouer l'insertion d'un message. Drizzle place la
  requête et ses paramètres dans le message de l'erreur, que `console.error` écrit en entier :
  `params: zephyrine,zephyrine,Mon adresse : 12 rue des Lilas,…`. Ces données sont conservées
  par Vercel, hors de portée de l'effacement.
- **R10** : `/api/stream/village-<identifiant>` figure dans les journaux, avec l'adresse IP et
  le navigateur. L'offre Hobby garde ces journaux une heure. Passé ce délai, l'identifiant
  conservé dans `platform.events` et `platform.outbox` n'est plus relié à personne. Le risque
  est accepté pour cette durée, à réexaminer si la conservation des journaux est allongée
  (offre Pro : un jour ; Observability Plus : trente jours).

Actions décidées :

- **R8** : supprimer les sessions expirées dans la tâche quotidienne.
- **R9** : ne journaliser que le type et le code de l'erreur, sans sa requête ni ses
  paramètres.
- **R10** : réexaminer le risque à tout changement d'offre de Vercel ou de drain de journaux.
