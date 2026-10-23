import { VILLAGE_CHANNEL_PREFIX } from '@/modules/realm/contracts'
import type { Projection } from '@/platform/projection/projection'
import { workshops } from './schema'

/*
 * Données de l'événement BuildingUpgraded lues par la Forge. Elles font partie du « langage
 * publié » du Village : la Forge en dépend, comme le Classement. Seuls les champs utiles
 * sont décrits.
 */
interface BuildingUpgradedData {
  building: string
  toLevel: number
}

/**
 * Projection des ateliers : retient le niveau de la forge de chaque village, à partir des
 * améliorations de bâtiments. Les copies relayées d'un Village extrait portent le même nom
 * de flux : la projection fonctionne de la même manière dans les deux modes.
 */
export const workshopsProjection: Projection = {
  name: 'forge-workshops',
  version: 1,
  eventTypes: ['BuildingUpgraded'],

  async apply(event, tx) {
    const data = event.data as unknown as BuildingUpgradedData
    if (data.building !== 'forge' || !event.stream.startsWith(VILLAGE_CHANNEL_PREFIX)) return
    const playerId = event.stream.slice(VILLAGE_CHANNEL_PREFIX.length)
    // Le niveau atteint est enregistré tel quel : appliquer deux fois le même événement,
    // lors d'une reconstruction par exemple, donne le même résultat.
    await tx
      .insert(workshops)
      .values({ playerId, level: data.toLevel })
      .onConflictDoUpdate({ target: workshops.playerId, set: { level: data.toLevel } })
  },

  async reset(tx) {
    await tx.delete(workshops)
  },
}
