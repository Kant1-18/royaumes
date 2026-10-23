import { beforeEach, describe, expect, it } from 'vitest'
import { createTestDatabase } from '@/platform/db/client'
import {
  createEventStore,
  type EventStore,
  type NewEvent,
} from '@/platform/event-store/event-store'
import { createProjectionRunner } from '@/platform/projection/projection'
import type { CapacityReader } from '../application/capacity-reader'
import { createDrizzleCapacityReader } from './drizzle-capacity-reader'

// Chaque test dispose d'un journal neuf et d'une table des ateliers vide.
let store: EventStore
let reader: CapacityReader
beforeEach(async () => {
  const db = await createTestDatabase()
  store = createEventStore(db)
  reader = createDrizzleCapacityReader(db, createProjectionRunner(db))
})

// Événements du Village, réduits aux champs lus par la Forge.
const upgraded = (building: string, toLevel: number): NewEvent => ({
  type: 'BuildingUpgraded',
  data: { building, toLevel },
})

describe('Projection des ateliers', () => {
  it("donne une capacité nulle au joueur dont la forge n'est pas construite", async () => {
    await store.append('village-alice', 0, [{ type: 'VillageFounded', data: { name: 'Valombre' } }])
    expect(await reader.capacityOf('alice')).toBe(0)
    expect(await reader.capacityOf('inconnu')).toBe(0)
  })

  it('retient le niveau atteint par la forge du village', async () => {
    await store.append('village-alice', 0, [upgraded('forge', 1), upgraded('forge', 2)])
    expect(await reader.capacityOf('alice')).toBe(2)

    // Une amélioration ultérieure est prise en compte à la lecture suivante.
    await store.append('village-alice', 2, [upgraded('forge', 3)])
    expect(await reader.capacityOf('alice')).toBe(3)
  })

  it("ignore l'amélioration des autres bâtiments, et la forge des autres joueurs", async () => {
    await store.append('village-alice', 0, [upgraded('sawmill', 2), upgraded('mine', 1)])
    await store.append('village-bob', 0, [upgraded('forge', 4)])
    expect(await reader.capacityOf('alice')).toBe(0)
    expect(await reader.capacityOf('bob')).toBe(4)
  })
})
