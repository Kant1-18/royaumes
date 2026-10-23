import { headers } from 'next/headers'
import { currentUser } from '@/bootstrap/server'
import { MarketScreen } from '@/modules/market/ui'

/**
 * Page du Marché. Elle transmet au composant l'identifiant du joueur connecté,
 * qui sert à suivre l'inventaire de ses objets, tenu par la Forge.
 * La mise en page du groupe (jeu) garantit qu'un joueur est connecté.
 */
export default async function MarketPage() {
  const user = await currentUser(await headers())
  return <MarketScreen userId={user?.id ?? ''} />
}
