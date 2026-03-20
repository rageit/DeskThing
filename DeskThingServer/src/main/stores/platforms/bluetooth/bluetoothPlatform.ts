import {
  Client,
  DeskThingToDeviceCore,
  ProviderCapabilities,
  ConnectionState,
  ClientIdentifier,
  PlatformIDs
} from '@deskthing/types'
import {
  PlatformEvents,
  PlatformInterface,
  PlatformStatus,
  PlatformEvent,
  PlatformConnectionOptions
} from '@shared/interfaces/platformInterface'
import EventEmitter from 'node:events'
import { BluetoothService, BluetoothDevice } from './bluetoothService'
import logger from '@server/utils/logger'
import { PlatformIPC } from '@shared/types/ipc/ipcPlatform'
import { progressBus } from '@server/services/events/progressBus'
import { ProgressChannel } from '@shared/types'
import { handleError } from '@server/utils/errorHandler'
import { ClientIdentificationService } from '@server/services/clients/clientIdentificationService'

export class BluetoothPlatform extends EventEmitter<PlatformEvents> implements PlatformInterface {
  private btService: BluetoothService
  private isActive: boolean = false
  private startTime: number = 0
  private clients: Client[] = []
  private available: boolean = false

  public readonly id: PlatformIDs = PlatformIDs.BLUETOOTH
  public readonly name: string = 'Bluetooth'

  readonly identifier: Omit<ClientIdentifier, 'id' | 'active'> = {
    providerId: PlatformIDs.BLUETOOTH,
    capabilities: [ProviderCapabilities.PING],
    connectionState: ConnectionState.Established
  }

  constructor() {
    super()
    this.btService = new BluetoothService()
  }

  async start(_options?: PlatformConnectionOptions): Promise<void> {
    if (this.isActive) return
    this.isActive = true
    this.startTime = Date.now()

    this.available = await this.btService.isAvailable()
    if (!this.available) {
      logger.warn('Bluetooth is not available on this system (bluetoothctl not found)', {
        function: 'start',
        source: 'BluetoothPlatform'
      })
      return
    }

    try {
      await this.btService.setPower(true)
    } catch (error) {
      logger.warn('Failed to power on Bluetooth adapter', {
        error: error as Error,
        function: 'start',
        source: 'BluetoothPlatform'
      })
    }

    await this.refreshDevices()
  }

  async stop(): Promise<void> {
    if (!this.isActive) return
    this.isActive = false
    this.clients = []
  }

  isRunning(): boolean {
    return this.isActive
  }

  public handlePlatformEvent = async <T extends PlatformIPC>(data: T): Promise<T['data']> => {
    if (data.platform !== PlatformIDs.BLUETOOTH) return undefined

    switch (data.type) {
      case 'scan': {
        progressBus.start(ProgressChannel.PLATFORM_CHANNEL, 'Bluetooth Scan', 'Scanning...')
        try {
          const devices = await this.btService.scan(data.duration || 10000)
          progressBus.complete(
            ProgressChannel.PLATFORM_CHANNEL,
            `Found ${devices.length} devices`
          )
          return devices
        } catch (error) {
          progressBus.error(
            ProgressChannel.PLATFORM_CHANNEL,
            'Scan failed',
            handleError(error)
          )
          return []
        }
      }
      case 'get': {
        switch (data.request) {
          case 'devices':
            return this.btService.getDevices()
          case 'status':
            return { available: this.available, scanning: this.btService.isScanning() }
        }
        break
      }
      case 'pair': {
        progressBus.start(ProgressChannel.PLATFORM_CHANNEL, 'Bluetooth Pair', 'Pairing...')
        try {
          const paired = await this.btService.pair(data.address)
          if (paired) {
            await this.btService.trust(data.address)
          }
          progressBus.complete(
            ProgressChannel.PLATFORM_CHANNEL,
            paired ? 'Paired successfully' : 'Pairing failed'
          )
          await this.refreshDevices()
          return paired
        } catch (error) {
          progressBus.error(
            ProgressChannel.PLATFORM_CHANNEL,
            'Pairing failed',
            handleError(error)
          )
          return false
        }
      }
      case 'connect': {
        progressBus.start(ProgressChannel.PLATFORM_CHANNEL, 'Bluetooth Connect', 'Connecting...')
        try {
          const connected = await this.btService.connect(data.address)
          progressBus.complete(
            ProgressChannel.PLATFORM_CHANNEL,
            connected ? 'Connected' : 'Connection failed'
          )
          await this.refreshDevices()
          return connected
        } catch (error) {
          progressBus.error(
            ProgressChannel.PLATFORM_CHANNEL,
            'Connection failed',
            handleError(error)
          )
          return false
        }
      }
      case 'disconnect': {
        try {
          const disconnected = await this.btService.disconnect(data.address)
          await this.refreshDevices()
          return disconnected
        } catch {
          return false
        }
      }
      case 'remove': {
        try {
          const removed = await this.btService.remove(data.address)
          await this.refreshDevices()
          return removed
        } catch {
          return false
        }
      }
      case 'refresh': {
        progressBus.start(ProgressChannel.PLATFORM_CHANNEL, 'Refreshing Bluetooth', 'Refreshing...')
        await this.refreshDevices()
        progressBus.complete(ProgressChannel.PLATFORM_CHANNEL, 'Refresh complete')
        return this.clients
      }
    }

    return undefined
  }

  private async refreshDevices(): Promise<void> {
    if (!this.available) return

    try {
      const devices = await this.btService.getDevices()
      const previousClients = [...this.clients]

      // Build new client list from paired/connected devices
      this.clients = devices
        .filter((d) => d.paired || d.connected)
        .map((device) => this.deviceToClient(device))

      // Emit disconnected events for clients no longer present
      for (const prev of previousClients) {
        const stillExists = this.clients.find(
          (c) => c.identifiers[this.id]?.id === prev.identifiers[this.id]?.id
        )
        if (!stillExists) {
          this.emit(PlatformEvent.CLIENT_DISCONNECTED, prev)
        }
      }

      // Emit connected events for new clients
      for (const client of this.clients) {
        const wasExisting = previousClients.find(
          (c) => c.identifiers[this.id]?.id === client.identifiers[this.id]?.id
        )
        if (!wasExisting) {
          this.emit(PlatformEvent.CLIENT_CONNECTED, client)
        }
      }

      this.emit(PlatformEvent.CLIENT_LIST, this.clients)
    } catch (error) {
      logger.error('Failed to refresh Bluetooth devices', {
        error: error as Error,
        function: 'refreshDevices',
        source: 'BluetoothPlatform'
      })
    }
  }

  private deviceToClient(device: BluetoothDevice): Client {
    const existing = this.clients.find(
      (c) => c.identifiers[this.id]?.id === device.address
    )

    return {
      clientId: existing?.clientId || device.address,
      connectionState: device.connected
        ? ConnectionState.Connected
        : ConnectionState.Disconnected,
      connected: device.connected,
      timestamp: existing?.timestamp || Date.now(),
      identifiers: {
        ...(existing?.identifiers || {}),
        [this.id]: {
          id: device.address,
          active: device.connected,
          providerId: this.id,
          capabilities: this.identifier.capabilities,
          connectionState: device.connected
            ? ConnectionState.Connected
            : ConnectionState.Disconnected
        }
      },
      meta: {
        ...(existing?.meta || {}),
        [this.id]: {
          address: device.address,
          name: device.name,
          paired: device.paired,
          connected: device.connected,
          trusted: device.trusted
        }
      }
    }
  }

  private getInternalId(clientId: string): string | undefined {
    if (this.clients.find((c) => c.identifiers[this.id]?.id === clientId)) {
      return clientId
    }
    const client = this.clients.find(
      (c) => c.clientId === clientId || c.identifiers[this.id]?.id === clientId
    )
    return client?.identifiers[this.id]?.id
  }

  getClients(): Client[] {
    return this.clients
  }

  fetchClients = async (): Promise<Client[]> => {
    await this.refreshDevices()
    return this.clients
  }

  getClientById(clientId: string): Client | undefined {
    const internalId = this.getInternalId(clientId)
    return this.clients.find((client) => client.identifiers[this.id]?.id === internalId)
  }

  async refreshClient(clientId: string): Promise<Client | undefined> {
    await this.refreshDevices()
    return this.getClientById(clientId)
  }

  async refreshClients(_progressMultiplier: number = 1): Promise<boolean> {
    progressBus.start(
      ProgressChannel.REFRESH_CLIENTS,
      'Refreshing Bluetooth',
      'Refreshing Bluetooth'
    )
    await this.refreshDevices()
    progressBus.complete(ProgressChannel.REFRESH_CLIENTS, 'Refreshed Bluetooth devices')
    return true
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
        error instanceof Error ? error : new Error('Error updating Bluetooth client')
      )
      return undefined
    }
  }

  async sendData(
    _clientId: string,
    _data: DeskThingToDeviceCore & { app?: string }
  ): Promise<boolean> {
    // Bluetooth serial data transfer not yet implemented
    return false
  }

  async broadcastData(_data: DeskThingToDeviceCore & { app?: string }): Promise<void> {
    return
  }

  getStatus(): PlatformStatus {
    return {
      isActive: this.isActive,
      clients: this.clients,
      uptime: this.isActive ? Date.now() - this.startTime : 0
    }
  }
}
