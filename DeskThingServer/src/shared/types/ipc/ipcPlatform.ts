import { PlatformIDs, Client, ClientManifest } from '@deskthing/types'
import { SCRIPT_IDs } from '../adb'

export type WebsocketPlatformIPC = {
  platform: PlatformIDs.WEBSOCKET
} & (
  | {
      type: 'ping'
      request?: string
      clientId: string
      data?: { server?: number; socket?: number }
    }
  | {
      type: 'pong'
      request?: string
      clientId: string
      data?: string
    }
  | {
      type: 'disconnect'
      request?: string
      clientId: string
      data?: boolean
    }
  | {
      type: 'restart'
      request?: string
      data?: undefined
    }
)

export type ADBPlatformIPC = {
  platform: PlatformIDs.ADB
} & (
  | {
      type: 'get'
      request: 'manifest'
      adbId: string
      data?: ClientManifest | null
    }
  | {
      type: 'get'
      request: 'devices'
      data?: Client[]
    }
  | {
      type: 'set'
      request: 'manifest'
      manifest: Partial<ClientManifest>
      adbId: string
      data?: undefined
    }
  | {
      type: 'set'
      request: 'supervisor'
      service: string
      adbId: string
      state: boolean
      data?: boolean
    }
  | {
      type: 'set'
      request: 'brightness'
      brightness: number
      adbId: string
      data?: boolean
    }
  | {
      type: 'push'
      request: 'staged'
      adbId: string
      data?: boolean
    }
  | {
      type: 'configure'
      request: 'client'
      adbId: string
      data?: boolean
    }
  | {
      type: 'push'
      request: 'script'
      scriptId: SCRIPT_IDs
      adbId: string
      force?: boolean
      data?: string
    }
  | {
      type: 'run'
      request: 'command'
      command: string
      adbId: string
      data?: string
    }
  | {
      type: 'set'
      request: 'wifi'
      adbId: string
      ssid: string
      password?: string
      data?: string
    }
  | {
      type: 'get'
      request: 'wifi-status'
      adbId: string
      data?: { connected: boolean; ip?: string }
    }
  | {
      type: 'refresh'
      request: 'adb'
      data?: Client[]
    }
)

export type BluetoothPlatformIPC = {
  platform: PlatformIDs.BLUETOOTH
} & (
  | {
      type: 'scan'
      duration?: number
      data?: BluetoothDeviceInfo[]
    }
  | {
      type: 'get'
      request: 'devices'
      data?: BluetoothDeviceInfo[]
    }
  | {
      type: 'get'
      request: 'status'
      data?: { available: boolean; scanning: boolean }
    }
  | {
      type: 'pair'
      address: string
      data?: boolean
    }
  | {
      type: 'connect'
      address: string
      data?: boolean
    }
  | {
      type: 'disconnect'
      address: string
      data?: boolean
    }
  | {
      type: 'remove'
      address: string
      data?: boolean
    }
  | {
      type: 'refresh'
      request: 'bluetooth'
      data?: Client[]
    }
)

export interface BluetoothDeviceInfo {
  address: string
  name: string
  paired: boolean
  connected: boolean
  trusted: boolean
}

export type MainProcessIPC = {
  platform: PlatformIDs.MAIN
} & (
  | {
      type: 'refresh-clients'
      request?: undefined
      data?: Client[]
    }
  | {
      type: 'initial-data'
      request?: string // the id of the client
      data?: undefined
    }
)

type BasePlatformIPC = {
  channel?: string
}

export type PlatformIPC = BasePlatformIPC &
  (WebsocketPlatformIPC | ADBPlatformIPC | BluetoothPlatformIPC | MainProcessIPC)

export type ExtractPayloadFromIPC<T extends PlatformIPC> = Extract<
  PlatformIPC,
  { type: T['type']; request?: T['request']; platform: T['platform'] }
>['data']
