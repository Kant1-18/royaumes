# ADR-0012 - Paiement des commandes de la Forge par une saga orchestrée avec le Village

- Statut : accepté
- Date : 2026-10-23

## Contexte

Une commande de la Forge se paie avec les ressources du village du joueur, qui appartiennent
au Village. Une transaction ne modifie jamais les données que d'un seul module (ADR-0007), et
le Village peut être extrait dans un service doté de sa propre base.

Le Village sait déjà prélever des ressources à la demande d'un autre module, sans le
connaître, en répondant à l'adresse indiquée dans la demande.

## Décision

Pour écrire chez le Village, la Forge lui envoie des messages ; pour lire le niveau de la
forge, elle lit son langage publié (ADR-0010). Elle n'appelle jamais le Village, et n'importe
que ses contrats.

Le paiement est une saga orchestrée par la Forge. La commande est enregistrée avec un message
`realm.withdraw` dans la boîte d'envoi ; le Village répond au sujet `forge.transfer-result`
par un prélèvement ou un refus, et la Forge lance la fabrication ou fait échouer la commande.
Le paiement est pour l'instant l'unique étape de la saga.

L'identifiant du mouvement, `forge:<joueur>:<commande>:pay`, est choisi par la Forge : il
sert de clé d'idempotence au Village, se distingue des mouvements du Marché, et désigne
l'atelier à la réception de la réponse. Seule une commande en attente de paiement progresse :
une réponse en double est sans effet.

La boîte d'envoi est distribuée après chaque commande et chaque consultation de la Forge.

Garanties : livraison au moins une fois, effet unique de chaque paiement, cohérence différée.

## Conséquences

### Positives

- Le Village ne connaît pas la Forge, et n'a pas été modifié pour la payer.
- La Forge fonctionne de la même manière avec un Village extrait.
- Une panne à n'importe quel moment ne crée ni ne perd de ressources.
- Aucun code n'est ajouté à la plateforme.

### Négatives

- Une commande reste « en paiement » jusqu'à la distribution du message, qui dépend de
  l'activité des joueurs.
- Un message de paiement abandonné bloque une place de l'atelier jusqu'à sa relance.
- La Forge dépend de la stabilité des contrats du Village.

## Alternatives écartées

- **Un appel direct au Village** : si l'application s'arrête entre la commande et l'appel,
  la demande est perdue.
- **Un prélèvement sans attendre de réponse** : la Forge ne saurait pas si le stock
  suffisait, et fabriquerait des objets non payés.
- **Une saga chorégraphiée**, où le Village réagirait aux commandes : il devrait connaître la
  Forge, et le déroulement serait éparpillé entre les modules.

## Réexamen

À revoir si la Forge est extraite dans un service, ou si le Village change ses contrats.

## Usage de l'IA générative

Claude Code a généré certains blocs de code TypeScript du module, conformément aux décisions
d'architecture que j'avais prises.
Il m'a aussi aidé à rédiger ce document au format Markdown.
J'ai relu le texte et vérifié qu'il correspond au code.
