import React, { useState } from 'react'
import {
  IconBluetooth,
  IconLoading,
  IconRefresh,
  IconWifi,
  IconWifiDisconnect,
  IconDisconnect,
  IconTrash
} from '@renderer/assets/icons'
import Button from '@renderer/components/Button'
import usePlatformStore from '@renderer/stores/platformStore'
import { useSettingsStore } from '@renderer/stores'
import { BluetoothDeviceInfo } from '@shared/types/ipc/ipcPlatform'
import QRCode from 'react-qr-code'

const ConnectivitySettings: React.FC = () => {
  const settings = useSettingsStore((s) => s.settings)

  const btScan = usePlatformStore((s) => s.btScan)
  const btGetStatus = usePlatformStore((s) => s.btGetStatus)
  const btPair = usePlatformStore((s) => s.btPair)
  const btConnect = usePlatformStore((s) => s.btConnect)
  const btDisconnect = usePlatformStore((s) => s.btDisconnect)
  const btRemove = usePlatformStore((s) => s.btRemove)

  // Bluetooth state
  const [devices, setDevices] = useState<BluetoothDeviceInfo[]>([])
  const [scanning, setScanning] = useState(false)
  const [btAvailable, setBtAvailable] = useState<boolean | null>(null)
  const [actionDevice, setActionDevice] = useState<string | null>(null)

  // WiFi state
  const [selectedIpIndex, setSelectedIpIndex] = useState(
    settings.server_localIp.length > 1 ? 1 : 0
  )

  const wifiAddress =
    (settings.server_localIp[selectedIpIndex] || settings.server_localIp[0]) +
    ':' +
    settings.device_devicePort

  // Bluetooth handlers
  const handleScan = async (): Promise<void> => {
    setScanning(true)
    const status = await btGetStatus()
    if (status && !status.available) {
      setBtAvailable(false)
      setScanning(false)
      return
    }
    setBtAvailable(true)
    const found = await btScan(10000)
    if (found) setDevices(found)
    setScanning(false)
  }

  const handlePairAndConnect = async (address: string): Promise<void> => {
    setActionDevice(address)
    const paired = await btPair(address)
    if (paired) {
      await btConnect(address)
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

  const handleDisconnect = async (address: string): Promise<void> => {
    setActionDevice(address)
    await btDisconnect(address)
    const found = await btScan(3000)
    if (found) setDevices(found)
    setActionDevice(null)
  }

  const handleRemove = async (address: string): Promise<void> => {
    setActionDevice(address)
    await btRemove(address)
    setDevices((prev) => prev.filter((d) => d.address !== address))
    setActionDevice(null)
  }

  return (
    <div className="absolute inset w-full h-full p-4 flex flex-col overflow-y-auto gap-6">
      {/* Bluetooth Section */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <IconBluetooth className="text-blue-400" />
          <h2 className="text-xl font-semibold">Bluetooth</h2>
        </div>

        <div className="flex items-center gap-4 mb-4">
          <Button
            className="bg-zinc-800 hover:bg-zinc-700 gap-2 rounded-lg p-3"
            onClick={handleScan}
            disabled={scanning}
          >
            {scanning ? <IconLoading className="animate-spin" /> : <IconRefresh />}
            <p>{scanning ? 'Scanning...' : 'Scan for Devices'}</p>
          </Button>
          {btAvailable === false && (
            <p className="text-red-400 text-sm">
              Bluetooth is not available on this system. On Linux, make sure bluetoothctl is
              installed. On macOS, ensure Bluetooth is enabled in System Preferences.
            </p>
          )}
        </div>

        {devices.length > 0 ? (
          <div className="space-y-2">
            {devices.map((device) => (
              <div
                key={device.address}
                className="flex items-center justify-between bg-zinc-800 p-3 rounded-lg border border-zinc-700"
              >
                <div className="flex items-center gap-3">
                  <IconBluetooth
                    className={device.connected ? 'text-blue-400' : 'text-zinc-500'}
                  />
                  <div>
                    <p className="text-white font-medium">{device.name || 'Unknown Device'}</p>
                    <p className="text-zinc-400 text-sm font-geistMono">{device.address}</p>
                  </div>
                  <div className="flex gap-2 ml-2">
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
                <div className="flex gap-2">
                  {device.connected ? (
                    <Button
                      className="bg-zinc-700 hover:bg-red-600 gap-2 rounded-lg px-3 py-1.5"
                      onClick={() => handleDisconnect(device.address)}
                      disabled={actionDevice === device.address}
                    >
                      {actionDevice === device.address ? (
                        <IconLoading className="animate-spin" iconSize={16} />
                      ) : (
                        <IconDisconnect iconSize={16} />
                      )}
                      <p className="text-sm">Disconnect</p>
                    </Button>
                  ) : device.paired ? (
                    <>
                      <Button
                        className="bg-zinc-700 hover:bg-zinc-600 gap-2 rounded-lg px-3 py-1.5"
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
                      <Button
                        className="bg-zinc-700 hover:bg-red-600 gap-2 rounded-lg px-3 py-1.5"
                        onClick={() => handleRemove(device.address)}
                        disabled={actionDevice === device.address}
                        title="Remove pairing"
                      >
                        <IconTrash iconSize={16} />
                      </Button>
                    </>
                  ) : (
                    <Button
                      className="bg-blue-600 hover:bg-blue-500 gap-2 rounded-lg px-3 py-1.5"
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
        ) : (
          !scanning &&
          btAvailable !== false && (
            <div className="flex items-center justify-center py-8 text-zinc-500">
              <div className="text-center">
                <IconBluetooth iconSize={48} className="mx-auto mb-3 opacity-30" />
                <p>No devices found</p>
                <p className="text-sm mt-1">Click &quot;Scan for Devices&quot; to discover nearby Bluetooth devices</p>
              </div>
            </div>
          )
        )}
      </div>

      {/* Divider */}
      <div className="border-t border-zinc-700" />

      {/* WiFi Section */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <IconWifi className="text-green-400" />
          <h2 className="text-xl font-semibold">WiFi</h2>
        </div>

        <div className="flex flex-col md:flex-row gap-6 items-start">
          {/* IP Selection */}
          <div className="flex flex-col gap-3">
            <p className="text-zinc-400 text-sm">Server addresses available on your network:</p>
            {settings.server_localIp.length > 0 ? (
              <div className="flex flex-col gap-2">
                {settings.server_localIp.map((ip, index) => (
                  <Button
                    key={index}
                    className={`${
                      selectedIpIndex === index
                        ? 'font-semibold bg-zinc-800 border border-green-600'
                        : 'bg-zinc-900 border border-zinc-700'
                    } font-geistMono text-white hover:bg-zinc-700 px-4 py-2`}
                    onClick={() => setSelectedIpIndex(index)}
                  >
                    <p>{ip + ':' + settings.device_devicePort}</p>
                  </Button>
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-2 text-red-400">
                <IconWifiDisconnect />
                <p>No network interfaces found</p>
              </div>
            )}
          </div>

          {/* QR Code */}
          {settings.server_localIp.length > 0 && (
            <div className="flex flex-col items-center gap-3">
              <p className="text-zinc-400 text-sm">Scan to connect from a device:</p>
              <div className="bg-white p-3 rounded-lg">
                <QRCode value={`http://${wifiAddress}`} size={160} />
              </div>
              <p className="text-zinc-400 font-geistMono text-sm">
                <a
                  href={`http://${wifiAddress}`}
                  target="_blank"
                  className="underline hover:text-white"
                  rel="noreferrer"
                >
                  {wifiAddress}
                </a>
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default ConnectivitySettings
