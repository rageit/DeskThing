import {
  Client,
  DeskThingToDeviceCore,
  ProviderCapabilities,
  ConnectionState,
  ClientIdentifier,
  PlatformIDs
} from '@deskthing/types'
import { PlatformConnectionOptions } from '@shared/interfaces/platformInterface'
import { BluetoothService, BluetoothDevice } from './bluetoothService'
import logger from '@server/utils/logger'
import { PlatformIPC } from '@shared/types/ipc/ipcPlatform'
import { progressBus } from '@server/services/events/progressBus'
import { ProgressChannel } from '@shared/types'
import { withProgress } from '@server/utils/withProgress'
import { BasePlatform } from '../basePlatform'

export class BluetoothPlatform extends BasePlatform {
  private btService: BluetoothService
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

  public handlePlatformEvent = async <T extends PlatformIPC>(data: T): Promise<T['data']> => {
    if (data.platform !== PlatformIDs.BLUETOOTH) return undefined

    switch (data.type) {
      case 'scan':
        return withProgress(
          ProgressChannel.PLATFORM_CHANNEL,
          'Bluetooth Scan',
          async () => {
            const devices = await this.btService.scan(data.duration || 10000)
            progressBus.complete(
              ProgressChannel.PLATFORM_CHANNEL,
              `Found ${devices.length} devices`
            )
            return devices
          },
          { errorFallback: [] }
        )
      case 'get': {
        switch (data.request) {
          case 'devices':
            return this.btService.getDevices()
          case 'status':
            return { available: this.available, scanning: this.btService.isScanning() }
        }
        break
      }
      case 'pair':
        return withProgress(
          ProgressChannel.PLATFORM_CHANNEL,
          'Bluetooth Pair',
          async () => {
            const paired = await this.btService.pair(data.address)
            if (paired) await this.btService.trust(data.address)
            progressBus.complete(
              ProgressChannel.PLATFORM_CHANNEL,
              paired ? 'Paired successfully' : 'Pairing failed'
            )
            await this.refreshDevices()
            return paired
          },
          { errorFallback: false }
        )
      case 'connect':
        return withProgress(
          ProgressChannel.PLATFORM_CHANNEL,
          'Bluetooth Connect',
          async () => {
            const connected = await this.btService.connect(data.address)
            progressBus.complete(
              ProgressChannel.PLATFORM_CHANNEL,
              connected ? 'Connected' : 'Connection failed'
            )
            await this.refreshDevices()
            return connected
          },
          { errorFallback: false }
        )
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
      case 'refresh':
        return withProgress(
          ProgressChannel.PLATFORM_CHANNEL,
          'Refreshing Bluetooth',
          async () => {
            await this.refreshDevices()
            return this.clients
          }
        )
    }

    return undefined
  }

  private async refreshDevices(): Promise<void> {
    if (!this.available) return

    try {
      const devices = await this.btService.getDevices()
      const previousClients = [...this.clients]

      this.clients = devices
        .filter((d) => d.paired || d.connected)
        .map((device) => this.deviceToClient(device))

      this.reconcileClients(previousClients, this.clients)
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

  fetchClients = async (): Promise<Client[]> => {
    await this.refreshDevices()
    return this.clients
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
}
