import { describe, expect, it } from 'vitest'
import type { WorkshopView } from '@/modules/forge/contracts'
import type { Amounts, MarketList, OfferView } from '@/modules/market/contracts'
import type { Stock } from '@/modules/realm/contracts'
import { createTestApi } from './testing'

type TestApi = Awaited<ReturnType<typeof createTestApi>>

/**
 * Application de test où Alice, Bob et Carol ont fondé leur village : chacun dispose de
 * 100 bois et 50 pierre. L'horloge reste figée tant que le test ne la fait pas avancer :
 * les villages ne produisent rien, et les stocks ne varient que par les échanges.
 */
async function marketWithVillages() {
  const api = await createTestApi()
  for (const player of ['alice', 'bob', 'carol']) {
    await api.post('/api/realm/village', { name: `Village de ${player}` }, player)
  }
  return api
}

/** Stock du village d'un joueur. */
async function stockOf(api: TestApi, player: string): Promise<Stock> {
  const res = await api.get('/api/realm/village', player)
  return ((await res.json()) as { view: { stock: Stock } }).view.stock
}

/** Inventaire des objets d'un joueur, tenu par la Forge. */
async function inventoryOf(api: TestApi, player: string) {
  const res = await api.get('/api/forge', player)
  return ((await res.json()) as { view: WorkshopView }).view.inventory
}

/**
 * Application de test où Alice possède une hache : elle a construit sa forge au bout de
 * 25 minutes, puis y a fait forger une hache, prête deux minutes plus tard. Bob a fondé
 * son village en même temps qu'elle.
 */
async function axeForged({ villageService = false } = {}) {
  const api = await createTestApi({ villageService })
  for (const player of ['alice', 'bob']) {
    await api.post('/api/realm/village', { name: `Village de ${player}` }, player)
  }
  api.advance(25)
  await api.post('/api/realm/village/upgrade', { building: 'forge' })
  api.advance(10)
  await api.post('/api/forge/orders', { recipe: 'axe' })
  api.advance(2)
  return api
}

/** Publie au nom d'Alice l'offre « 60 bois contre 30 pierre », ou une autre offre. */
async function publish(api: TestApi, give: Amounts = { wood: 60 }, want: Amounts = { stone: 30 }) {
  const res = await api.post('/api/market/offers', { give, want }, 'alice')
  return (await res.json()) as { offerId: string; view: OfferView }
}

/** Accepte une offre au nom d'un joueur. */
const accept = (api: TestApi, offerId: string, player: string) =>
  api.post(`/api/market/offers/${offerId}/accept`, {}, player)

describe('API du module Marché', () => {
  it('refuse une requête anonyme (401)', async () => {
    const api = await createTestApi()
    expect((await api.get('/api/market/offers', null)).status).toBe(401)
  })

  it("ouvre l'offre et place les ressources du vendeur en séquestre", async () => {
    const api = await marketWithVillages()
    const { view } = await publish(api)

    // La saga a progressé jusqu'à l'ouverture pendant la requête de publication.
    expect(view).toMatchObject({ status: 'open', isSeller: true, give: { wood: 60 } })
    expect((await stockOf(api, 'alice')).wood).toBe(40)
  })

  it("refuse l'offre lorsque le stock du vendeur ne suffit pas", async () => {
    const api = await marketWithVillages()
    const { view } = await publish(api, { wood: 500 })

    expect(view.status).toBe('rejected')
    expect((await stockOf(api, 'alice')).wood).toBe(100)
  })

  it("réalise l'échange complet, sans créer ni perdre de ressource", async () => {
    const api = await marketWithVillages()
    const { offerId } = await publish(api)

    const res = await accept(api, offerId, 'bob')
    expect(((await res.json()) as { view: OfferView }).view).toMatchObject({
      status: 'completed',
      buyerName: 'bob',
    })
    expect(await stockOf(api, 'alice')).toMatchObject({ wood: 40, stone: 80 })
    expect(await stockOf(api, 'bob')).toMatchObject({ wood: 160, stone: 20 })
  })

  it("rouvre l'offre lorsque le paiement de l'acheteur est refusé", async () => {
    const api = await marketWithVillages()
    const { offerId } = await publish(api, { wood: 60 }, { stone: 80 })

    const res = await accept(api, offerId, 'bob')
    expect(((await res.json()) as { view: OfferView }).view).toMatchObject({
      status: 'open',
      missing: { stone: 30 },
    })
    // Bob n'a rien perdu, et les ressources d'Alice restent en séquestre.
    expect((await stockOf(api, 'bob')).stone).toBe(50)
    expect((await stockOf(api, 'alice')).wood).toBe(40)
  })

  it('restitue les ressources au vendeur qui retire son offre', async () => {
    const api = await marketWithVillages()
    const { offerId } = await publish(api)

    expect((await accept(api, offerId, 'alice')).status).toBe(409)
    expect((await api.post(`/api/market/offers/${offerId}/withdraw`, {}, 'bob')).status).toBe(403)
    const res = await api.post(`/api/market/offers/${offerId}/withdraw`, {}, 'alice')
    expect(((await res.json()) as { view: OfferView }).view.status).toBe('withdrawn')
    expect((await stockOf(api, 'alice')).wood).toBe(100)
  })

  it("retire l'offre à son échéance, à la première consultation du Marché", async () => {
    const api = await marketWithVillages()
    const { offerId } = await publish(api)

    api.advance(24 * 60)
    // L'offre échue n'est plus proposée, ni acceptée.
    expect((await accept(api, offerId, 'bob')).status).toBe(409)
    // La consultation du Marché distribue le rappel différé : l'offre est retirée.
    const list = (await (await api.get('/api/market/offers', 'bob')).json()) as MarketList
    expect(list.offers).toEqual([])
    const view = (await (await api.get(`/api/market/offers/${offerId}`)).json()) as {
      view: OfferView
    }
    expect(view.view).toMatchObject({ status: 'withdrawn', withdrawnBecause: 'expired' })
  })

  it("ne conclut l'échange qu'avec un seul acheteur, lors de deux acceptations simultanées", async () => {
    const api = await marketWithVillages()
    const { offerId } = await publish(api)

    const results = await Promise.all([accept(api, offerId, 'bob'), accept(api, offerId, 'carol')])
    expect(results.map((res) => res.status).sort()).toEqual([200, 409])

    // Conservation des ressources : les trois villages totalisent toujours 300 bois et 150 pierre.
    const stocks = await Promise.all(['alice', 'bob', 'carol'].map((p) => stockOf(api, p)))
    expect(stocks.reduce((sum, stock) => sum + stock.wood, 0)).toBe(300)
    expect(stocks.reduce((sum, stock) => sum + stock.stone, 0)).toBe(150)
  })

  it('présente au vendeur ses offres, et aux autres joueurs les offres ouvertes', async () => {
    const api = await marketWithVillages()
    const { offerId } = await publish(api)

    const forAlice = (await (await api.get('/api/market/offers')).json()) as MarketList
    expect(forAlice.offers).toMatchObject([{ offerId, mine: true, status: 'open' }])
    const forBob = (await (await api.get('/api/market/offers', 'bob')).json()) as MarketList
    expect(forBob.offers).toMatchObject([{ offerId, mine: false, sellerName: 'alice' }])
  })
})

describe("API du module Marché - échange d'objets de la Forge", () => {
  // La saga du Marché s'adresse à la Forge et au Village par la boîte d'envoi :
  // l'échange doit aboutir de la même façon lorsque le Village est un service extrait.
  for (const villageService of [false, true]) {
    it(`échange une hache contre de la pierre (Village extrait : ${villageService})`, async () => {
      const api = await axeForged({ villageService })
      const { offerId, view } = await publish(api, { axe: 1 }, { stone: 30 })

      // La hache est en séquestre : elle a quitté l'inventaire d'Alice.
      expect(view.status).toBe('open')
      expect((await inventoryOf(api, 'alice')).axe).toBe(0)

      const alice = await stockOf(api, 'alice')
      const bob = await stockOf(api, 'bob')
      const res = await accept(api, offerId, 'bob')
      expect(((await res.json()) as { view: OfferView }).view.status).toBe('completed')
      expect((await inventoryOf(api, 'bob')).axe).toBe(1)
      expect((await stockOf(api, 'alice')).stone).toBe(alice.stone + 30)
      expect((await stockOf(api, 'bob')).stone).toBe(bob.stone - 30)
    })
  }

  it("fait payer un objet à l'acheteur", async () => {
    const api = await axeForged()
    const res = await api.post(
      '/api/market/offers',
      { give: { stone: 30 }, want: { axe: 1 } },
      'bob',
    )
    const { offerId } = (await res.json()) as { offerId: string }

    await accept(api, offerId, 'alice')
    expect((await inventoryOf(api, 'alice')).axe).toBe(0)
    expect((await inventoryOf(api, 'bob')).axe).toBe(1)
  })

  it("restitue l'objet au vendeur qui retire son offre", async () => {
    const api = await axeForged()
    const { offerId } = await publish(api, { axe: 1 }, { stone: 30 })

    await api.post(`/api/market/offers/${offerId}/withdraw`, {}, 'alice')
    expect((await inventoryOf(api, 'alice')).axe).toBe(1)
  })

  it("refuse l'offre d'un objet que le vendeur ne possède pas", async () => {
    const api = await axeForged()
    const { view } = await publish(api, { sword: 1 }, { stone: 30 })
    expect(view.status).toBe('rejected')
  })

  it('refuse un côté qui mêle ressources et objets (400)', async () => {
    const api = await axeForged()
    const res = await api.post('/api/market/offers', {
      give: { axe: 1, wood: 5 },
      want: { stone: 30 },
    })
    expect(res.status).toBe(400)
  })
})
