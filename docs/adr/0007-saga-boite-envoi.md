# ADR-0007 - Sagas orchestrées et boîte d'envoi transactionnelle pour les opérations entre modules

- Statut : accepté
- Date : 2026-10-21

## Contexte

Un échange du Marché modifie les données du Marché et celles de deux villages : les
ressources du vendeur et le paiement de l'acheteur. L'échange ne doit ni créer ni perdre de
ressources, même si une panne survient au milieu.

Les modules ne doivent pas toucher aux données des autres (TD2), et l'un d'eux pourra être
extrait dans un service doté de sa propre base (TD11) : une transaction commune ne serait
alors plus possible. Enfin, l'hébergement ne permet aucun processus permanent (ADR-0004).

## Décision

Une transaction ne modifie jamais les données que d'un seul module.

Une opération qui concerne plusieurs modules est une saga, dont on identifie les étapes
compensables, l'étape pivot et les étapes reprises jusqu'au succès. Pour l'échange : la mise
en séquestre des ressources du vendeur est compensable, le prélèvement du paiement de
l'acheteur est le pivot, et les versements qui suivent sont repris jusqu'au succès.

La saga est orchestrée par le module qui porte l'opération, ici le Marché. Les participants,
comme le Village, ne connaissent pas la saga : ils répondent à l'adresse de retour indiquée
dans chaque demande.

Les messages sont enregistrés dans la boîte d'envoi de la plateforme, dans la même
transaction que les événements qui les déclenchent. Leur distribution est garantie au moins
une fois : un bail réserve le message pendant son traitement, un échec est retenté avec un
recul exponentiel, et le message est abandonné après dix tentatives. Chaque gestionnaire est
donc idempotent, grâce à une clé d'idempotence choisie par le demandeur.

La distribution a lieu après chaque commande et chaque consultation du Marché, et une fois
par jour par une tâche planifiée protégée par un secret (`CRON_SECRET`).

Mise en œuvre : `src/platform/outbox/` et `src/modules/market/domain/saga.ts`.

## Conséquences

### Positives

- Aucun module n'écrit dans les données d'un autre : les frontières tiennent, et
  l'extraction d'un module reste possible.
- Une panne à n'importe quel moment ne perd ni ne duplique aucune ressource : les messages
  sont enregistrés avec les événements, et les doublons sont absorbés par l'idempotence.
- Le Village peut servir d'autres demandeurs sans modification, puisqu'il se contente de
  répondre à l'adresse indiquée.
- La boîte d'envoi sert aussi de minuterie : l'expiration d'une offre est un message dont
  la distribution est différée jusqu'à son échéance.
- Le déroulement de la saga se lit en un seul endroit, dans le Marché.

### Négatives

- Les joueurs voient des états intermédiaires, comme une offre en règlement.
- La latence dépend de l'activité : une saga interrompue ne reprend qu'à la consultation
  suivante du Marché, ou le lendemain avec la tâche planifiée.
- Chaque gestionnaire doit être idempotent, et il faut tester ce qui se passe quand un
  message arrive deux fois.
- Les messages abandonnés après dix tentatives restent en base, mais aucun outil ne permet
  encore de les examiner (dette DT-007).
- La table de la boîte d'envoi grandit sans limite, les messages traités étant conservés.

## Alternatives écartées

- **Une transaction unique sur les données des deux modules** : la plus simple, mais elle
  oblige le Marché à écrire dans les tables du Village, et deviendrait impossible dès qu'un
  module aurait sa propre base.
- **Une transaction distribuée par validation en deux phases** : elle garderait
  l'atomicité, mais demande un coordinateur et des participants qui tiennent leurs verrous
  jusqu'à la décision finale, ce qu'on ne peut pas assurer avec des fonctions éphémères.
- **Un appel direct du Village par le Marché, sans boîte d'envoi** : si l'application
  s'arrête entre l'enregistrement de l'offre et l'appel, la demande est perdue, et les
  ressources avec elle.
- **Une saga chorégraphiée**, où chaque module réagit aux événements des autres : il n'y a
  plus de coordinateur, mais le déroulement est éparpillé entre les modules, et le Village
  devrait connaître les événements du Marché.
- **Le journal d'événements utilisé comme boîte d'envoi** : il ne sait pas suivre l'état
  d'une remise (bail, tentatives, succès), et un événement, qui ne peut plus être modifié,
  ne peut pas porter ces informations.

## Réexamen

À revoir si :

- un module est extrait dans un service distinct, ce qui demanderait une boîte d'envoi par
  base et un transport entre services ;
- le volume de messages justifie un courtier de messages dédié ;
- la distribution déclenchée par les requêtes ne suffit plus à tenir les délais attendus.

## Usage de l'IA générative

Rédaction assistée par Claude Code pour la reformulation. Relecture faite avant la validation.
