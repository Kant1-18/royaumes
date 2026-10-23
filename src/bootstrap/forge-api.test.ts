import { describe, expect, it } from 'vitest'
import type { WorkshopView } from '@/modules/forge/contracts'
import type { Stock } from '@/modules/realm/contracts'
import { createTestApi } from './testing'

type TestApi = Awaited<ReturnType<typeof createTestApi>>

/** Stock du village d'un joueur. */
async function stockOf(api: TestApi, player = 'alice'): Promise<Stock> {
  const res = await api.get('/api/realm/village', player)
  return ((await res.json()) as { view: { stock: Stock } }).view.stock
}

/** Atelier d'un joueur. */
async function workshopOf(api: TestApi, player = 'alice'): Promise<WorkshopView> {
  return ((await (await api.get('/api/forge', player)).json()) as { view: WorkshopView }).view
}

/** Commande un objet au nom d'alice. */
const order = (api: TestApi, recipe: string) => api.post('/api/forge/orders', { recipe })

/**
 * Application de test où Alice a fondé son village, puis construit sa forge au bout de
 * 25 minutes (120 bois, 200 pierre). Dix minutes plus tard, son village dispose de
 * 330 bois, 60 pierre et 0 or.
 */
async function forgeBuilt({ villageService = false } = {}) {
  const api = await createTestApi({ villageService })
  await api.post('/api/realm/village', { name: 'Valombre' })
  api.advance(25)
  await api.post('/api/realm/village/upgrade', { building: 'forge' })
  api.advance(10)
  return api
}

describe('API du module Forge', () => {
  it('refuse une requête anonyme (401)', async () => {
    const api = await createTestApi()
    expect((await api.get('/api/forge', null)).status).toBe(401)
    expect((await api.get('/api/forge/recipes', null)).status).toBe(401)
    expect((await api.post('/api/forge/orders', { recipe: 'axe' }, null)).status).toBe(401)
  })

  it('présente le catalogue des recettes', async () => {
    const api = await createTestApi()
    const { recipes } = await (await api.get('/api/forge/recipes')).json()
    expect(Object.keys(recipes)).toEqual(['axe', 'pickaxe', 'shield', 'sword', 'crown'])
    expect(recipes.axe).toEqual({ cost: { wood: 60, stone: 20 }, durationMs: 120_000 })
  })

  it('refuse une recette inconnue (400)', async () => {
    const api = await forgeBuilt()
    const res = await order(api, 'catapult')
    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe('INVALID_INPUT')
  })

  it("refuse toute commande tant que la forge n'est pas construite (409)", async () => {
    const api = await createTestApi()
    await api.post('/api/realm/village', { name: 'Valombre' })

    const res = await order(api, 'axe')
    expect(res.status).toBe(409)
    expect((await res.json()).error.code).toBe('FORGE_NOT_BUILT')
    expect(await stockOf(api)).toEqual({ wood: 100, stone: 50, gold: 0 })
  })

  it("fait payer la commande au village, puis forge l'objet à son échéance", async () => {
    const api = await forgeBuilt()

    const res = await order(api, 'axe')
    expect(res.status).toBe(201)
    const { view } = (await res.json()) as { view: WorkshopView }
    expect(view).toMatchObject({ capacity: 1, busy: 1 })
    expect(view.orders[0]).toMatchObject({ recipe: 'axe', status: 'forging' })
    expect(await stockOf(api)).toEqual({ wood: 270, stone: 40, gold: 0 })

    // Deux minutes plus tard, la hache est forgée et l'atelier est libre.
    api.advance(2)
    const later = await workshopOf(api)
    expect(later.orders[0].status).toBe('forged')
    expect(later.inventory.axe).toBe(1)
    expect(later.busy).toBe(0)
  })

  it('fait échouer la commande que le village ne peut pas payer, sans rien prélever', async () => {
    const api = await forgeBuilt()

    const { view } = (await (await order(api, 'crown')).json()) as { view: WorkshopView }
    expect(view.orders[0]).toMatchObject({ status: 'failed', missing: { gold: 100 } })
    expect(await stockOf(api)).toEqual({ wood: 330, stone: 60, gold: 0 })
  })

  it("refuse une commande au-delà de la capacité de l'atelier (409)", async () => {
    const api = await forgeBuilt()
    await order(api, 'axe')

    const res = await order(api, 'pickaxe')
    expect(res.status).toBe(409)
    expect((await res.json()).error).toEqual({ code: 'CAPACITY_REACHED', capacity: 1 })
  })

  it('ne présente à un joueur que son propre atelier', async () => {
    const api = await forgeBuilt()
    await order(api, 'axe')

    const forBob = await workshopOf(api, 'bob')
    expect(forBob).toMatchObject({ capacity: 0, busy: 0, orders: [] })
  })

  it('fonctionne de la même manière avec un Village extrait', async () => {
    const api = await forgeBuilt({ villageService: true })

    const { view } = (await (await order(api, 'axe')).json()) as { view: WorkshopView }
    expect(view.orders[0]).toMatchObject({ recipe: 'axe', status: 'forging' })
    expect(await stockOf(api)).toEqual({ wood: 270, stone: 40, gold: 0 })
  })

  it('annule une fabrication en cours, et restitue au village la moitié de son coût', async () => {
    const api = await forgeBuilt()
    const { orderId } = (await (await order(api, 'axe')).json()) as { orderId: string }
    expect(await stockOf(api)).toEqual({ wood: 270, stone: 40, gold: 0 })

    const res = await api.post(`/api/forge/orders/${orderId}/cancel`, {})
    expect(res.status).toBe(200)
    const { view } = (await res.json()) as { view: WorkshopView }
    expect(view).toMatchObject({ busy: 0, orders: [{ status: 'cancelled' }] })
    // 60 bois et 20 pierres prélevés, 30 bois et 10 pierres restitués.
    expect(await stockOf(api)).toEqual({ wood: 300, stone: 50, gold: 0 })

    // Une seconde annulation est refusée, et ne restitue rien.
    const again = await api.post(`/api/forge/orders/${orderId}/cancel`, {})
    expect(again.status).toBe(409)
    expect((await again.json()).error.code).toBe('NOT_CANCELLABLE')
    expect(await stockOf(api)).toEqual({ wood: 300, stone: 50, gold: 0 })
  })

  it("refuse d'annuler la commande d'un autre joueur, ou une commande inconnue (404)", async () => {
    const api = await forgeBuilt()
    const { orderId } = (await (await order(api, 'axe')).json()) as { orderId: string }

    expect((await api.post(`/api/forge/orders/${orderId}/cancel`, {}, 'bob')).status).toBe(404)
    expect((await api.post('/api/forge/orders/inconnue/cancel', {})).status).toBe(404)
    expect((await api.post(`/api/forge/orders/${orderId}/cancel`, {}, null)).status).toBe(401)
  })

  it("inclut les commandes de l'atelier dans l'export des données du joueur", async () => {
    const api = await forgeBuilt()
    await order(api, 'axe')

    const { sections } = await (await api.get('/api/account/export')).json()
    expect(sections.forge.orders).toMatchObject([{ recipe: 'axe', status: 'forging' }])
  })
})
