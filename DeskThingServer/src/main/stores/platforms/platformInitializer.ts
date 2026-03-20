import Logger from '@server/utils/logger'
import { storeProvider } from '@server/stores/storeProvider'
import { WebSocketPlatform } from './websocket/wsPlatform'
import { ADBPlatform } from './superbird/adbPlatform'
import { BluetoothPlatform } from './bluetooth/bluetoothPlatform'

export async function initializePlatforms(): Promise<void> {
  try {
    const platformStore = await storeProvider.getStore('platformStore')

    // Initialize platforms
    const wsPlatform = new WebSocketPlatform()
    const adbPlatform = new ADBPlatform()
    const btPlatform = new BluetoothPlatform()
    await platformStore.registerPlatform(wsPlatform)
    await platformStore.registerPlatform(adbPlatform)
    await platformStore.registerPlatform(btPlatform)

    // Start the ws platform
    await platformStore.startPlatform(wsPlatform.id, {
      port: 8891,
      address: '0.0.0.0'
    })

    await platformStore.startPlatform(adbPlatform.id, {
      autoDetect: true
    })

    await platformStore.startPlatform(btPlatform.id, {})

    Logger.debug('Platforms initialized successfully', {
      source: 'platformInitializer',
      function: 'initializePlatforms'
    })
  } catch (error) {
    Logger.error('Failed to initialize platforms', {
      source: 'platformInitializer',
      function: 'initializePlatforms',
      error: error instanceof Error ? error : new Error(String(error))
    })
  }
}
