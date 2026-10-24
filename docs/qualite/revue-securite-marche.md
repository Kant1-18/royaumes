# Revue de sécurité du Marché : intégrité des échanges

- Date : 2026-10-24
- Périmètre : API du module Marché, gestionnaires de messages du Village et du Marché, boîte d'envoi et sa route de distribution, canal temps réel du Marché.
- Références : OWASP Top 10 (A01 Broken Access Control, A04 Insecure Design, A08 Software and Data Integrity Failures).

| N° | Exigence | Vérification | Constat | Statut |
| --- | --- | --- | --- | --- |
| M1 | Un joueur ne publie, n'accepte et ne retire une offre qu'en son propre nom | Lecture de `api.ts` : aucune route n'accepte d'identifiant de joueur | Aucune route ne lit d'identifiant de joueur : le vendeur, l'acheteur et l'auteur d'un retrait sont toujours `c.var.userId` ; une requête sans session reçoit 401. | conforme |
| M2 | Seul le vendeur peut retirer son offre et récupérer les ressources en séquestre | Test « restitue les ressources au vendeur qui retire son offre » | Le test passe : Bob reçoit 403 en retirant l'offre d'Alice, et les 60 bois en séquestre ne reviennent qu'à Alice. | conforme |
| M3 | Un joueur ne peut pas accepter sa propre offre | Tests « refuse l'acceptation de sa propre offre... » et « restitue les ressources au vendeur... » | Les tests passent : l'acceptation de sa propre offre est refusée (`OWN_OFFER`, 409), sans aucun mouvement de ressources. | conforme |
| M4 | Aucun échange ne crée ni ne détruit de ressources, y compris lors d'acceptations simultanées | Test « ne conclut l'échange qu'avec un seul acheteur, lors de deux acceptations simultanées » | Le test passe : une seule acceptation sur deux aboutit, l'autre reçoit 409, et les trois villages totalisent toujours 300 bois et 150 pierre. | conforme |
| M5 | Un message remis plusieurs fois n'a d'effet qu'une fois | Test « n'a qu'un effet, et ne répond qu'une fois, lorsqu'un message est remis deux fois » ; test « ignore une réponse en double... » | Les tests passent : un prélèvement remis deux fois n'est appliqué et n'est répondu qu'une fois, et une réponse en double ne fait pas progresser l'offre. | conforme |
| M6 | Les quantités échangées sont des entiers strictement positifs, à l'entrée de l'API comme à la réception d'un message | Publication d'une offre de -50 bois ; schéma `ResourceAmounts` | L'offre de -50 bois reçoit 400 `INVALID_INPUT`, et le stock reste à 100 bois ; les messages sont vérifiés par le même schéma à leur réception. | conforme |
| M7 | Aucun joueur ne peut provoquer un mouvement de ressources dans un village autrement que par une offre | Lecture des routes de l'API : aucune n'enregistre de message dans la boîte d'envoi | Les routes du Marché ne publient, n'acceptent et ne retirent que des offres ; les messages sont produits par la saga, avec les quantités de l'offre. | conforme |
| M8 | La route de distribution planifiée n'est accessible qu'avec le secret, absent du dépôt | Test « refuse une requête sans le secret attendu, et reste fermée sans secret configuré (401) » ; `git grep -n CRON_SECRET` | Le test passe ; la route est devenue `/api/cron/daily` au TD10. `CRON_SECRET` n'apparaît que dans le code, la documentation et `.env.example`, sans valeur. | conforme |
| M9 | Le canal du Marché ne transmet aucune donnée d'événement | Route de repli `/api/stream/market/events?after=0` | Les 4 événements renvoyés par la route de repli ont tous un champ `data` vide. | conforme |
| M10 | Les ressources manquantes lors d'un paiement refusé ne sont connues que de l'acheteur concerné | Consultation de l'offre par le vendeur après un paiement refusé | Après un paiement refusé, l'acheteur voit `missing: { stone: 30 }`, et le vendeur `missing: null`. | conforme |

## Synthèse

Les 10 exigences sont conformes.

Vérifications faites le 2026-10-24, sur la base de test : les tests cités, et une sonde
temporaire, non versionnée, pour M6, M9 et M10, qui reproduit les manipulations demandées
(offre de -50 bois, route de repli du canal, offre consultée par le vendeur après un paiement
refusé). La revue, prévue au TD9, a été menée a posteriori, sur l'état du projet au rendu de
l'évaluation : les exigences portent donc aussi sur le Marché tel qu'il échange les objets de
la Forge.

Action décidée au TD9 : la dette DT-007 (messages abandonnés), remboursée au TD11 par le script
`scripts/dead-letters.ts`.
