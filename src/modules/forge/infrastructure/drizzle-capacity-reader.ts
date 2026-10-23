import { eq } from 'drizzle-orm'
import type { Db } from '@/platform/db/client'
import type { ProjectionRunner } from '@/platform/projection/projection'
import type { CapacityReader } from '../application/capacity-reader'
import { workshops } from './schema'
import { workshopsProjection } from './workshops-projection'

/** Adaptateur du port CapacityReader, fondé sur la table des ateliers. */
export function createDrizzleCapacityReader(db: Db, projections: ProjectionRunner): CapacityReader {
  return {
    async capacityOf(playerId) {
      // Rattrapage à la lecture : la table est mise à jour avant d'être lue.
      await projections.catchUp(workshopsProjection)
      const [row] = await db.select().from(workshops).where(eq(workshops.playerId, playerId))
      return row?.level ?? 0
    },
  }
}
