import type { EventStore } from '@/platform/event-store/event-store'
import type { PersonalDataContributor } from '@/platform/privacy/privacy'
import { forgeStream } from './contracts'
import { replay, type WorkshopEvent } from './domain/workshop'

/**
 * Données personnelles de la Forge : les commandes du joueur, rattachées à son identifiant.
 * Les événements de l'atelier ne contiennent ni nom ni texte libre : aucun n'est à réécrire.
 */
export function createForgePersonalData(store: EventStore): PersonalDataContributor {
  return {
    name: 'forge',

    async export(playerId) {
      const stored = await store.read(forgeStream(playerId))
      if (stored.length === 0) return null
      const state = replay(stored.map((e) => ({ type: e.type, data: e.data }) as WorkshopEvent))
      return {
        orders: Object.values(state.orders).map(
          ({ orderId, recipe, status, placedAt, readyAt }) => ({
            orderId,
            recipe,
            status,
            placedAt,
            readyAt,
          }),
        ),
      }
    },
  }
}
