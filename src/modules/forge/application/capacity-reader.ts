/** Port de lecture de la capacité des ateliers, défini par la couche application. */
export interface CapacityReader {
  /** Niveau de la forge du village du joueur, à jour au moment de l'appel ; 0 sans forge. */
  capacityOf(playerId: string): Promise<number>
}
