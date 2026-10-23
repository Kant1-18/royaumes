import { z } from 'zod'
import type { MessageHandler } from '@/platform/outbox/outbox'
import type { ForgeService } from './application/forge-service'
import { FORGE_TOPICS, ItemTransferRequest } from './contracts'
import { type ItemTransferCommand, parseTransferId } from './domain/workshop'

/** Réponse du Village à un mouvement de ressources (son type TransferResult, vérifié ici). */
const TransferResultMessage = z.object({
  transferId: z.string().min(1),
  outcome: z.enum(['withdrawn', 'refused', 'deposited']),
  missing: z.record(z.string(), z.number()).optional(),
})

/**
 * Gestionnaires des messages adressés à la Forge : les réponses du Village, qui font
 * progresser la saga de fabrication, et les mouvements d'objets demandés par un autre module,
 * comme le Marché. Ils ne font que traduire un message en appel au service.
 */
export function createForgeHandlers(service: ForgeService): Record<string, MessageHandler> {
  /** Gestionnaire d'un type de mouvement d'objets. */
  const handle =
    (type: ItemTransferCommand['type']): MessageHandler =>
    async (message) => {
      // Le contenu d'un message est vérifié comme celui d'une requête : un message mal formé
      // lève une erreur, et finira abandonné en lettre morte.
      const { transferId, playerId, items, replyTo } = ItemTransferRequest.parse(message.payload)
      await service.transfer(playerId, { type, transferId, items }, replyTo)
    }

  return {
    [FORGE_TOPICS.withdrawItems]: handle('WithdrawItems'),
    [FORGE_TOPICS.depositItems]: handle('DepositItems'),

    [FORGE_TOPICS.transferResult]: async (message) => {
      const { transferId, outcome, missing } = TransferResultMessage.parse(message.payload)
      // L'identifiant du mouvement a été construit par la Forge : il désigne l'atelier concerné.
      // Un identifiant inconnu lève une erreur, et le message finira en lettre morte.
      const transfer = parseTransferId(transferId)
      if (!transfer) throw new Error(`Mouvement étranger à la Forge : ${transferId}`)
      await service.step(transfer.playerId, {
        type: 'RecordTransferResult',
        transferId,
        outcome,
        missing,
      })
    },
  }
}
