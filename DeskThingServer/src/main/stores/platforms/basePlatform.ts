import {
  Client,
  ClientIdentifier,
  DeskThingToDeviceCore,
  PlatformIDs
} from '@deskthing/types'
import {
  PlatformEvents,
  PlatformInterface,
  PlatformStatus,
  PlatformEvent,
  PlatformConnectionOptions
} from '@shared/interfaces/platformInterface'
import { PlatformIPC } from '@shared/types/ipc/ipcPlatform'
import EventEmitter from 'node:events'
import { ClientIdentificationService } from '@server/services/clients/clientIdentificationService'
import { reconcileClients } from '@server/utils/reconcileClients'

/**
 * Base class for platform implementations. Provides shared client
 * management, lookup, status, and reconciliation logic.
 */
export abstract class BasePlatform
  extends EventEmitter<PlatformEvents>
  implements PlatformInterface
{
  protected clients: Client[] = []
  protected isActive: boolean = false
  protected startTime: number = 0

  public abstract readonly id: PlatformIDs
  public abstract readonly name: string
  public abstract readonly identifier: Omit<ClientIdentifier, 'id' | 'active'>

  // --- Abstract methods subclasses must implement ---

  abstract start(options?: PlatformConnectionOptions): Promise<void>
  abstract stop(): Promise<void>
  abstract handlePlatformEvent: <T extends PlatformIPC>(data: T) => Promise<T['data']>
  abstract sendData(
    clientId: string,
    data: DeskThingToDeviceCore & { app?: string }
  ): Promise<boolean>
  abstract broadcastData(data: DeskThingToDeviceCore & { app?: string }): Promise<void>
  abstract fetchClients(): Promise<Client[]>
  abstract refreshClients(progressMultiplier: number): Promise<boolean>
  abstract refreshClient(
    clientId: string,
    forceRefresh?: boolean
  ): Promise<Client | undefined>

  // --- Shared implementations ---

  isRunning(): boolean {
    return this.isActive
  }

  getClients(): Client[] {
    return this.clients
  }

  getClientById(clientId: string): Client | undefined {
    const internalId = this.getInternalId(clientId)
    return this.clients.find((client) => client.identifiers[this.id]?.id === internalId)
  }

  async updateClient(
    clientId: string,
    newClient: Partial<Client>,
    notify = true
  ): Promise<Client | undefined> {
    try {
      const internalId = this.getInternalId(clientId)
      const index = this.clients.findIndex(
        (client) => client.identifiers[this.id]?.id === internalId
      )
      if (index === -1) return undefined

      const client = this.clients[index]
      const updatedClient = ClientIdentificationService.mergeClients(client, newClient as Client)
      this.clients[index] = updatedClient
      if (notify) this.emit(PlatformEvent.CLIENT_UPDATED, updatedClient)
      return updatedClient
    } catch (error) {
      this.emit(
        PlatformEvent.ERROR,
        error instanceof Error ? error : new Error(`Error updating ${this.name} client`)
      )
      return undefined
    }
  }

  getStatus(): PlatformStatus {
    return {
      isActive: this.isActive,
      clients: this.clients,
      uptime: this.isActive ? Date.now() - this.startTime : 0
    }
  }

  /**
   * Resolves a clientId (which may be the external clientId or the
   * platform-specific internal id) to the internal platform id.
   */
  protected getInternalId(clientId: string): string | undefined {
    if (this.clients.find((c) => c.identifiers[this.id]?.id === clientId)) {
      return clientId
    }
    const client = this.clients.find(
      (c) => c.clientId === clientId || c.identifiers[this.id]?.id === clientId
    )
    return client?.identifiers[this.id]?.id
  }

  /**
   * Emits connect/disconnect/list events by diffing previous vs new clients.
   */
  protected reconcileClients(previousClients: Client[], newClients: Client[]): void {
    reconcileClients(previousClients, newClients, this.id, this)
  }
}
