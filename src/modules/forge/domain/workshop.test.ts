import { describe, expect, it } from 'vitest'
import type { Amounts } from './recipes'
import { requestsFor, type SagaRequest } from './saga'
import { toView } from './view'
import {
  decide,
  evolve,
  initialState,
  PAYMENT_TIMEOUT_MS,
  parseTransferId,
  refundOf,
  type WorkshopCommand,
  type WorkshopState,
} from './workshop'

const T0 = Date.UTC(2026, 0, 1)
const minutes = (n: number) => n * 60_000

/** Applique une commande acceptée ; renvoie le nouvel état, les événements et les demandes. */
function play(state: WorkshopState, command: WorkshopCommand, now = T0) {
  const decision = decide(state, command, now)
  if (!decision.ok) throw new Error(decision.error.code)
  let current = state
  const requests: SagaRequest[] = []
  for (const event of decision.events) {
    current = evolve(current, event)
    requests.push(...requestsFor(current, event))
  }
  return { state: current, events: decision.events, requests }
}

const order = (orderId: string, recipe = 'axe', capacity = 1): WorkshopCommand => ({
  type: 'PlaceOrder',
  orderId,
  playerId: 'alice',
  recipe,
  capacity,
})
const paid = (orderId: string): WorkshopCommand => ({
  type: 'RecordTransferResult',
  transferId: `forge:alice:${orderId}:pay`,
  outcome: 'withdrawn',
})
const refused = (orderId: string, missing: Amounts): WorkshopCommand => ({
  type: 'RecordTransferResult',
  transferId: `forge:alice:${orderId}:pay`,
  outcome: 'refused',
  missing,
})

// Une hache commandée, puis payée à T0 : sa fabrication dure 2 minutes.
const paying = play(initialState, order('o1')).state
const forging = play(paying, paid('o1')).state

describe('Forge - commande', () => {
  it("refuse un objet qui n'est pas au catalogue des recettes", () => {
    expect(decide(initialState, order('o1', 'catapult'), T0)).toEqual({
      ok: false,
      error: { code: 'UNKNOWN_RECIPE' },
    })
  })

  it("refuse toute commande tant que la forge du village n'est pas construite", () => {
    expect(decide(initialState, order('o1', 'axe', 0), T0)).toEqual({
      ok: false,
      error: { code: 'FORGE_NOT_BUILT' },
    })
  })

  it('limite le nombre de commandes simultanées au niveau de la forge', () => {
    let state = play(initialState, order('o1', 'axe', 2)).state
    state = play(state, order('o2', 'axe', 2)).state
    expect(decide(state, order('o3', 'axe', 2), T0)).toEqual({
      ok: false,
      error: { code: 'CAPACITY_REACHED', capacity: 2 },
    })
    // Avec une forge de niveau 3, la troisième commande est acceptée.
    expect(decide(state, order('o3', 'axe', 3), T0).ok).toBe(true)
  })

  it("libère la place d'une commande forgée ou dont le paiement a été refusé", () => {
    // La hache occupe l'atelier pendant sa fabrication, et le libère à son échéance.
    expect(decide(forging, order('o2'), T0 + minutes(1)).ok).toBe(false)
    expect(decide(forging, order('o2'), T0 + minutes(2)).ok).toBe(true)

    const failed = play(paying, refused('o1', { wood: 10 })).state
    expect(decide(failed, order('o2'), T0).ok).toBe(true)
  })

  it('refuse un identifiant de commande déjà utilisé', () => {
    expect(decide(forging, order('o1', 'axe', 5), T0)).toEqual({
      ok: false,
      error: { code: 'ORDER_EXISTS' },
    })
  })
})

describe('Forge - paiement et fabrication', () => {
  it('demande au Village le prélèvement du coût de la recette', () => {
    const { state, requests } = play(initialState, order('o1', 'sword'))
    expect(state.orders.o1).toMatchObject({ status: 'paying', readyAt: null })
    expect(requests).toEqual([
      {
        kind: 'withdraw',
        transferId: 'forge:alice:o1:pay',
        playerId: 'alice',
        resources: { wood: 30, stone: 80, gold: 20 },
      },
    ])
  })

  it('fait échouer la commande si le stock ne suffit pas, sans rien à compenser', () => {
    const { state, requests } = play(paying, refused('o1', { stone: 15 }))
    expect(state.orders.o1).toMatchObject({ status: 'failed', missing: { stone: 15 } })
    expect(requests).toEqual([])
    expect(toView(state, 1, T0 + minutes(60)).inventory.axe).toBe(0)
  })

  it("forge l'objet à l'échéance de sa fabrication, qui commence au paiement", () => {
    const { state, requests } = play(paying, paid('o1'), T0 + minutes(1))
    expect(state.orders.o1).toMatchObject({ status: 'forging', readyAt: T0 + minutes(3) })
    expect(requests).toEqual([])

    const before = toView(state, 1, T0 + minutes(3) - 1)
    expect(before.orders[0].status).toBe('forging')
    expect(before.inventory.axe).toBe(0)

    const after = toView(state, 1, T0 + minutes(3))
    expect(after.orders[0].status).toBe('forged')
    expect(after.inventory.axe).toBe(1)
    expect(after.busy).toBe(0)
  })
})

describe('Forge - idempotence', () => {
  it('ignore une réponse du Village reçue en double, ou contraire à la première', () => {
    expect(decide(forging, paid('o1'), T0)).toEqual({ ok: true, events: [] })
    expect(decide(forging, refused('o1', { wood: 5 }), T0)).toEqual({ ok: true, events: [] })

    const failed = play(paying, refused('o1', { wood: 5 })).state
    expect(decide(failed, paid('o1'), T0)).toEqual({ ok: true, events: [] })
  })

  it("ignore les mouvements qui ne viennent pas de la Forge, ou d'une commande inconnue", () => {
    const market: WorkshopCommand = {
      type: 'RecordTransferResult',
      transferId: 'o1:reserve',
      outcome: 'withdrawn',
    }
    expect(decide(paying, market, T0)).toEqual({ ok: true, events: [] })
    expect(decide(paying, paid('inconnue'), T0)).toEqual({ ok: true, events: [] })
  })

  it("retrouve le joueur et la commande à partir de l'identifiant d'un mouvement", () => {
    expect(parseTransferId('forge:alice:o1:pay')).toEqual({
      playerId: 'alice',
      orderId: 'o1',
      step: 'pay',
    })
    expect(parseTransferId('o1:reserve')).toBeNull()
  })
})

describe('Forge - annulation', () => {
  const cancel = (orderId: string): WorkshopCommand => ({ type: 'CancelOrder', orderId })

  it('annule une fabrication en cours, et restitue au village la moitié de son coût', () => {
    const { state, events, requests } = play(forging, cancel('o1'), T0 + minutes(1))
    expect(events).toEqual([
      {
        type: 'OrderCancelled',
        data: { orderId: 'o1', refund: { wood: 30, stone: 10 }, at: T0 + minutes(1) },
      },
    ])
    expect(requests).toEqual([
      {
        kind: 'deposit',
        transferId: 'forge:alice:o1:refund',
        playerId: 'alice',
        resources: { wood: 30, stone: 10 },
      },
    ])

    // La place est libérée, et l'objet ne sera jamais forgé.
    const view = toView(state, 1, T0 + minutes(5))
    expect(view.busy).toBe(0)
    expect(view.orders[0].status).toBe('cancelled')
    expect(view.inventory.axe).toBe(0)
  })

  it("arrondit chaque part à l'entier inférieur, et ne restitue pas une part nulle", () => {
    expect(refundOf({ wood: 61, stone: 1, gold: 20 })).toEqual({ wood: 30, gold: 10 })
  })

  it("refuse d'annuler une commande inconnue, en attente de paiement, forgée ou déjà annulée", () => {
    expect(decide(forging, cancel('inconnue'), T0)).toEqual({
      ok: false,
      error: { code: 'ORDER_NOT_FOUND' },
    })
    const notCancellable = { ok: false, error: { code: 'NOT_CANCELLABLE' } }
    expect(decide(paying, cancel('o1'), T0)).toEqual(notCancellable)
    expect(decide(forging, cancel('o1'), T0 + minutes(2))).toEqual(notCancellable)
    const cancelled = play(forging, cancel('o1')).state
    expect(decide(cancelled, cancel('o1'), T0)).toEqual(notCancellable)
  })
})

describe('Forge - délai de paiement', () => {
  const late = T0 + PAYMENT_TIMEOUT_MS

  it('libère la place et présente comme expirée une commande payée sans réponse dans le délai', () => {
    expect(toView(paying, 1, late - 1)).toMatchObject({ busy: 1, orders: [{ status: 'paying' }] })
    expect(toView(paying, 1, late)).toMatchObject({ busy: 0, orders: [{ status: 'expired' }] })
    expect(decide(paying, order('o2'), late).ok).toBe(true)
  })

  it('restitue la totalité du coût si le paiement arrive après le délai', () => {
    const { state, events, requests } = play(paying, paid('o1'), late)
    expect(events).toEqual([
      { type: 'OrderExpired', data: { orderId: 'o1', refund: { wood: 60, stone: 20 }, at: late } },
    ])
    expect(requests).toEqual([
      {
        kind: 'deposit',
        transferId: 'forge:alice:o1:refund',
        playerId: 'alice',
        resources: { wood: 60, stone: 20 },
      },
    ])
    expect(toView(state, 1, late).orders[0]).toMatchObject({ status: 'expired', readyAt: null })
    // Une réponse reçue ensuite en double est sans effet.
    expect(decide(state, paid('o1'), late)).toEqual({ ok: true, events: [] })
  })

  it('fait échouer la commande dont le paiement est refusé après le délai, sans rien restituer', () => {
    const { state, requests } = play(paying, refused('o1', { wood: 5 }), late)
    expect(state.orders.o1.status).toBe('failed')
    expect(requests).toEqual([])
  })
})

describe('Forge - conservation des ressources', () => {
  it('ne garde que le coût des objets payés, et la part non restituée des annulations', () => {
    // Quatre commandes dans une forge de niveau 4 : une forgée, une en fabrication,
    // une refusée et une annulée.
    const steps: [WorkshopCommand, number][] = [
      [order('axe', 'axe', 4), T0],
      [order('crown', 'crown', 4), T0],
      [order('sword', 'sword', 4), T0],
      [order('pickaxe', 'pickaxe', 4), T0],
      [paid('axe'), T0],
      [paid('crown'), T0],
      [refused('sword', { gold: 20 }), T0],
      [paid('pickaxe'), T0],
      [{ type: 'CancelOrder', orderId: 'pickaxe' }, T0 + minutes(1)],
    ]
    let state = initialState
    const requests: SagaRequest[] = []
    for (const [command, at] of steps) {
      const result = play(state, command, at)
      state = result.state
      requests.push(...result.requests)
    }

    // Le Village n'exécute que les prélèvements dont le paiement a été accepté, et tous les
    // versements : le solde est le total prélevé moins le total restitué.
    const refusedIds = new Set(['forge:alice:sword:pay'])
    const balance: Record<string, number> = {}
    for (const request of requests) {
      if (refusedIds.has(request.transferId)) continue
      const sign = request.kind === 'withdraw' ? 1 : -1
      for (const [resource, amount] of Object.entries(request.resources)) {
        balance[resource] = (balance[resource] ?? 0) + sign * (amount ?? 0)
      }
    }

    // Hache (60 bois, 20 pierres) et couronne (50 pierres, 100 or), rien pour l'épée refusée,
    // et la moitié non restituée de la pioche annulée (20 bois, 30 pierres).
    expect(balance).toEqual({ wood: 80, stone: 100, gold: 100 })
    const view = toView(state, 4, T0 + minutes(5))
    expect(view.inventory).toMatchObject({ axe: 1, crown: 0, sword: 0, pickaxe: 0 })
    expect(view.busy).toBe(1)
  })
})

describe("Forge - mouvements d'objets", () => {
  const withdraw = (transferId: string, axe: number): WorkshopCommand => ({
    type: 'WithdrawItems',
    transferId,
    items: { axe },
  })
  const deposit = (transferId: string, axe: number): WorkshopCommand => ({
    type: 'DepositItems',
    transferId,
    items: { axe },
  })
  // Une hache forgée : payée à T0, elle est prête à T0 + 2 minutes.
  const READY = T0 + minutes(2)

  it("retire un objet forgé de l'inventaire", () => {
    const { state, events } = play(forging, withdraw('t1', 1), READY)
    expect(events).toEqual([
      { type: 'ItemsWithdrawn', data: { transferId: 't1', items: { axe: 1 }, at: READY } },
    ])
    expect(toView(state, 1, READY).inventory.axe).toBe(0)
  })

  it("refuse le retrait d'un objet absent ou encore en fabrication", () => {
    expect(decide(forging, withdraw('t1', 1), READY - 1)).toEqual({
      ok: true,
      events: [
        {
          type: 'ItemWithdrawalRefused',
          data: { transferId: 't1', missing: { axe: 1 }, at: READY - 1 },
        },
      ],
    })
    const { state } = play(forging, withdraw('t1', 3), READY)
    expect(state.transfers.t1).toMatchObject({ outcome: 'refused', items: {} })
    expect(toView(state, 1, READY).inventory.axe).toBe(1)
  })

  it("verse des objets à l'inventaire, même sans aucune commande", () => {
    const { state } = play(initialState, deposit('t1', 2))
    expect(toView(state, 0, T0).inventory.axe).toBe(2)
    expect(play(state, withdraw('t2', 2)).state.transfers.t2.outcome).toBe('withdrawn')
  })

  it('ignore un retrait ou un versement reçu en double', () => {
    const withdrawn = play(forging, withdraw('t1', 1), READY).state
    expect(decide(withdrawn, withdraw('t1', 1), READY)).toEqual({ ok: true, events: [] })

    const deposited = play(initialState, deposit('t2', 1)).state
    expect(decide(deposited, deposit('t2', 1), T0)).toEqual({ ok: true, events: [] })
    expect(toView(deposited, 0, T0).inventory.axe).toBe(1)
  })
})
