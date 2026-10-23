/**
 * Domaine de la Forge : l'atelier d'un joueur et ses commandes, selon le modèle decider.
 * L'état d'une commande résume l'avancement de la saga de fabrication.
 * Ce fichier est écrit en TypeScript pur : il n'importe aucun autre module.
 */
import { type Amounts, isRecipe, RECIPE_CATALOG, RECIPES, type Recipe } from './recipes'

/**
 * États enregistrés d'une commande. L'état « forgé » n'est jamais enregistré :
 * il se déduit de l'échéance de la fabrication, à la lecture.
 */
export type OrderStatus = 'paying' | 'forging' | 'failed'

/** Quantités d'objets, par recette. */
export type Items = Partial<Record<Recipe, number>>

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

/** Mouvement d'objets demandé par un autre module, comme le Marché, et son issue. */
export interface ItemTransfer {
  outcome: 'withdrawn' | 'refused' | 'deposited'
  /** Objets retirés ou versés ; aucun en cas de refus. */
  items: Items
  at: number
}

export interface WorkshopState {
  /** Joueur propriétaire de l'atelier ; vide tant qu'aucune commande n'a été passée. */
  playerId: string
  orders: Record<string, Order>
  /**
   * Mouvements d'objets déjà traités, par identifiant. Ils rendent ces mouvements
   * idempotents : un identifiant connu est ignoré.
   */
  transfers: Record<string, ItemTransfer>
}

export const initialState: WorkshopState = { playerId: '', orders: {}, transfers: {} }

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
  // Mouvements d'objets demandés par un autre module. Chacun porte l'identifiant du
  // mouvement, choisi par le demandeur, qui permet d'en reconnaître un doublon.
  | { type: 'ItemsWithdrawn'; data: { transferId: string; items: Items; at: number } }
  | { type: 'ItemWithdrawalRefused'; data: { transferId: string; missing: Items; at: number } }
  | { type: 'ItemsDeposited'; data: { transferId: string; items: Items; at: number } }

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
  | ItemTransferCommand

/** Mouvements d'objets, émis par un autre module et non par le joueur. */
export type ItemTransferCommand =
  | { type: 'WithdrawItems'; transferId: string; items: Items }
  | { type: 'DepositItems'; transferId: string; items: Items }

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

/**
 * Inventaire du joueur à l'instant now : les objets forgés, augmentés des objets reçus
 * et diminués des objets cédés.
 */
export function inventoryAt(state: WorkshopState, now: number): Record<Recipe, number> {
  const inventory = Object.fromEntries(RECIPES.map((recipe) => [recipe, 0])) as Record<
    Recipe,
    number
  >
  for (const order of Object.values(state.orders)) {
    if (isForged(order, now)) inventory[order.recipe] += 1
  }
  for (const transfer of Object.values(state.transfers)) {
    const sign = transfer.outcome === 'withdrawn' ? -1 : 1
    for (const [recipe, amount] of Object.entries(transfer.items)) {
      inventory[recipe as Recipe] += sign * (amount ?? 0)
    }
  }
  return inventory
}

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
      return { ...state, playerId, orders: { ...state.orders, [orderId]: order } }
    }
    case 'ForgingStarted':
      return update(state, event.data.orderId, { status: 'forging', readyAt: event.data.readyAt })
    case 'OrderFailed':
      return update(state, event.data.orderId, { status: 'failed', missing: event.data.missing })
    case 'ItemsWithdrawn':
      return record(state, event.data.transferId, 'withdrawn', event.data.items, event.data.at)
    case 'ItemWithdrawalRefused':
      return record(state, event.data.transferId, 'refused', {}, event.data.at)
    case 'ItemsDeposited':
      return record(state, event.data.transferId, 'deposited', event.data.items, event.data.at)
  }
}

/** Enregistre un mouvement d'objets traité. */
function record(
  state: WorkshopState,
  transferId: string,
  outcome: ItemTransfer['outcome'],
  items: Items,
  at: number,
): WorkshopState {
  return { ...state, transfers: { ...state.transfers, [transferId]: { outcome, items, at } } }
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

    case 'WithdrawItems': {
      // Idempotence : un mouvement déjà traité ne produit aucun nouvel événement.
      if (command.transferId in state.transfers) return accept()
      // Seuls les objets déjà forgés, ou reçus, peuvent être cédés.
      const inventory = inventoryAt(state, now)
      const missing: Items = {}
      for (const [recipe, amount = 0] of Object.entries(command.items)) {
        const owned = inventory[recipe as Recipe] ?? 0
        if (owned < amount) missing[recipe as Recipe] = amount - owned
      }
      const { transferId, items } = command
      // Un inventaire insuffisant n'est pas une erreur, mais un refus enregistré comme un fait.
      return Object.keys(missing).length > 0
        ? accept({ type: 'ItemWithdrawalRefused', data: { transferId, missing, at: now } })
        : accept({ type: 'ItemsWithdrawn', data: { transferId, items, at: now } })
    }

    case 'DepositItems':
      if (command.transferId in state.transfers) return accept()
      return accept({
        type: 'ItemsDeposited',
        data: { transferId: command.transferId, items: command.items, at: now },
      })
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
