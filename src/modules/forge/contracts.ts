/**
 * Entrée publique « partagée » du module Forge : utilisable par le serveur
 * comme par l'interface. Elle ne contient que des types, des schémas de
 * validation et des fonctions pures, sans aucun code propre au serveur.
 */

export type { Amounts, Recipe } from './domain/recipes'
export { RECIPE_CATALOG, RECIPES } from './domain/recipes'
export type { OrderView, OrderViewStatus, WorkshopView } from './domain/view'
export type { WorkshopError } from './domain/workshop'

/** Préfixe commun aux noms des flux de tous les ateliers. */
export const FORGE_STREAM_PREFIX = 'forge-'

/** Nom du flux qui contient les événements de l'atelier d'un joueur. */
export const forgeStream = (userId: string) => `${FORGE_STREAM_PREFIX}${userId}`

/** Sujets des messages adressés à la Forge. */
export const FORGE_TOPICS = {
  /** Réponse du Village à un mouvement de ressources. */
  transferResult: 'forge.transfer-result',
} as const
