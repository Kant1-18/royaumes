# ADR-0008 - Stockage classique pour la Taverne et réécriture ciblée des champs personnels du journal pour l'effacement

- Statut : accepté
- Date : 2026-10-21

## Contexte

La Taverne conserve des messages et une présence qui sont faits pour disparaître. Les
joueurs disposent par ailleurs de droits d'accès, de portabilité et d'effacement qui portent
sur tout le jeu, pas seulement sur la Taverne.

Or des noms de joueurs sont copiés dans les événements du Donjon et du Marché, et un nom de
village dans ceux du Village. Certains de ces flux sont partagés avec d'autres joueurs,
comme une expédition ou un échange. Le journal est en ajout seul (ADR-0002), et les
projections en dépendent (ADR-0006).

## Décision

**La Taverne** n'utilise pas l'Event Sourcing : elle s'appuie sur des tables ordinaires,
dont les lignes sont supprimées à l'expiration de leur durée de conservation (trente jours
pour les messages). Son canal temps réel est alimenté par une source fournie par le module,
et non par le journal.

La présence repose sur un signal envoyé toutes les trente secondes : une ligne par joueur
présent, supprimée à son départ ou deux minutes après son dernier signal. Les durées de
conservation sont appliquées à la lecture, et une fois par jour par la route des tâches
quotidiennes.

**Les droits des joueurs** sont répartis entre les modules : chacun déclare ses données
personnelles par un contributeur, qui sait les exporter, réécrire ses événements et effacer
ses tables.

L'effacement réécrit uniquement les champs de nom des événements du joueur, par une seule
fonction de la plateforme : c'est la seule exception à l'ajout seul. Le type, la version et
les autres données des événements ne changent pas. Chaque effacement est consigné dans un
registre qui ne contient aucune donnée sur le joueur, seulement la date et le nombre
d'événements réécrits.

L'identité est effacée en dernier, et chaque étape est idempotente : un effacement
interrompu peut être relancé par le joueur lui-même.

Mise en œuvre : `src/platform/privacy/`, `src/modules/tavern/` et les fichiers
`personal-data.ts` de chaque module.

## Conséquences

### Positives

- Le joueur exerce ses droits lui-même, sans intervention d'un administrateur.
- L'effacement n'altère ni les états reconstruits ni l'historique des autres joueurs : seuls
  les noms changent, les combats et les échanges restent intacts.
- La conservation est garantie même sans activité, grâce à la tâche quotidienne.
- La Taverne est plus simple que si elle avait suivi le modèle des autres modules : pas
  d'événements, pas de projection, et des suppressions directes.
- La plateforme ne connaît aucun module : chacun reste responsable de ses propres données
  personnelles.

### Négatives

- C'est une exception à la règle de l'ajout seul. Elle se limite aux champs de nom, pour
  l'effacement, et toute modification future du journal devra respecter strictement ces
  limites.
- L'effacement et l'export parcourent le journal : leur coût grandit avec sa taille.
- Chaque nouvel événement crée une obligation : déclarer ses champs personnels dans le
  contributeur de son module, faute de quoi ils échapperont à l'effacement.
- L'identifiant du joueur reste dans le journal. Il n'est pseudonyme que si tout lien avec
  la personne a réellement été détruit.

## Alternatives écartées

- **L'Event Sourcing pour la Taverne** : il garderait tout l'historique, alors que les
  messages sont justement faits pour disparaître ; chaque expiration demanderait de
  réécrire le journal.
- **La suppression des flux du joueur** : elle effacerait aussi l'historique des autres
  joueurs dans les flux partagés, et casserait les états reconstruits et les projections.
- **L'effacement cryptographique** (chiffrer les données de chaque joueur et détruire sa
  clé) : il garde le journal intact, mais demande une clé par joueur, un chiffrement de
  chaque champ concerné, et rend illisibles les événements partagés pour tous.
- **Les références sans copie** (ne stocker que l'identifiant et lire le nom ailleurs) :
  c'est la bonne solution à l'origine, mais les événements existants contiennent déjà des
  noms, et ils ne peuvent pas être modifiés pour en retirer.
- **Un service externe de présence**, comme une base clé-valeur en mémoire : adapté à des
  données éphémères, mais c'est une infrastructure de plus, hors de l'offre gratuite.

## Réexamen

À revoir si :

- un nouveau module est conçu : les références sans copie devront être préférées dès
  l'origine ;
- le journal devient assez gros pour que l'effacement ne tienne plus dans une requête ;
- la doctrine évolue sur l'anonymisation des identifiants pseudonymes.

## Usage de l'IA générative

Rédaction assistée par Claude Code pour la reformulation. Relecture faite avant la validation.
