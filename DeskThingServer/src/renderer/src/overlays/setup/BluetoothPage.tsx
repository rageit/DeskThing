import React, { useState } from 'react'
import {
  IconBluetooth,
  IconLoading,
  IconRefresh
} from '@renderer/assets/icons'
import Button from '@renderer/components/Button'
import usePlatformStore from '@renderer/stores/platformStore'
import { BluetoothDeviceInfo } from '@shared/types/ipc/ipcPlatform'

const BluetoothPage: React.FC = () => {
  const btScan = usePlatformStore((state) => state.btScan)
  const btGetStatus = usePlatformStore((state) => state.btGetStatus)
  const btPair = usePlatformStore((state) => state.btPair)
  const btConnect = usePlatformStore((state) => state.btConnect)

  const [devices, setDevices] = useState<BluetoothDeviceInfo[]>([])
  const [scanning, setScanning] = useState(false)
  const [available, setAvailable] = useState<boolean | null>(null)
  const [actionDevice, setActionDevice] = useState<string | null>(null)

  const handleScan = async (): Promise<void> => {
    setScanning(true)
    const status = await btGetStatus()
    if (status && !status.available) {
      setAvailable(false)
      setScanning(false)
      return
    }
    setAvailable(true)

    const found = await btScan(10000)
    if (found) {
      setDevices(found)
    }
    setScanning(false)
  }

  const handlePairAndConnect = async (address: string): Promise<void> => {
    setActionDevice(address)
    const paired = await btPair(address)
    if (paired) {
      await btConnect(address)
      // Refresh the list
      const found = await btScan(3000)
      if (found) setDevices(found)
    }
    setActionDevice(null)
  }

  const handleConnect = async (address: string): Promise<void> => {
    setActionDevice(address)
    await btConnect(address)
    const found = await btScan(3000)
    if (found) setDevices(found)
    setActionDevice(null)
  }

  return (
    <div className="w-full h-full p-8 flex flex-col overflow-y-auto">
      <h1 className="text-3xl font-bold mb-6 text-white">Bluetooth Settings</h1>
      <div className="w-full flex-col flex h-full space-y-6">
        <div className="flex items-center gap-4">
          <Button
            className="bg-zinc-800 hover:bg-zinc-700 transition-colors duration-200 gap-2 rounded-lg p-3"
            onClick={handleScan}
            disabled={scanning}
          >
            {scanning ? (
              <IconLoading className="animate-spin" />
            ) : (
              <IconRefresh />
            )}
            <p>{scanning ? 'Scanning...' : 'Scan for Devices'}</p>
          </Button>
          {available === false && (
            <p className="text-red-400 text-sm">
              Bluetooth is not available on this system. Make sure bluetoothctl is installed.
            </p>
          )}
        </div>

        {devices.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-xl font-semibold text-white">Discovered Devices</h2>
            {devices.map((device) => (
              <div
                key={device.address}
                className="flex items-center justify-between bg-zinc-800 p-4 rounded-lg border border-zinc-700"
              >
                <div className="flex items-center gap-3">
                  <IconBluetooth
                    className={device.connected ? 'text-blue-400' : 'text-zinc-500'}
                  />
                  <div>
                    <p className="text-white font-medium">{device.name || 'Unknown Device'}</p>
                    <p className="text-zinc-400 text-sm font-geistMono">{device.address}</p>
                  </div>
                  <div className="flex gap-2 ml-4">
                    {device.paired && (
                      <span className="text-xs bg-zinc-700 text-zinc-300 px-2 py-0.5 rounded">
                        Paired
                      </span>
                    )}
                    {device.connected && (
                      <span className="text-xs bg-green-900 text-green-300 px-2 py-0.5 rounded">
                        Connected
                      </span>
                    )}
                    {device.trusted && (
                      <span className="text-xs bg-zinc-700 text-zinc-300 px-2 py-0.5 rounded">
                        Trusted
                      </span>
                    )}
                  </div>
                </div>
                <div>
                  {device.connected ? (
                    <span className="text-green-400 text-sm">Connected</span>
                  ) : device.paired ? (
                    <Button
                      className="bg-zinc-700 hover:bg-zinc-600 transition-colors duration-200 gap-2 rounded-lg px-3 py-1.5"
                      onClick={() => handleConnect(device.address)}
                      disabled={actionDevice === device.address}
                    >
                      {actionDevice === device.address ? (
                        <IconLoading className="animate-spin" iconSize={16} />
                      ) : (
                        <IconBluetooth iconSize={16} />
                      )}
                      <p className="text-sm">Connect</p>
                    </Button>
                  ) : (
                    <Button
                      className="bg-blue-600 hover:bg-blue-500 transition-colors duration-200 gap-2 rounded-lg px-3 py-1.5"
                      onClick={() => handlePairAndConnect(device.address)}
                      disabled={actionDevice === device.address}
                    >
                      {actionDevice === device.address ? (
                        <IconLoading className="animate-spin" iconSize={16} />
                      ) : (
                        <IconBluetooth iconSize={16} />
                      )}
                      <p className="text-sm">Pair</p>
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {devices.length === 0 && !scanning && available !== false && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center text-zinc-500">
              <IconBluetooth iconSize={64} className="mx-auto mb-4 opacity-30" />
              <p className="text-lg">No devices found</p>
              <p className="text-sm mt-2">Click "Scan for Devices" to discover nearby Bluetooth devices</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default BluetoothPage
