/**
 * Contenu de la Forge : recettes, coûts et durées de fabrication.
 * Ce fichier ne contient que des données. Les règles qui les utilisent
 * se trouvent dans workshop.ts : rééquilibrer la Forge ne demande de modifier qu'ici.
 */

/** Quantités de ressources, par nom de ressource (« wood », « stone », « gold »). */
export type Amounts = Partial<Record<string, number>>

/** Objets que la Forge sait fabriquer. */
export const RECIPES = ['axe', 'pickaxe', 'shield', 'sword', 'crown'] as const
export type Recipe = (typeof RECIPES)[number]

const minutes = (n: number) => n * 60_000

/** Pour chaque objet : le coût prélevé au village, et la durée de sa fabrication. */
export const RECIPE_CATALOG: Record<Recipe, { cost: Amounts; durationMs: number }> = {
  axe: { cost: { wood: 60, stone: 20 }, durationMs: minutes(2) },
  pickaxe: { cost: { wood: 40, stone: 60 }, durationMs: minutes(3) },
  shield: { cost: { wood: 100, stone: 40, gold: 10 }, durationMs: minutes(4) },
  sword: { cost: { wood: 30, stone: 80, gold: 20 }, durationMs: minutes(5) },
  crown: { cost: { stone: 50, gold: 100 }, durationMs: minutes(10) },
}

/** Part du coût restituée au village à l'annulation d'une fabrication. */
export const REFUND_SHARE = 0.5

/** Vrai si la valeur désigne un objet du catalogue. */
export const isRecipe = (value: string): value is Recipe =>
  (RECIPES as readonly string[]).includes(value)
