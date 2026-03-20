import {
  Client,
  DeskThingToDeviceCore,
  ClientManifest,
  ProviderCapabilities,
  ConnectionState,
  ClientIdentifier,
  PlatformIDs
} from '@deskthing/types'
import {
  PlatformEvent,
  PlatformConnectionOptions
} from '@shared/interfaces/platformInterface'
import { ADBService } from './adbService'
import { storeProvider } from '@server/stores/storeProvider'
import logger from '@server/utils/logger'
import { PlatformIPC } from '@shared/types/ipc/ipcPlatform'
import { app } from 'electron'
import { join } from 'node:path'
import { readFile, writeFile } from 'node:fs/promises'
import { progressBus } from '@server/services/events/progressBus'
import { ProgressChannel, SCRIPT_IDs } from '@shared/types'
import { handleError } from '@server/utils/errorHandler'
import { BasePlatform } from '../basePlatform'

interface ADBDeviceData {
  deviceVersion: string
  usid: string
  macBt: string
  brightness: string
  services: Record<string, boolean>
  wifiIp: string | undefined
}

export class ADBPlatform extends BasePlatform {
  private adbService: ADBService
  private initialized: boolean = false
  private intervalId: NodeJS.Timeout | null = null
  private adbPort: number = 8891

  public readonly id: PlatformIDs = PlatformIDs.ADB
  public readonly name: string = 'ADB'

  readonly identifier: Omit<ClientIdentifier, 'id' | 'active'> = {
    providerId: PlatformIDs.ADB,
    capabilities: [ProviderCapabilities.CONFIGURE, ProviderCapabilities.PING],
    connectionState: ConnectionState.Established
  }

  constructor() {
    super()
    this.adbService = new ADBService()
  }

  fetchClients = async (): Promise<Client[]> => {
    this.refreshClients()
    return this.clients
  }

  public handlePlatformEvent = async <T extends PlatformIPC>(data: T): Promise<T['data']> => {
    if (data.platform !== PlatformIDs.ADB) return undefined

    switch (data.type) {
      case 'get':
        switch (data.request) {
          case 'manifest': {
            const manifest = await this.adbService.getDeviceManifest(data.adbId)
            return manifest
          }
          case 'devices': {
            return this.clients
          }
          case 'wifi-status': {
            const wifiIp = await this.adbService.getDeviceWifiIp(data.adbId)
            return { connected: !!wifiIp, ip: wifiIp }
          }
          default:
            break
        }
        break
      case 'set': {
        switch (data.request) {
          case 'manifest': {
            const update = progressBus.start(
              ProgressChannel.PLATFORM_CHANNEL,
              `ADB: Starting ${data.type}:${data.request}`,
              `Handling ${data.request}`
            )
            await this.updateClientManifest(data.manifest)
            update('Completed Successfully', 100)
            break
          }
          case 'supervisor': {
            progressBus.startOperation(
              ProgressChannel.PLATFORM_CHANNEL,
              'Setting Supervisor',
              'Initializing Supervisor Request',
              [
                {
                  channel: ProgressChannel.ST_ADB_SUPERVISOR,
                  weight: 75
                },
                {
                  channel: ProgressChannel.REFRESH_DEVICES,
                  weight: 25
                }
              ]
            )
            await this.adbService.toggleSupervisorService(data.adbId, data.service, data.state)
            progressBus.update(ProgressChannel.PLATFORM_CHANNEL, 'Refreshing Client')
            await this.refreshClient(data.adbId, true)
            progressBus.complete(ProgressChannel.PLATFORM_CHANNEL, 'Completed Successfully')
            return true
          }
          case 'brightness': {
            progressBus.startOperation(
              ProgressChannel.PLATFORM_CHANNEL,
              'Setting Brightness',
              'Initializing Brightness Request',
              [
                {
                  channel: ProgressChannel.ADB,
                  weight: 50
                },
                {
                  channel: ProgressChannel.REFRESH_DEVICES,
                  weight: 50
                }
              ]
            )
            await this.adbService.setBrightness(data.adbId, data.brightness)
            await this.refreshClient(data.adbId, true)
            progressBus.complete(ProgressChannel.PLATFORM_CHANNEL, 'Completed Successfully')
            return true
          }
          case 'wifi': {
            progressBus.startOperation(
              ProgressChannel.PLATFORM_CHANNEL,
              'Setting up WiFi',
              'Initializing WiFi Configuration',
              [
                {
                  channel: ProgressChannel.PUSH_SCRIPT,
                  weight: 100
                }
              ]
            )
            try {
              const result = await this.adbService.runScript(SCRIPT_IDs.WIFI_SETUP, {
                deviceId: data.adbId,
                ssid: data.ssid,
                password: data.password,
                reboot: false
              })
              progressBus.complete(ProgressChannel.PLATFORM_CHANNEL, 'WiFi configured')
              return result
            } catch (error) {
              progressBus.error(
                ProgressChannel.PLATFORM_CHANNEL,
                'Error configuring WiFi',
                handleError(error)
              )
              return undefined
            }
          }
          default:
            break
        }
        break
      }
      case 'push':
        {
          switch (data.request) {
            case 'staged':
              progressBus.startOperation(
                ProgressChannel.PLATFORM_CHANNEL,
                'Push Staged Client',
                'Initializing push',
                [
                  {
                    channel: ProgressChannel.CONFIGURE_DEVICE,
                    weight: 100
                  }
                ]
              )
              try {
                await this.pushStagedClient(data.adbId, this.adbPort)
                progressBus.complete(ProgressChannel.PLATFORM_CHANNEL, 'Push complete')
              } catch (error) {
                progressBus.error(
                  ProgressChannel.PLATFORM_CHANNEL,
                  'Error pushing staged client',
                  handleError(error),
                  'ADB Error'
                )
              }
              return
            case 'script': {
              progressBus.startOperation(
                ProgressChannel.PLATFORM_CHANNEL,
                'Running Script',
                `Running ${data.scriptId}`,
                [
                  {
                    channel: ProgressChannel.PUSH_SCRIPT,
                    weight: 100
                  }
                ]
              )
              try {
                const result = await this.adbService.runScript(data.scriptId, {
                  deviceId: data.adbId,
                  force: data.force
                })
                progressBus.complete(
                  ProgressChannel.PLATFORM_CHANNEL,
                  `Script complete. Result: ${result}`
                )
                return result
              } catch (error) {
                progressBus.error(
                  ProgressChannel.PLATFORM_CHANNEL,
                  'Error running script',
                  handleError(error),
                  'Script Error'
                )
              }
            }
          }
        }
        break
      case 'refresh': {
        progressBus.startOperation(
          ProgressChannel.PLATFORM_CHANNEL,
          'Refreshing Devices',
          'Initializing refresh',
          [
            {
              channel: ProgressChannel.ST_ADB_REFRESH,
              weight: 100
            }
          ]
        )
        await this.refreshDevices()
        const clients = await this.getClients()
        progressBus.complete(ProgressChannel.PLATFORM_CHANNEL, 'Refresh complete')
        return clients
      }
      case 'run': {
        progressBus.startOperation(
          ProgressChannel.PLATFORM_CHANNEL,
          'Running ADB command',
          `Running ${data.command}`,
          [
            {
              channel: ProgressChannel.ADB,
              weight: 100
            }
          ]
        )

        const response = await this.adbService.sendCommand(data.command, data.adbId)

        progressBus.complete(
          ProgressChannel.PLATFORM_CHANNEL,
          `Got response ${response.substring(0, 15)}...`,
          'Successfully Ran Command'
        )
        return response
      }

      case 'configure': {
        progressBus.startOperation(
          ProgressChannel.PLATFORM_CHANNEL,
          `Configuring Device`,
          `Configuring ${data.adbId || 'unknown device'}`,
          [
            {
              channel: ProgressChannel.CONFIGURE_DEVICE,
              weight: 75
            },
            {
              channel: ProgressChannel.PUSH_SCRIPT,
              weight: 25
            }
          ]
        )

        try {
          await this.adbService.runScript(SCRIPT_IDs.RESTART, {
            deviceId: data.adbId,
            reboot: false
          })
          await this.adbService.configureDevice(data.adbId, this.adbPort)

          progressBus.complete(ProgressChannel.PLATFORM_CHANNEL, 'Completed Operation')
          return true
        } catch (error) {
          progressBus.error(
            ProgressChannel.PLATFORM_CHANNEL,
            'Error configuring device',
            handleError(error)
          )
          return false
        }
      }
    }

    return undefined
  }

  private async updateClientManifest(manifest: Partial<ClientManifest>): Promise<void> {
    const userDataPath = app.getPath('userData')
    const manifestPath = join(userDataPath, 'webapp', 'manifest.json')

    try {
      const existingManifest = await readFile(manifestPath, 'utf8')
      const parsedManifest = JSON.parse(existingManifest)
      const updatedManifest = { ...parsedManifest, ...manifest }
      await writeFile(manifestPath, JSON.stringify(updatedManifest), 'utf8')
    } catch (error) {
      logger.error('Error updating client manifest:', {
        function: 'updateClientManifest',
        source: 'adbPlatform',
        error: error as Error
      })
    }
  }

  async start(options: PlatformConnectionOptions): Promise<void> {
    if (this.isActive) return
    this.adbPort = options.port ?? this.adbPort
    this.isActive = true
    this.startTime = Date.now()
    await this.refreshDevices()

    if (!this.initialized) {
      await this.initialize()
    }
  }

  private async initialize(): Promise<void> {
    const settingStore = await storeProvider.getStore('settingsStore')
    const autoDetectADB = await settingStore.getSetting('adb_autoDetect')

    this.restartInterval(autoDetectADB)

    settingStore.on('adb_autoDetect', (autoDetect) => {
      this.restartInterval(autoDetect)
    })
  }

  private restartInterval(autoDetect?: boolean): void {
    if (this.intervalId) {
      clearInterval(this.intervalId)
    }

    logger.debug(`Auto detect is ${autoDetect}`, {
      source: 'ADBPlatform',
      function: 'restartInterval'
    })

    if (!autoDetect) {
      this.intervalId = null
      return
    }

    this.intervalId = setInterval(async () => {
      const devices = await this.adbService.getDevices()
      logger.debug(`Autodetected Devices: ${devices}`, {
        source: 'ADBPlatform',
        function: 'restartInterval'
      })

      // Checking if there are any new devices

      if (devices.length > this.clients.length) {
        logger.debug(`New devices detected: ${devices.length - this.clients.length}`, {
          source: 'ADBPlatform',
          function: 'restartInterval'
        })
        await this.refreshDevices()
      }
    }, 30000)
  }

  private async refreshDevices(): Promise<void> {
    try {
      progressBus.startOperation(
        ProgressChannel.ST_ADB_REFRESH,
        'Refreshing Devices',
        'Initializing refresh',
        [
          {
            channel: ProgressChannel.REFRESH_DEVICES,
            weight: 75
          },
          {
            channel: ProgressChannel.BLANK,
            weight: 25
          }
        ]
      )
      const update = progressBus.start(ProgressChannel.BLANK, 'Refresh Devices', 'getting devices')

      const adbDevices = await this.adbService.getDevices()
      update(`Found ${adbDevices.length} devices`, 30)

      update('Cleaning up old devices', 60)

      // Mark clients not found in ADB as disconnected
      this.clients.forEach((client) => {
        if (!adbDevices.includes(client.identifiers[this.id]?.id || '')) {
          this.emit(PlatformEvent.CLIENT_DISCONNECTED, client)
        }
      })

      // Get the list of new ADB IDs
      const newAdbIDs = adbDevices.filter((adb) => {
        return !this.clients.find((client) => client.identifiers[this.id]?.id === adb)
      })

      // Open the ports one at a time
      for (const adbId of newAdbIDs) {
        logger.debug(`Opening port for ${adbId}`, { source: 'ADBPlatform', function: 'refreshDevices' })
        await this.adbService.openPort(adbId, this.adbPort)
      }

      const progressMultiplier = 1 / adbDevices.length

      for (const adbDevice of adbDevices) {
        await this.refreshClient(adbDevice, false, false, progressMultiplier)
      }

      // ensure the local list of clients is up to date
      this.clients = this.clients.filter((client) => {
        return adbDevices.find((adb) => adb === client.identifiers[this.id]?.id)
      })

      this.emit(PlatformEvent.CLIENT_LIST, this.clients)
      progressBus.complete(ProgressChannel.ST_ADB_REFRESH, 'Refresh complete')
    } catch (error) {
      progressBus.error(ProgressChannel.ST_ADB_REFRESH, 'Refresh failed', 'Refresh failed')
      logger.error(`Failed to refresh devices`, {
        error: error as Error,
        function: 'refreshDevices',
        source: 'adbPlatform'
      })
    }
  }

  /**
   * Fetches all relevant device data from ADB in one pass.
   */
  private async fetchDeviceData(adbId: string): Promise<ADBDeviceData> {
    const deviceVersion = await this.adbService.getDeviceVersion(adbId)
    const usid = await this.adbService.getDeviceUSID(adbId)
    const macBt = await this.adbService.getDeviceMacBT(adbId)
    const brightness = await this.adbService.getDeviceBrightness(adbId)
    const rawServices = await this.adbService.getSupervisorStatus(adbId)
    const wifiIp = await this.adbService.getDeviceWifiIp(adbId)

    const services: Record<string, boolean> = Object.entries(rawServices).reduce(
      (acc, [key, val]) => ({ ...acc, [key]: val === 'RUNNING' }),
      {}
    )

    return { deviceVersion, usid, macBt, brightness, services, wifiIp }
  }

  /**
   * Builds the ADB-specific meta and identifiers for a client.
   */
  private buildClientFields(
    adbId: string,
    data: ADBDeviceData
  ): Pick<Client, 'meta' | 'identifiers' | 'connected' | 'connectionState'> {
    return {
      connected: false,
      connectionState: ConnectionState.Established,
      meta: {
        [this.id]: {
          adbId,
          device_version: data.deviceVersion,
          usid: data.usid,
          offline: false,
          brightness: data.brightness,
          mac_bt: data.macBt,
          services: data.services,
          wifi_ip: data.wifiIp
        }
      },
      identifiers: {
        [this.id]: {
          id: adbId,
          active: true,
          providerId: this.id,
          capabilities: this.identifier.capabilities,
          connectionState: ConnectionState.Established
        }
      }
    }
  }

  /**
   * Attempts to fetch the device manifest, returning undefined on failure.
   */
  private async tryFetchManifest(adbId: string): Promise<ClientManifest | undefined> {
    try {
      const manifest = await this.adbService.getDeviceManifest(adbId)
      return manifest || undefined
    } catch (error) {
      logger.warn(`Failed to get manifest for device ${adbId}`, {
        error: error as Error,
        function: 'tryFetchManifest',
        source: 'adbPlatform'
      })
      return undefined
    }
  }

  async refreshClient(
    adbId: string,
    forceRefresh = false,
    notify = true,
    progressMultiplier = 1
  ): Promise<Client | undefined> {
    const existingClient = this.clients.find((client) => client.identifiers[this.id]?.id === adbId)

    progressBus.start(ProgressChannel.REFRESH_DEVICES, `Refreshing ${adbId}`, `Refreshing ${adbId}`)

    let totalProgress = 0
    const update = (message: string, progress: number): void => {
      const progressDelta = progress - totalProgress
      const updatedProgress = progressDelta * progressMultiplier
      totalProgress = progress
      progressBus.incrementProgress(ProgressChannel.REFRESH_DEVICES, message, updatedProgress)
    }

    try {
      update('Fetching device data', 25)
      const deviceData = await this.fetchDeviceData(adbId)
      update('Building client', 65)
      const fields = this.buildClientFields(adbId, deviceData)

      if (existingClient && !forceRefresh) {
        const updates: Client = {
          ...existingClient,
          ...fields,
          timestamp: Date.now()
        }

        if (!existingClient.manifest) {
          update(`Getting manifest for ${adbId}`, 70)
          updates.manifest = await this.tryFetchManifest(adbId)
        }

        if (notify) {
          this.emit(PlatformEvent.CLIENT_UPDATED, updates)
        }
        update(`Finished updating ${adbId}`, 100)
        return updates
      } else {
        // first remove the client if it exists (i.e. if it is a forced refresh)
        this.clients = this.clients.filter((client) => client.identifiers[this.id]?.id === adbId)
        const newClient: Client = {
          clientId: adbId,
          ...fields,
          timestamp: Date.now()
        }

        update(`Getting manifest for ${adbId}`, 70)
        newClient.manifest = await this.tryFetchManifest(adbId)

        this.clients.push(newClient)
        if (notify) {
          this.emit(PlatformEvent.CLIENT_CONNECTED, newClient)
        }
        update(`Finished updating ${adbId}`, 100)
        return newClient
      }
    } catch (error) {
      logger.error(`Error refreshing devices: ${error}`, {
        function: 'refreshDevices',
        source: 'adbPlatform'
      })
      update(`Error updating ${adbId}. ${handleError(error)}`, 100)
      return
    }
  }
  private pushStagedClient(clientId: string, port: number): Promise<void> {
    return this.adbService.configureDevice(clientId, port, true)
  }

  async stop(): Promise<void> {
    if (!this.isActive) return
    this.isActive = false
    this.clients = []
  }

  async refreshClients(progressMultiplier: number = 1): Promise<boolean> {
    progressBus.startOperation(
      ProgressChannel.REFRESH_CLIENTS,
      'Refreshing ADB',
      'Refreshing ADB',
      [
        {
          channel: ProgressChannel.ST_ADB_REFRESH,
          weight: 100 * progressMultiplier
        },
        {
          channel: ProgressChannel.BLANK, // this is to set the transform on the sub operations
          weight: 100 * (1 - progressMultiplier)
        }
      ]
    )

    await this.refreshDevices()
    progressBus.complete(ProgressChannel.ST_ADB_REFRESH, 'Refreshed ADB Devices')
    progressBus.update(ProgressChannel.REFRESH_CLIENTS, 'Refreshed Devices')
    return true
  }

  async sendData(
    clientId: string,
    _data: DeskThingToDeviceCore & { app?: string }
  ): Promise<boolean> {
    const internalId = this.getInternalId(clientId)
    logger.warn('Unable to send data via ADB! Failed.', { source: 'ADBPlatform', function: 'sendData' })
    if (!internalId) return false
    return false
  }

  async broadcastData(_data: DeskThingToDeviceCore & { app?: string }): Promise<void> {
    return
  }
}
