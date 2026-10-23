/**
 * Étapes de la saga de fabrication : pour chaque événement de l'atelier, les demandes à
 * adresser au Village. Le domaine décide de ces demandes ; le service les traduit en
 * messages de la boîte d'envoi.
 */
import type { Amounts } from './recipes'
import { transferIdOf, type WorkshopEvent, type WorkshopState } from './workshop'

/** Demande produite par une étape de la saga. */
export type SagaRequest =
  /** Prélever des ressources : le Village répond, et la réponse fait progresser la saga. */
  | { kind: 'withdraw'; transferId: string; playerId: string; resources: Amounts }
  /** Verser des ressources : le versement ne peut pas échouer, aucune réponse n'est attendue. */
  | { kind: 'deposit'; transferId: string; playerId: string; resources: Amounts }

/**
 * Demandes déclenchées par un événement. L'état reçu est celui qui suit l'application
 * de l'événement : il contient le joueur propriétaire de l'atelier.
 */
export function requestsFor(state: WorkshopState, event: WorkshopEvent): SagaRequest[] {
  const { playerId } = state

  switch (event.type) {
    // 1. Commande : prélèvement du coût de la recette.
    case 'OrderPlaced':
      return [
        {
          kind: 'withdraw',
          transferId: transferIdOf(playerId, event.data.orderId, 'pay'),
          playerId,
          resources: event.data.cost,
        },
      ]

    // Fabrication : son échéance est évaluée à la lecture, aucun message n'est nécessaire.
    case 'ForgingStarted':
      return []

    // Refus du paiement : rien n'a été prélevé, rien n'est à compenser.
    case 'OrderFailed':
      return []

    // Compensation : restitution au village d'une part du coût de la fabrication annulée,
    // ou de la totalité du coût d'une commande payée après son délai.
    case 'OrderCancelled':
    case 'OrderExpired': {
      const { orderId, refund } = event.data
      if (Object.keys(refund).length === 0) return []
      return [
        {
          kind: 'deposit',
          transferId: transferIdOf(playerId, orderId, 'refund'),
          playerId,
          resources: refund,
        },
      ]
    }

    // Mouvements d'objets demandés par un autre module : la réponse est l'affaire du service.
    case 'ItemsWithdrawn':
    case 'ItemWithdrawalRefused':
    case 'ItemsDeposited':
      return []
  }
}
