import type { NewMessage } from '@/platform/outbox/outbox'
import type { WorkshopEvent, WorkshopState } from '../domain/workshop'

/** Port de persistance des ateliers, défini par la couche application. */
export interface WorkshopRepository {
  /** Charge l'état de l'atelier d'un joueur, reconstruit à partir de ses événements, et sa version. */
  load(playerId: string): Promise<{ state: WorkshopState; version: number }>

  /**
   * Enregistre de nouveaux événements, et les messages de la saga qu'ils déclenchent,
   * dans une même transaction. Une ConcurrencyError est levée en cas de conflit de version.
   */
  save(
    playerId: string,
    expectedVersion: number,
    events: WorkshopEvent[],
    messages: NewMessage[],
  ): Promise<void>
}
