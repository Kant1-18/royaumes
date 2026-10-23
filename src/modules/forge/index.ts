/**
 * Entrée publique « serveur » du module Forge.
 * Avec contracts.ts et ui.tsx, c'est le seul fichier du module qui peut être
 * importé depuis l'extérieur.
 */
import type { Db } from '@/platform/db/client'
import type { EventStore } from '@/platform/event-store/event-store'
import type { ProjectionRunner } from '@/platform/projection/projection'
import { createForgeApi } from './api'
import { createForgeService } from './application/forge-service'
import { createDrizzleCapacityReader } from './infrastructure/drizzle-capacity-reader'
import { createEventStoreWorkshopRepository } from './infrastructure/event-store-workshop-repository'
import { createForgeHandlers } from './messages'
import { createForgePersonalData } from './personal-data'

export interface ForgeModuleDeps {
  /** Journal d'événements de la plateforme. */
  store: EventStore
  /** Base de données, dans laquelle le module tient la capacité des ateliers. */
  db: Db
  /** Moteur des projections de la plateforme. */
  projections: ProjectionRunner
  /** Distribution de la boîte d'envoi, déclenchée par la Forge après ses commandes et lectures. */
  dispatch: () => Promise<unknown>
  /** Horloge de référence ; l'heure réelle par défaut. */
  clock?: () => number
}

/** Fabrique du module : assemble les adaptateurs, le service, l'API et les gestionnaires de messages. */
export function createForgeModule({ store, db, projections, dispatch, clock }: ForgeModuleDeps) {
  const repo = createEventStoreWorkshopRepository(store)
  const capacities = createDrizzleCapacityReader(db, projections)
  const service = createForgeService(repo, capacities, { dispatch, clock })

  return {
    api: createForgeApi(service),
    handlers: createForgeHandlers(service),
    personalData: createForgePersonalData(store),
  }
}

export type { ForgeApi } from './api'
