/**
 * Domaine de la Forge : l'atelier d'un joueur et ses commandes, selon le modèle decider.
 * L'état d'une commande résume l'avancement de la saga de fabrication.
 * Ce fichier est écrit en TypeScript pur : il n'importe aucun autre module.
 */
import { type Amounts, isRecipe, RECIPE_CATALOG, type Recipe } from './recipes'

/**
 * États enregistrés d'une commande. L'état « forgé » n'est jamais enregistré :
 * il se déduit de l'échéance de la fabrication, à la lecture.
 */
export type OrderStatus = 'paying' | 'forging' | 'failed'

// ---------------------------------------------------------------------------
// État
// ---------------------------------------------------------------------------

export interface Order {
  orderId: string
  recipe: Recipe
  /** Coût prélevé, copié de la recette au moment de la commande. */
  cost: Amounts
  status: OrderStatus
  placedAt: number
  /** Échéance de la fabrication, fixée au paiement ; null avant le paiement. */
  readyAt: number | null
  /** Quantités qui manquaient, si le paiement a été refusé. */
  missing: Amounts | null
}

export interface WorkshopState {
  /** Joueur propriétaire de l'atelier ; vide tant qu'aucune commande n'a été passée. */
  playerId: string
  orders: Record<string, Order>
}

export const initialState: WorkshopState = { playerId: '', orders: {} }

// ---------------------------------------------------------------------------
// Événements
// ---------------------------------------------------------------------------

export type WorkshopEvent =
  | {
      type: 'OrderPlaced'
      data: { orderId: string; playerId: string; recipe: Recipe; cost: Amounts; at: number }
    }
  | { type: 'ForgingStarted'; data: { orderId: string; readyAt: number; at: number } }
  | { type: 'OrderFailed'; data: { orderId: string; missing: Amounts; at: number } }

// ---------------------------------------------------------------------------
// Commandes
// ---------------------------------------------------------------------------

// DETTE TECHNIQUE DT-008 (docs/qualite/dette-technique.md) : aucune commande ne permet
// d'annuler une fabrication ; une commande payée va toujours jusqu'à son échéance.
export type WorkshopCommand =
  // Commande du joueur. La capacité est le niveau de la forge de son village,
  // lu par le service dans le langage publié du Village.
  | { type: 'PlaceOrder'; orderId: string; playerId: string; recipe: string; capacity: number }
  // Commande de la saga, issue de la réponse du Village.
  | {
      type: 'RecordTransferResult'
      transferId: string
      outcome: 'withdrawn' | 'refused' | 'deposited'
      missing?: Amounts
    }

export type WorkshopError =
  | { code: 'UNKNOWN_RECIPE' }
  | { code: 'ORDER_EXISTS' }
  | { code: 'FORGE_NOT_BUILT' }
  | { code: 'CAPACITY_REACHED'; capacity: number }

export type Decision = { ok: true; events: WorkshopEvent[] } | { ok: false; error: WorkshopError }

const fail = (error: WorkshopError): Decision => ({ ok: false, error })
const accept = (...events: WorkshopEvent[]): Decision => ({ ok: true, events })

// ---------------------------------------------------------------------------
// Identifiants des mouvements de ressources
// ---------------------------------------------------------------------------

/** Étapes de la saga qui donnent lieu à un mouvement de ressources. */
export type TransferStep = 'pay'

/**
 * Identifiant d'un mouvement de ressources : il sert de clé d'idempotence au Village.
 * Le préfixe le distingue des mouvements du Marché, et le joueur permet de retrouver
 * l'atelier concerné lorsque la réponse du Village arrive.
 */
export const transferIdOf = (playerId: string, orderId: string, step: TransferStep) =>
  `forge:${playerId}:${orderId}:${step}`

/** Joueur, commande et étape d'un mouvement ; null s'il n'a pas été demandé par la Forge. */
export function parseTransferId(transferId: string) {
  const parts = transferId.split(':')
  if (parts.length < 4 || parts[0] !== 'forge') return null
  return {
    playerId: parts.slice(1, -2).join(':'),
    orderId: parts[parts.length - 2],
    step: parts[parts.length - 1],
  }
}

// ---------------------------------------------------------------------------
// Règles de l'atelier
// ---------------------------------------------------------------------------

/** Vrai si l'objet de la commande est forgé à l'instant now : son échéance est atteinte. */
export const isForged = (order: Order, now: number) =>
  order.status === 'forging' && order.readyAt !== null && now >= order.readyAt

/** Vrai si la commande occupe l'atelier à l'instant now : paiement attendu, ou fabrication. */
export const isActive = (order: Order, now: number) =>
  // DETTE TECHNIQUE DT-009 (docs/qualite/dette-technique.md) : une commande en attente de
  // paiement reste active sans limite de durée, même si son message est abandonné.
  order.status === 'paying' || (order.status === 'forging' && !isForged(order, now))

// ---------------------------------------------------------------------------
// evolve
// ---------------------------------------------------------------------------

/** Modifie une commande existante ; l'état est inchangé si la commande est inconnue. */
function update(state: WorkshopState, orderId: string, changes: Partial<Order>): WorkshopState {
  const order = state.orders[orderId]
  if (!order) return state
  return { ...state, orders: { ...state.orders, [orderId]: { ...order, ...changes } } }
}

export function evolve(state: WorkshopState, event: WorkshopEvent): WorkshopState {
  switch (event.type) {
    case 'OrderPlaced': {
      const { orderId, playerId, recipe, cost, at } = event.data
      const order: Order = {
        orderId,
        recipe,
        cost,
        status: 'paying',
        placedAt: at,
        readyAt: null,
        missing: null,
      }
      return { playerId, orders: { ...state.orders, [orderId]: order } }
    }
    case 'ForgingStarted':
      return update(state, event.data.orderId, { status: 'forging', readyAt: event.data.readyAt })
    case 'OrderFailed':
      return update(state, event.data.orderId, { status: 'failed', missing: event.data.missing })
  }
}

export const replay = (events: WorkshopEvent[]) => events.reduce(evolve, initialState)

// ---------------------------------------------------------------------------
// decide
// ---------------------------------------------------------------------------

export function decide(state: WorkshopState, command: WorkshopCommand, now: number): Decision {
  switch (command.type) {
    case 'PlaceOrder': {
      const { orderId, playerId, recipe, capacity } = command
      if (!isRecipe(recipe)) return fail({ code: 'UNKNOWN_RECIPE' })
      if (orderId in state.orders) return fail({ code: 'ORDER_EXISTS' })
      if (capacity < 1) return fail({ code: 'FORGE_NOT_BUILT' })
      // Une commande forgée ou échouée libère sa place dans l'atelier.
      const active = Object.values(state.orders).filter((order) => isActive(order, now)).length
      if (active >= capacity) return fail({ code: 'CAPACITY_REACHED', capacity })
      // Le coût est copié dans l'événement : un rééquilibrage ultérieur des recettes
      // ne modifie pas les commandes déjà passées.
      return accept({
        type: 'OrderPlaced',
        data: { orderId, playerId, recipe, cost: RECIPE_CATALOG[recipe].cost, at: now },
      })
    }

    case 'RecordTransferResult':
      return recordTransferResult(state, command, now)
  }
}

/**
 * Réponse du Village à un paiement. Seule la réponse attendue par une commande en attente
 * de paiement fait progresser la saga ; toute autre réponse (doublon, réponse tardive) est
 * ignorée.
 */
function recordTransferResult(
  state: WorkshopState,
  result: Extract<WorkshopCommand, { type: 'RecordTransferResult' }>,
  now: number,
): Decision {
  const transfer = parseTransferId(result.transferId)
  if (transfer?.step !== 'pay') return accept()
  const order = state.orders[transfer.orderId]
  if (order?.status !== 'paying') return accept()

  const { orderId } = order
  if (result.outcome === 'refused') {
    return accept({
      type: 'OrderFailed',
      data: { orderId, missing: result.missing ?? {}, at: now },
    })
  }
  // La fabrication commence au paiement : son échéance en découle.
  const readyAt = now + RECIPE_CATALOG[order.recipe].durationMs
  return accept({ type: 'ForgingStarted', data: { orderId, readyAt, at: now } })
}
