import { integer, pgSchema, text } from 'drizzle-orm/pg-core'

/** Schéma PostgreSQL du module Forge. Ses événements restent dans le journal de la plateforme. */
export const forge = pgSchema('forge')

/**
 * Atelier de chaque joueur : le niveau de la forge de son village, qui fixe le nombre de
 * commandes simultanées. Tenu à jour par la projection des ateliers, à partir des
 * événements du Village.
 */
export const workshops = forge.table('workshops', {
  playerId: text('player_id').primaryKey(),
  level: integer('level').notNull(),
})
