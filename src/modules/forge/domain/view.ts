/** Vue de l'atelier : ce que son propriétaire en voit à un instant donné. */
import type { Recipe } from './recipes'
import {
  inventoryAt,
  isActive,
  isForged,
  type Order,
  type OrderStatus,
  type WorkshopState,
} from './workshop'

/** État d'une commande présenté au joueur : l'état enregistré, ou « forgé » après l'échéance. */
export type OrderViewStatus = OrderStatus | 'forged'

export type OrderView = Omit<Order, 'status'> & { status: OrderViewStatus }

export interface WorkshopView {
  /** Niveau de la forge du village : nombre de commandes que l'atelier traite à la fois. */
  capacity: number
  /** Nombre de commandes qui occupent l'atelier. */
  busy: number
  /** Commandes, de la plus récente à la plus ancienne. */
  // DETTE TECHNIQUE DT-010 (docs/qualite/dette-technique.md) : tout l'historique est
  // présenté, sans pagination.
  orders: OrderView[]

  /** Nombre d'objets possédés, par recette : forgés, reçus ou cédés au Marché. */
  inventory: Record<Recipe, number>
  /** Instant auquel la vue a été calculée. */
  asOf: number
}

export function toView(state: WorkshopState, capacity: number, now: number): WorkshopView {
  const orders = Object.values(state.orders).sort((a, b) => b.placedAt - a.placedAt)

  return {
    capacity,
    busy: orders.filter((order) => isActive(order, now)).length,
    orders: orders.map((order) => ({
      ...order,
      status: isForged(order, now) ? 'forged' : order.status,
    })),
    inventory: inventoryAt(state, now),
    asOf: now,
  }
}
