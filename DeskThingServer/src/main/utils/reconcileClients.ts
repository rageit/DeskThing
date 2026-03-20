import { Client, PlatformIDs } from '@deskthing/types'
import { PlatformEvent } from '@shared/interfaces/platformInterface'
import EventEmitter from 'node:events'

/**
 * Compares previous and new client lists, emitting appropriate
 * connected/disconnected/list events for changes.
 */
export function reconcileClients(
  previousClients: Client[],
  newClients: Client[],
  platformId: PlatformIDs,
  emitter: EventEmitter
): void {
  const getId = (c: Client): string | undefined => c.identifiers[platformId]?.id

  for (const prev of previousClients) {
    const prevId = getId(prev)
    if (!newClients.find((c) => getId(c) === prevId)) {
      emitter.emit(PlatformEvent.CLIENT_DISCONNECTED, prev)
    }
  }

  for (const client of newClients) {
    const clientId = getId(client)
    if (!previousClients.find((c) => getId(c) === clientId)) {
      emitter.emit(PlatformEvent.CLIENT_CONNECTED, client)
    }
  }

  emitter.emit(PlatformEvent.CLIENT_LIST, newClients)
}
