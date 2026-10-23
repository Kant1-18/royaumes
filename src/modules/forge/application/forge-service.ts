import { REALM_TOPICS } from '@/modules/realm/contracts'
import { withOptimisticRetry } from '@/platform/event-store/retry'
import type { NewMessage } from '@/platform/outbox/outbox'
import { FORGE_TOPICS } from '../contracts'
import { requestsFor, type SagaRequest } from '../domain/saga'
import { toView, type WorkshopView } from '../domain/view'
import {
  decide,
  evolve,
  type ItemTransferCommand,
  type WorkshopCommand,
  type WorkshopError,
  type WorkshopEvent,
  type WorkshopState,
} from '../domain/workshop'
import type { CapacityReader } from './capacity-reader'
import type { WorkshopRepository } from './workshop-repository'

/** Résultat d'une commande d'un joueur : la vue de son atelier, ou l'erreur métier. */
export type CommandResult =
  | { ok: true; orderId: string; view: WorkshopView }
  | { ok: false; error: WorkshopError }

export interface ForgeServiceOptions {
  /** Distribution de la boîte d'envoi, déclenchée après chaque commande et chaque consultation. */
  dispatch: () => Promise<unknown>
  /** Horloge de référence ; l'heure réelle par défaut. */
  clock?: () => number
  /** Identifiant d'une nouvelle commande ; un UUID aléatoire par défaut. */
  newId?: () => string
}

/** Traduit une demande de la saga en message de la boîte d'envoi. */
function toMessage(request: SagaRequest): NewMessage {
  return {
    topic: REALM_TOPICS.withdraw,
    payload: {
      transferId: request.transferId,
      playerId: request.playerId,
      resources: request.resources,
      // Adresse de retour : la réponse du Village fera progresser la saga.
      replyTo: FORGE_TOPICS.transferResult,
    },
  }
}

/** Réponse à un mouvement d'objets, de même forme que celle du Village ; null pour un autre événement. */
function replyOf(event: WorkshopEvent): Record<string, unknown> | null {
  switch (event.type) {
    case 'ItemsWithdrawn':
      return { transferId: event.data.transferId, outcome: 'withdrawn' }
    case 'ItemWithdrawalRefused':
      return { transferId: event.data.transferId, outcome: 'refused', missing: event.data.missing }
    case 'ItemsDeposited':
      return { transferId: event.data.transferId, outcome: 'deposited' }
    default:
      return null
  }
}

/** Messages déclenchés par une suite d'événements, appliqués un à un à l'état de l'atelier. */
function messagesFor(state: WorkshopState, events: WorkshopEvent[]): NewMessage[] {
  const messages: NewMessage[] = []
  let current = state
  for (const event of events) {
    current = evolve(current, event)
    for (const request of requestsFor(current, event)) messages.push(toMessage(request))
  }
  return messages
}

/**
 * Service applicatif de la Forge : orchestrateur de la saga de fabrication.
 * Chaque décision est enregistrée avec les messages qu'elle déclenche, dans une même transaction.
 */
export function createForgeService(
  repo: WorkshopRepository,
  capacities: CapacityReader,
  { dispatch, clock = () => Date.now(), newId = () => crypto.randomUUID() }: ForgeServiceOptions,
) {
  /**
   * Décide et enregistre une commande sur l'atelier d'un joueur, avec les messages de la saga.
   * En cas de conflit de version, l'ensemble est rejoué sur l'état à jour : c'est ce qui
   * garantit la capacité de l'atelier face à deux commandes simultanées.
   */
  function process(playerId: string, command: WorkshopCommand) {
    return withOptimisticRetry(async () => {
      const { state, version } = await repo.load(playerId)
      const decision = decide(state, command, clock())
      if (!decision.ok) return decision
      await repo.save(playerId, version, decision.events, messagesFor(state, decision.events))
      return decision
    })
  }

  /** Vue de l'atelier d'un joueur, à l'instant présent. */
  async function viewOf(playerId: string) {
    const [{ state }, capacity] = await Promise.all([
      repo.load(playerId),
      capacities.capacityOf(playerId),
    ])
    return toView(state, capacity, clock())
  }

  /**
   * Commande un objet au nom d'un joueur. La décision est enregistrée, puis la boîte d'envoi
   * distribuée : dans le cas ordinaire, le paiement a déjà reçu sa réponse lorsque la vue
   * est renvoyée.
   */
  async function placeOrder(playerId: string, recipe: string): Promise<CommandResult> {
    const orderId = newId()
    const capacity = await capacities.capacityOf(playerId)
    const decision = await process(playerId, {
      type: 'PlaceOrder',
      orderId,
      playerId,
      recipe,
      capacity,
    })
    if (!decision.ok) return decision
    await dispatch()
    return { ok: true, orderId, view: await viewOf(playerId) }
  }

  /**
   * Vue de l'atelier. La boîte d'envoi est d'abord distribuée : une saga interrompue reprend
   * dès que le joueur consulte sa forge.
   */
  async function getView(playerId: string) {
    await dispatch()
    return viewOf(playerId)
  }

  /**
   * Étape de la saga, déclenchée par un message. Une erreur métier y est une anomalie :
   * elle est levée, et le message sera retenté.
   */
  async function step(playerId: string, command: WorkshopCommand) {
    const decision = await process(playerId, command)
    if (!decision.ok) throw new Error(`Atelier ${playerId} : ${decision.error.code}`)
  }

  /**
   * Traite un mouvement d'objets demandé par un autre module. La réponse éventuelle est
   * enregistrée dans la boîte d'envoi, au sujet replyTo, dans la même transaction que
   * l'événement du mouvement. Un mouvement déjà traité ne produit ni événement ni réponse.
   */
  function transfer(playerId: string, command: ItemTransferCommand, replyTo?: string) {
    return withOptimisticRetry(async () => {
      const { state, version } = await repo.load(playerId)
      const decision = decide(state, command, clock())
      if (!decision.ok) {
        throw new Error(`Mouvement ${command.transferId} impossible : ${decision.error.code}`)
      }
      const messages: NewMessage[] = []
      for (const event of decision.events) {
        const reply = replyOf(event)
        if (reply && replyTo) messages.push({ topic: replyTo, payload: reply })
      }
      await repo.save(playerId, version, decision.events, messages)
    })
  }

  return { placeOrder, getView, step, transfer }
}

/** Type du service, déduit de sa fabrique. */
export type ForgeService = ReturnType<typeof createForgeService>
