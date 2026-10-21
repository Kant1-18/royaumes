# Registre des traitements de données personnelles

Ce registre, prévu par l'article 30 du RGPD, recense les traitements de données personnelles
réalisés par Royaumes. Il est tenu à jour à chaque évolution du jeu qui ajoute, modifie ou
supprime une donnée personnelle, dans le même commit que cette évolution.

- Responsable du traitement : Quentin Stempfer, quentin.stempfer@gmail.com.
- Date de dernière mise à jour : 2026-10-21.

## Sous-traitants

| Sous-traitant | Rôle | Localisation des données | Garanties à vérifier |
| --- | --- | --- | --- |
| Vercel | Hébergement de l'application, journaux techniques | Fonctions à Francfort (fra1) ; traitement principal aux États-Unis | DPA réservé aux offres Pro et Enterprise : l'offre Hobby n'en bénéficie pas. Transferts encadrés par les clauses contractuelles types |
| Neon | Hébergement de la base de données | Région de Francfort (aws-eu-central-1) | DPA intégré aux conditions d'utilisation. Transferts vers les États-Unis encadrés par le Data Privacy Framework |

## Traitements

| N° | Traitement | Finalité | Données | Personnes concernées | Base légale | Durée de conservation | Emplacement |
| --- | --- | --- | --- | --- | --- | --- | --- |
| T1 | Comptes des joueurs | Permettre l'accès au jeu | Nom, adresse électronique, empreinte du mot de passe, date d'inscription | Joueurs | Exécution du contrat (conditions d'utilisation du jeu) | Jusqu'à la suppression du compte | `identity.user`, `identity.account` |
| T2 | Sessions | Maintenir la connexion ; limiter les tentatives de connexion | Adresse IP, navigateur, dates de la session | Joueurs | Exécution du contrat ; intérêt légitime (sécurité) | Jusqu'à l'expiration de la session, ou la suppression du compte | `identity.session` |
| T3 | Activité de jeu | Faire fonctionner le Village, le Donjon, le Marché et le Classement | Identifiant, nom du joueur, nom du village, actions de jeu | Joueurs | Exécution du contrat | Jusqu'à la suppression du compte ; ensuite, identifiant pseudonymisé et noms remplacés (ADR 0008) | `platform.events`, `platform.outbox`, `ranking`, `dungeon`, `market` |
| T4 | Messagerie de la Taverne | Permettre aux joueurs de discuter | Contenu des messages, auteur, date | Joueurs | Exécution du contrat | Trente jours, ou jusqu'à la suppression du compte | `tavern.messages` |
| T5 | Présence dans la Taverne | Indiquer les joueurs présents | Identifiant, nom, date du dernier signal | Joueurs | Exécution du contrat | Deux minutes après le dernier signal | `tavern.presence` |
| T6 | Registre des effacements | Démontrer la réalisation des effacements | Date de l'effacement, nombre d'événements réécrits ; aucune donnée sur le joueur | Aucune personne identifiable | Obligation légale (responsabilité, article 5) | Illimitée | `platform.erasures` |
| T7 | Journaux techniques | Diagnostiquer les erreurs, assurer la sécurité | Adresse IP, adresses des requêtes, messages d'erreur | Joueurs, visiteurs | Intérêt légitime (sécurité, maintenance) | Une heure (offre Hobby de Vercel) | Vercel |

## Droits des personnes

| Droit | Mise en œuvre |
| --- | --- |
| Accès et portabilité (articles 15 et 20) | Page « Mes données » : export JSON de toutes les données du joueur |
| Effacement (article 17) | Page « Mes données » : suppression du compte, effective dans tous les modules |
| Rectification (article 16) | Non mis en œuvre : le nom d'un joueur ne peut pas encore être modifié |

## Pour approfondir

- Rectification : une page « Mes données » pourrait permettre de modifier le nom du joueur.
  Le changement serait enregistré comme un événement, puis appliqué par les modèles de lecture
  (`ranking`, `dungeon`, `market`, `tavern`), comme l'effacement l'est déjà.
- Vercel : passer à l'offre Pro rendrait le DPA applicable, et allongerait les journaux à un jour.
- Neon appartient désormais à Databricks, dont les conditions et la liste de sous-traitants
  s'appliquent. Les sauvegardes ne sont pas explicitement localisées à Francfort.

Sources consultées le 2026-10-21 :
[DPA de Vercel](https://vercel.com/legal/dpa),
[journaux de Vercel](https://vercel.com/docs/logs/runtime),
[DPA de Neon](https://neon.com/dpa),
[Neon et le RGPD](https://neon.com/blog/gdpr-compliance-and-neon),
[régions de Neon](https://neon.com/docs/introduction/regions),
[sous-traitants de Databricks](https://www.databricks.com/legal/databricks-subprocessors).
