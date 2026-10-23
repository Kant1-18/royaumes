'use client'
import { hc } from 'hono/client'
import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { Entity } from '@/ui/entity'
import { look } from '@/ui/theme'
import type { ForgeApi } from './api'
import {
  type Amounts,
  type OrderView,
  type OrderViewStatus,
  RECIPE_CATALOG,
  RECIPES,
  type Recipe,
  type WorkshopError,
  type WorkshopView,
} from './contracts'

/** Client HTTP typé, déduit de la sous-application Hono du module. */
const client = hc<ForgeApi>('/api/forge')

/**
 * Inventaire d'objets du joueur connecté, par recette ; null si la Forge ne répond pas.
 * C'est la lecture offerte aux écrans des autres modules, comme le Marché : la route et
 * le client de la Forge restent ainsi l'affaire de la Forge.
 */
export async function readInventory(): Promise<Record<Recipe, number> | null> {
  const res = await client.index.$get()
  if (!res.ok) return null
  return (await res.json()).view.inventory
}

/** Libellé de chaque état d'une commande. */
const ORDER_STATUS: Record<OrderViewStatus, string> = {
  paying: 'Paiement en cours',
  forging: 'En fabrication',
  forged: 'Forgé',
  failed: 'Échouée : stock insuffisant',
  cancelled: 'Annulée',
  expired: 'Expirée : paiement sans réponse',
}

/** Message affiché au joueur pour chaque erreur. */
const ERRORS: Record<WorkshopError['code'] | 'INVALID_INPUT', string> = {
  INVALID_INPUT: 'Saisie invalide.',
  UNKNOWN_RECIPE: 'Recette inconnue.',
  ORDER_EXISTS: 'Commande déjà passée.',
  FORGE_NOT_BUILT: "La forge de votre village n'est pas construite.",
  CAPACITY_REACHED: "L'atelier est complet.",
  ORDER_NOT_FOUND: 'Commande introuvable.',
  NOT_CANCELLABLE: 'Seule une fabrication en cours peut être annulée.',
}

/** Affiche des quantités de ressources : « 60 bois, 20 pierre ». */
function AmountsText({ amounts }: { amounts: Amounts }) {
  return (
    <>
      {Object.entries(amounts).map(([resource, amount], index) => (
        <span key={resource}>
          {index > 0 && ', '}
          {amount} <Entity kind={resource} />
        </span>
      ))}
    </>
  )
}

/** Durée restante, au format « 1 min 05 s ». */
function remaining(ms: number) {
  const seconds = Math.max(0, Math.ceil(ms / 1000))
  const minutes = Math.floor(seconds / 60)
  return minutes > 0
    ? `${minutes} min ${String(seconds % 60).padStart(2, '0')} s`
    : `${seconds % 60} s`
}

/** Ressources restituées, pour une commande annulée ou expirée : « 30 bois, 10 pierre ». */
function refundText(order: OrderView) {
  return Object.entries(order.refund ?? {})
    .map(([resource, amount]) => `${amount} ${look(resource).label.toLowerCase()}`)
    .join(', ')
}

/** Compte rendu d'une commande, à partir de sa vue renvoyée par l'API. */
function outcomeOf(order: OrderView): string {
  if (order.status === 'cancelled') {
    return `${look(order.recipe).label} annulée : ${refundText(order)} restitués au village.`
  }
  if (order.status === 'failed' && order.missing) {
    const missing = Object.entries(order.missing)
      .map(([resource, amount]) => `${amount} ${look(resource).label.toLowerCase()}`)
      .join(', ')
    return `Paiement refusé : il vous manque ${missing}.`
  }
  return `${look(order.recipe).label} : ${ORDER_STATUS[order.status].toLowerCase()}.`
}

/** Écran de la Forge : recettes, commandes en cours, inventaire et historique de l'atelier. */
export function ForgeScreen() {
  const [view, setView] = useState<WorkshopView | undefined>(undefined)
  const [now, setNow] = useState(() => Date.now())
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null)

  // REQUÊTE : la consultation distribue la boîte d'envoi, puis renvoie la vue de l'atelier.
  const refresh = useCallback(async () => {
    const res = await client.index.$get()
    if (res.ok) setView((await res.json()).view)
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  // Le temps restant est recalculé chaque seconde, sans interroger le serveur.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1_000)
    return () => clearInterval(timer)
  }, [])

  // Une fabrication qui atteint son échéance est relue, pour mettre à jour l'inventaire.
  // DETTE TECHNIQUE DT-012 (docs/qualite/dette-technique.md) : sans canal temps réel, un
  // paiement en attente, un objet échangé au Marché ou une action d'un autre onglet
  // n'apparaît qu'au rechargement.
  const due = view?.orders.some(
    (order) => order.status === 'forging' && order.readyAt !== null && now >= order.readyAt,
  )
  useEffect(() => {
    if (due) refresh()
  }, [due, refresh])

  // COMMANDES : chaque réponse contient la vue de l'atelier, ou une erreur.
  async function handle(res: Response) {
    const body = (await res.json()) as
      | { orderId: string; view: WorkshopView }
      | { error: { code: keyof typeof ERRORS } }
    if ('error' in body) {
      setMessage({ text: ERRORS[body.error.code] ?? 'Erreur.', error: true })
      return
    }
    setView(body.view)
    const order = body.view.orders.find((o) => o.orderId === body.orderId)
    if (order) setMessage({ text: outcomeOf(order), error: order.status === 'failed' })
  }

  const forge = async (recipe: Recipe) => handle(await client.orders.$post({ json: { recipe } }))
  const cancel = async (orderId: string) =>
    handle(await client.orders[':orderId'].cancel.$post({ param: { orderId } }))

  const title = (
    <div className="row" style={{ justifyContent: 'space-between' }}>
      <h1>
        <Entity kind="forge" /> Forge
      </h1>
      {view && view.capacity > 0 && (
        <span className="muted">
          Atelier : {view.busy} / {view.capacity}
        </span>
      )}
    </div>
  )

  // Chargement en cours.
  if (!view) return title

  // Forge non construite : le joueur est renvoyé vers son village.
  if (view.capacity === 0) {
    return (
      <>
        {title}
        <p className="panel">
          Construisez la forge de votre <Link href="/village">village</Link> pour fabriquer des
          objets. Chaque niveau de la forge permet une fabrication simultanée de plus.
        </p>
      </>
    )
  }

  const full = view.busy >= view.capacity
  const active = view.orders.filter((o) => o.status === 'paying' || o.status === 'forging')
  const done = view.orders.filter((o) => o.status !== 'paying' && o.status !== 'forging')

  return (
    <>
      {title}

      <section className="panel" aria-label="Recettes">
        <h2>Recettes</h2>
        <ul className="offers">
          {RECIPES.map((recipe) => (
            <li key={recipe}>
              <span>
                <Entity kind={recipe} showLabel />{' '}
                <span className="muted">
                  <AmountsText amounts={RECIPE_CATALOG[recipe].cost} /> ·{' '}
                  {remaining(RECIPE_CATALOG[recipe].durationMs)}
                </span>
              </span>
              <button type="button" disabled={full} onClick={() => forge(recipe)}>
                Forger
              </button>
            </li>
          ))}
        </ul>
      </section>
      {message && (
        <p className={message.error ? 'error' : 'muted'} role="status">
          {message.text}
        </p>
      )}

      <section className="panel" aria-label="Fabrications en cours">
        <h2>En cours</h2>
        {active.length === 0 && <p className="muted">Aucune fabrication en cours.</p>}
        <ul className="offers">
          {active.map((order) => (
            <li key={order.orderId}>
              <Entity kind={order.recipe} showLabel />
              <span className="muted">
                {order.status === 'forging' && order.readyAt !== null
                  ? `Prêt dans ${remaining(order.readyAt - now)}`
                  : ORDER_STATUS[order.status]}
              </span>
              {order.status === 'forging' && (
                <button type="button" onClick={() => cancel(order.orderId)}>
                  Annuler
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="panel" aria-label="Inventaire">
        <h2>Inventaire</h2>
        <div className="row">
          {RECIPES.filter((recipe) => view.inventory[recipe] > 0).map((recipe) => (
            <span key={recipe}>
              <Entity kind={recipe} /> × {view.inventory[recipe]}
            </span>
          ))}
          {RECIPES.every((recipe) => view.inventory[recipe] === 0) && (
            <span className="muted">Aucun objet forgé.</span>
          )}
        </div>
      </section>

      <section className="panel" aria-label="Historique">
        <h2>Historique</h2>
        {done.length === 0 && <p className="muted">Aucune commande terminée.</p>}
        <ul className="offers">
          {done.map((order) => (
            <li key={order.orderId}>
              <Entity kind={order.recipe} showLabel />
              <span className={order.status === 'failed' ? 'error' : 'muted'}>
                {ORDER_STATUS[order.status]}
                {order.refund && ` (${refundText(order)} restitués)`}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </>
  )
}
