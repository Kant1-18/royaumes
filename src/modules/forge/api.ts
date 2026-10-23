import { Hono } from 'hono'
import type { AppEnv } from '@/platform/http/types'
import { validateJson } from '@/platform/http/validate'
import type { ForgeService } from './application/forge-service'
import { PlaceOrderInput, RECIPE_CATALOG, type WorkshopError } from './contracts'

/** Code HTTP associé à chaque erreur métier. */
const STATUS: Record<WorkshopError['code'], 400 | 409> = {
  UNKNOWN_RECIPE: 400,
  ORDER_EXISTS: 409,
  FORGE_NOT_BUILT: 409,
  CAPACITY_REACHED: 409,
}

/**
 * Sous-application Hono du module Forge, montée sur /api/forge.
 * Le joueur est toujours celui que l'authentification a identifié : aucune route
 * n'accepte un identifiant de joueur dans la requête.
 */
export function createForgeApi(service: ForgeService) {
  return (
    new Hono<AppEnv>()
      // Atelier du joueur : capacité, commandes et inventaire.
      .get('/', async (c) => c.json({ view: await service.getView(c.var.userId) }))

      // Catalogue des recettes : coût et durée de fabrication de chaque objet.
      .get('/recipes', (c) => c.json({ recipes: RECIPE_CATALOG }))

      // Commande d'un objet.
      .post('/orders', validateJson(PlaceOrderInput), async (c) => {
        const result = await service.placeOrder(c.var.userId, c.req.valid('json').recipe)
        return result.ok
          ? c.json({ orderId: result.orderId, view: result.view }, 201)
          : c.json({ error: result.error }, STATUS[result.error.code])
      })
  )
}

/** Type de la sous-application, utilisé par le client typé de l'interface. */
export type ForgeApi = ReturnType<typeof createForgeApi>
