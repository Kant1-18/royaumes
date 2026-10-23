import { headers } from 'next/headers'
import { currentUser } from '@/bootstrap/server'
import { ForgeScreen } from '@/modules/forge/ui'

/**
 * Page de la Forge. Elle transmet au composant l'identifiant du joueur connecté,
 * qui sert à nommer le canal temps réel de son atelier.
 * La mise en page du groupe (jeu) garantit qu'un joueur est connecté.
 */
export default async function ForgePage() {
  const user = await currentUser(await headers())
  return <ForgeScreen userId={user?.id ?? ''} />
}
