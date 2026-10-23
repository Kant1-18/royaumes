/**
 * Entrée publique « partagée » du module Forge : utilisable par le serveur
 * comme par l'interface. Elle ne contient que des types, des schémas de
 * validation et des fonctions pures, sans aucun code propre au serveur.
 */
import { z } from 'zod'
import { RECIPES } from './domain/recipes'

export type { Amounts, Recipe } from './domain/recipes'
export { RECIPE_CATALOG, RECIPES } from './domain/recipes'

export type { OrderView, OrderViewStatus, WorkshopView } from './domain/view'
export type { Items, WorkshopError } from './domain/workshop'

/** Corps attendu pour commander un objet : une recette du catalogue. */
export const PlaceOrderInput = z.object({ recipe: z.enum(RECIPES) })

/** Quantité d'un objet dans un mouvement : un entier strictement positif. */
const Amount = z.number().int().positive()

/** Quantités d'objets d'un mouvement : au moins un objet du catalogue, aucune autre clé. */
export const ItemAmounts = z
  .object({
    axe: Amount.optional(),
    pickaxe: Amount.optional(),
    shield: Amount.optional(),
    sword: Amount.optional(),
    crown: Amount.optional(),
  })
  .strict()
  .refine((items) => Object.keys(items).length > 0, 'Au moins un objet est attendu')

/** Contenu d'un message de retrait ou de versement d'objets, adressé à la Forge. */
export const ItemTransferRequest = z.object({
  /** Identifiant du mouvement, choisi par le demandeur : un doublon porte le même identifiant. */
  transferId: z.string().min(1),
  /** Joueur dont l'inventaire est concerné. */
  playerId: z.string().min(1),
  items: ItemAmounts,
  /** Sujet du message de réponse ; absent si le demandeur n'attend aucune réponse. */
  replyTo: z.string().min(1).optional(),
})
export type ItemTransferRequest = z.infer<typeof ItemTransferRequest>

/** Préfixe commun aux noms des flux de tous les ateliers. */
export const FORGE_STREAM_PREFIX = 'forge-'

/** Nom du flux qui contient les événements de l'atelier d'un joueur. */
export const forgeStream = (userId: string) => `${FORGE_STREAM_PREFIX}${userId}`

/**
 * Sujets des messages adressés à la Forge. Les mouvements d'objets forment son langage
 * publié : la réponse a la même forme que celle du Village (transferId, outcome, missing).
 */
export const FORGE_TOPICS = {
  /** Réponse du Village à un mouvement de ressources. */
  transferResult: 'forge.transfer-result',
  /** Retirer des objets d'un inventaire ; le refus est possible. */
  withdrawItems: 'forge.withdraw-items',
  /** Verser des objets à un inventaire ; le versement ne peut pas être refusé. */
  depositItems: 'forge.deposit-items',
} as const
