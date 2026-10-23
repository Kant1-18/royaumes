import { beforeEach, describe, expect, it } from 'vitest'
import { REALM_TOPICS, TransferRequest } from '@/modules/realm/contracts'
import { createTestDatabase } from '@/platform/db/client'
import { createEventStore } from '@/platform/event-store/event-store'
import { createDispatcher, type MessageHandler } from '@/platform/outbox/outbox'
import { createEventStoreWorkshopRepository } from '../infrastructure/event-store-workshop-repository'
import { createForgeHandlers } from '../messages'
import { createForgeService, type ForgeService } from './forge-service'
import type { WorkshopRepository } from './workshop-repository'

const T0 = Date.UTC(2026, 0, 1)
const minutes = (n: number) => n * 60_000

// Chaque test dispose d'une base vidée, d'une horloge contrôlée, d'une capacité réglable,
// et d'un Village simulé qui répond aussitôt aux demandes de prélèvement.
let now: number
let capacity: number
let stock: Record<string, number>
let withdrawals: TransferRequest[]
let repo: WorkshopRepository
let service: ForgeService
let handlers: Record<string, MessageHandler>

beforeEach(async () => {
  now = T0
  capacity = 1
  stock = { wood: 100, stone: 100, gold: 0 }
  withdrawals = []

  const db = await createTestDatabase()
  repo = createEventStoreWorkshopRepository(createEventStore(db))
  // Le distributeur compare la disponibilité des messages, fixée par la base en heure
  // réelle, à sa propre horloge : il garde donc l'heure réelle.
  const dispatcher = createDispatcher(db)
  let ids = 0
  service = createForgeService(
    repo,
    { capacityOf: async () => capacity },
    { dispatch: () => dispatcher.dispatch(), clock: () => now, newId: () => `o${++ids}` },
  )
  handlers = createForgeHandlers(service)

  /** Village simulé : prélève si le stock suffit, et répond à l'adresse de retour. */
  const village: MessageHandler = async (message) => {
    const request = TransferRequest.parse(message.payload)
    withdrawals.push(request)
    const missing: Record<string, number> = {}
    for (const [resource, amount = 0] of Object.entries(request.resources)) {
      if ((stock[resource] ?? 0) < amount) missing[resource] = amount - (stock[resource] ?? 0)
    }
    const refused = Object.keys(missing).length > 0
    if (!refused) {
      for (const [resource, amount = 0] of Object.entries(request.resources)) {
        stock[resource] -= amount
      }
    }
    const topic = request.replyTo ?? ''
    await handlers[topic]({
      ...message,
      topic,
      payload: refused
        ? { transferId: request.transferId, outcome: 'refused', missing }
        : { transferId: request.transferId, outcome: 'withdrawn' },
    })
  }
  dispatcher.register({ [REALM_TOPICS.withdraw]: village, ...handlers })
})

describe('Service de la Forge', () => {
  it('fait payer la commande par le Village, puis lance la fabrication', async () => {
    const result = await service.placeOrder('alice', 'axe')

    expect(withdrawals).toEqual([
      {
        transferId: 'forge:alice:o1:pay',
        playerId: 'alice',
        resources: { wood: 60, stone: 20 },
        replyTo: 'forge.transfer-result',
      },
    ])
    expect(stock).toEqual({ wood: 40, stone: 80, gold: 0 })
    expect(result.ok && result.view.orders[0]).toMatchObject({
      orderId: 'o1',
      status: 'forging',
      readyAt: T0 + minutes(2),
    })
  })

  it('rejette la commande si le stock ne suffit pas, sans rien prélever', async () => {
    const result = await service.placeOrder('alice', 'crown')

    expect(stock).toEqual({ wood: 100, stone: 100, gold: 0 })
    expect(result.ok && result.view.orders[0]).toMatchObject({
      status: 'failed',
      missing: { gold: 100 },
    })
  })

  it("ajoute l'objet à l'inventaire à l'échéance de sa fabrication", async () => {
    await service.placeOrder('alice', 'axe')
    now += minutes(2)

    const view = await service.getView('alice')
    expect(view.orders[0].status).toBe('forged')
    expect(view.inventory.axe).toBe(1)
  })

  it("refuse la commande sans rien enregistrer si la forge n'est pas construite", async () => {
    capacity = 0
    const result = await service.placeOrder('alice', 'axe')

    expect(result).toEqual({ ok: false, error: { code: 'FORGE_NOT_BUILT' } })
    expect((await repo.load('alice')).version).toBe(0)
    expect(withdrawals).toEqual([])
  })

  it("n'accepte qu'une commande sur deux simultanées dans une forge de niveau 1", async () => {
    const results = await Promise.all([
      service.placeOrder('alice', 'axe'),
      service.placeOrder('alice', 'axe'),
    ])

    expect(results.filter((result) => result.ok)).toHaveLength(1)
    expect(results.find((result) => !result.ok)).toEqual({
      ok: false,
      error: { code: 'CAPACITY_REACHED', capacity: 1 },
    })
    expect(withdrawals).toHaveLength(1)
  })

  it('ignore une réponse du Village reçue une seconde fois', async () => {
    await service.placeOrder('alice', 'axe')
    const { version } = await repo.load('alice')

    await handlers['forge.transfer-result']({
      id: 'doublon',
      topic: 'forge.transfer-result',
      attempt: 1,
      payload: { transferId: 'forge:alice:o1:pay', outcome: 'withdrawn' },
    })
    expect((await repo.load('alice')).version).toBe(version)
  })

  it('lève une erreur pour un mouvement qui ne vient pas de la Forge', async () => {
    await expect(
      handlers['forge.transfer-result']({
        id: 'etranger',
        topic: 'forge.transfer-result',
        attempt: 1,
        payload: { transferId: 'o1:reserve', outcome: 'withdrawn' },
      }),
    ).rejects.toThrow('Mouvement étranger à la Forge')
  })
})
