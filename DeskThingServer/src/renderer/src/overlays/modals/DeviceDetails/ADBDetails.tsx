import {
  IconDisconnect,
  IconLoading,
  IconPause,
  IconPlay,
  IconPower,
  IconRefresh,
  IconReload,
  IconStop,
  IconUpload,
  IconWifi,
  IconWifiDisconnect,
  IconWrench,
  IconX
} from '@renderer/assets/icons'
import Button from '@renderer/components/Button'
import ActionButton from '@renderer/components/ActionButton'
import React, { useState, useRef, useMemo } from 'react'
import { Client } from '@deskthing/types'
import usePlatformStore from '@renderer/stores/platformStore'
import { useSettingsStore } from '@renderer/stores'
import { ProgressChannel, SCRIPT_IDs } from '@shared/types'
import { LogEntry } from '@renderer/components/LogEntry'
import { useChannelProgress } from '@renderer/hooks/useProgress'
import { useAnimatedAction } from '@renderer/hooks/useAnimatedAction'

interface ClientDetailsOverlayProps {
  client: Client
}

const ADBDeviceDetails: React.FC<ClientDetailsOverlayProps> = ({ client }) => {
  const port = useSettingsStore((settings) => settings.settings.device_devicePort)
  const sendCommand = usePlatformStore((state) => state.runCommand)
  const modifyBrightness = usePlatformStore((state) => state.setBrightness)
  const setServiceStatus = usePlatformStore((state) => state.setServiceStatus)
  const pushStaged = usePlatformStore((state) => state.pushStaged)
  const pushScript = usePlatformStore((state) => state.pushScript)
  const setupWifi = usePlatformStore((state) => state.setupWifi)
  const getWifiStatus = usePlatformStore((state) => state.getWifiStatus)
  const progress = useChannelProgress(ProgressChannel.IPC_PLATFORM)
  const initialSettings = useSettingsStore((settings) => settings.settings)
  const saveSettings = useSettingsStore((settings) => settings.saveSettings)
  const is_nerd = useSettingsStore((state) => state.settings?.flag_nerd || false)

  // ADB commands
  const [command, setCommand] = useState('')
  const [response, setResponse] = useState('')

  // WiFi state
  const [wifiSsid, setWifiSsid] = useState('')
  const [wifiPassword, setWifiPassword] = useState('')
  const [wifiStatus, setWifiStatus] = useState<{ connected: boolean; ip?: string } | null>(null)

  // State Management
  const [loading, setLoading] = useState(false)
  const { animating, withAnimation } = useAnimatedAction()
  const [brightness, setBrightness] = useState(client.meta?.adb?.brightness || 50)
  const debounceTimeout = useRef<NodeJS.Timeout | null>(null)

  const adbId = useMemo(() => {
    if (client.meta.adb) {
      return client.meta.adb?.adbId
    } else {
      return undefined
    }
  }, [client.manifest?.context.method])

  const handleBrightnessChange = (value: number): void => {
    setBrightness(value)

    if (debounceTimeout.current) {
      clearTimeout(debounceTimeout.current)
    }

    debounceTimeout.current = setTimeout(async () => {
      try {
        if (adbId) {
          if (client.meta.adb?.services?.backlight) {
            handleToggleSupervisor('backlight', false)
          }
          await modifyBrightness(adbId, value)
        }
      } catch (error) {
        console.error('Error setting brightness:', error)
      }
    }, 300)
  }

  const handleToggleSupervisor = async (key: string, value: boolean): Promise<void> => {
    await withAnimation(key, async () => {
      await setServiceStatus(adbId!, key, value)
    })
  }

  const handleSetupWifi = async (): Promise<void> => {
    if (!adbId || !wifiSsid.trim()) return

    await withAnimation('wifi', async () => {
      await setupWifi(adbId, wifiSsid.trim(), wifiPassword || undefined)
      const status = await getWifiStatus(adbId)
      if (status) setWifiStatus(status)
    })
  }

  const handleCheckWifiStatus = async (): Promise<void> => {
    if (!adbId) return
    await withAnimation('wifiCheck', async () => {
      const status = await getWifiStatus(adbId)
      if (status) setWifiStatus(status)
    })
  }

  const handleAddToSettings = async (): Promise<void> => {
    if (!adbId) return

    setLoading(true)
    const currentBlacklist = initialSettings.adb_blacklist || []
    if (!currentBlacklist.includes(adbId)) {
      const updatedBlacklist = [...currentBlacklist, adbId]
      await saveSettings({ ...initialSettings, adb_blacklist: updatedBlacklist })
      console.log('ADB ID added to blacklist:', adbId)
    } else {
      const updatedBlacklist = currentBlacklist.filter((id) => id !== adbId)
      await saveSettings({ ...initialSettings, adb_blacklist: updatedBlacklist })
      console.warn('ADB ID removed from blacklist:', adbId)
    }
    setLoading(false)
  }

  return (
    <div className="h-full p-4 overflow-y-auto bg-zinc-950">
      {client.identifiers.adb && (
        <div className="space-y-6">
          <div className="flex flex-wrap justify-between gap-4">
            <ActionButton
              title="Set Device Client to Staged Client"
              label="Push Staged"
              icon={<IconUpload className="flex-shrink-0" />}
              onClick={async () => {
                if (!adbId) return
                setLoading(true)
                try { await pushStaged(adbId) } catch (e) { console.log(e) } finally { setLoading(false) }
              }}
              isAnimating={loading}
              disabled={loading}
            />
            <ActionButton
              title="Restart Client's Chromium"
              label="Reload Chromium"
              icon={<IconRefresh className="flex-shrink-0" />}
              onClick={() => withAnimation('chromium', async () => {
                if (!adbId) return
                await sendCommand(adbId, `shell supervisorctl restart chromium`)
                await new Promise((r) => setTimeout(r, 1000))
              })}
              isAnimating={animating.chromium}
              animationStyle="rotate"
              disabled={loading}
            />
            <ActionButton
              title="Setup ADB Port for Device"
              label="Setup Port"
              icon={<IconDisconnect className="flex-shrink-0" />}
              onClick={async () => {
                if (!adbId) return
                await sendCommand(adbId, `reverse tcp:${port} tcp:${port}`)
              }}
              disabled={loading}
            />
            <ActionButton
              title="Restart the Client"
              label="Restart"
              icon={<IconReload className="flex-shrink-0" />}
              onClick={() => withAnimation('restart', async () => {
                if (!adbId) return
                await sendCommand(adbId, 'shell reboot')
              })}
              isAnimating={animating.restart}
              animationStyle="rotate"
              danger
              disabled={loading}
            />
            <ActionButton
              title="Shutdown the Client"
              label="Power Off"
              icon={<IconPower className="flex-shrink-0" />}
              onClick={async () => {
                if (!adbId) return
                await sendCommand(adbId, 'shell poweroff')
              }}
              isAnimating={loading}
              danger
              disabled={loading}
            />
            <ActionButton
              title="Run Restart Script"
              label="Setup Restart Script"
              icon={<IconWrench className="flex-shrink-0" />}
              onClick={() => withAnimation('restart_script', async () => {
                if (!adbId) return
                setLoading(true)
                try {
                  await pushScript(adbId, SCRIPT_IDs.RESTART)
                } finally {
                  setLoading(false)
                }
              })}
              isAnimating={loading}
              disabled={loading}
            />
            {is_nerd && (
              <Button
                title="Add this device to the blacklist"
                className="bg-zinc-900 hover:bg-zinc-800 transition-colors duration-200 gap-2 rounded-lg p-3"
                onClick={handleAddToSettings}
                disabled={loading}
              >
                {initialSettings.adb_blacklist?.includes(adbId!) ? (
                  <>
                    {loading ? (
                      <IconLoading className="animate-spin-smooth flex-shrink-0" />
                    ) : (
                      <IconX className="flex-shrink-0" />
                    )}
                    <p className="sm:block text-ellipsis hidden text-nowrap">
                      Remove From BlackList
                    </p>
                  </>
                ) : (
                  <>
                    {loading ? (
                      <IconLoading className="animate-spin-smooth flex-shrink-0" />
                    ) : (
                      <IconStop className="flex-shrink-0" />
                    )}
                    <p className="sm:block text-ellipsis hidden text-nowrap">Add to BlackList</p>
                  </>
                )}
              </Button>
            )}
          </div>

          {progress.progress && (
            <div className="w-full">
              <LogEntry className="w-full" progressEvent={progress.progress} />
            </div>
          )}

          <div className="bg-zinc-900 p-4 rounded-lg">
            <p className="text-sm font-geistMono text-zinc-400 mb-2">Brightness</p>
            <input
              id="brightness-slider"
              type="range"
              min="0"
              max="100"
              value={brightness}
              onChange={(e) => handleBrightnessChange(Number(e.target.value))}
              className="w-full h-2 bg-zinc-800 rounded-lg accent-white appearance-none cursor-pointer"
            />
            <p className="text-sm font-geistMono text-zinc-500 mt-2">{brightness}%</p>
          </div>

          <div className="bg-zinc-900 p-4 rounded-lg">
            <p className="text-sm font-geistMono text-zinc-400 mb-3">WiFi Configuration</p>
            <div className="flex items-center gap-2 mb-3">
              {client.meta.adb?.wifi_ip ? (
                <div className="flex items-center gap-2 text-green-400">
                  <IconWifi iconSize={20} />
                  <span className="text-sm font-geistMono">Connected: {client.meta.adb.wifi_ip}</span>
                </div>
              ) : wifiStatus?.connected ? (
                <div className="flex items-center gap-2 text-green-400">
                  <IconWifi iconSize={20} />
                  <span className="text-sm font-geistMono">Connected: {wifiStatus.ip}</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-zinc-500">
                  <IconWifiDisconnect iconSize={20} />
                  <span className="text-sm font-geistMono">Not connected</span>
                </div>
              )}
              <Button
                title="Check WiFi Status"
                className="bg-zinc-800 hover:bg-zinc-700 transition-colors duration-200 p-1.5 rounded-lg ml-auto"
                onClick={handleCheckWifiStatus}
                disabled={animating.wifiCheck}
              >
                {animating.wifiCheck ? (
                  <IconLoading className="animate-spin" iconSize={16} />
                ) : (
                  <IconRefresh iconSize={16} />
                )}
              </Button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                handleSetupWifi()
              }}
              className="space-y-2"
            >
              <input
                type="text"
                placeholder="WiFi Network Name (SSID)"
                value={wifiSsid}
                onChange={(e) => setWifiSsid(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-800 rounded-lg text-white border border-zinc-700 focus:outline-none focus:border-zinc-500 transition-colors duration-200 text-sm"
              />
              <input
                type="password"
                placeholder="WiFi Password (leave empty for open network)"
                value={wifiPassword}
                onChange={(e) => setWifiPassword(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-800 rounded-lg text-white border border-zinc-700 focus:outline-none focus:border-zinc-500 transition-colors duration-200 text-sm"
              />
              <Button
                title="Configure WiFi on Device"
                className="bg-zinc-800 hover:bg-zinc-700 transition-colors duration-200 gap-2 rounded-lg p-2 w-full justify-center"
                type="submit"
                disabled={!wifiSsid.trim() || animating.wifi}
              >
                {animating.wifi ? (
                  <IconLoading className="animate-spin" />
                ) : (
                  <IconWifi />
                )}
                <p className="text-sm">{animating.wifi ? 'Configuring WiFi...' : 'Setup WiFi'}</p>
              </Button>
            </form>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-zinc-900 p-4 rounded-lg">
              <p className="text-sm font-geistMono text-zinc-400">Device Version</p>
              <h3 className="text-xl mt-2">{client.meta.adb?.device_version || 'Unknown'}</h3>
            </div>
            <div className="bg-zinc-900 p-4 rounded-lg">
              <p className="text-sm font-geistMono text-zinc-400">USID</p>
              <h3 className="text-xl mt-2">{client.meta.adb?.usid || 'Unknown'}</h3>
            </div>
            <div className="bg-zinc-900 p-4 rounded-lg">
              <p className="text-sm font-geistMono text-zinc-400">MAC BT</p>
              <h3 className="text-xl mt-2">{client.meta.adb?.mac_bt || 'Unknown'}</h3>
            </div>
            {client.meta.adb?.wifi_ip && (
              <div className="bg-zinc-900 p-4 rounded-lg">
                <p className="text-sm font-geistMono text-zinc-400">WiFi IP</p>
                <h3 className="text-xl mt-2">{client.meta.adb.wifi_ip}</h3>
              </div>
            )}
          </div>

          {is_nerd && (
            <div className="bg-zinc-900 p-4 rounded-lg">
              <p className="text-sm font-geistMono text-zinc-400 mb-4">Supervisor Status</p>
              <div className="space-y-3">
                {client.meta.adb?.services &&
                  Object.entries(client.meta.adb?.services).map(([key, value]) => (
                    <div
                      key={key}
                      className="flex items-center justify-between bg-zinc-800 p-3 rounded-lg"
                    >
                      <h3 className="text-lg">
                        {key}:{' '}
                        <span className={value ? 'text-green-500' : 'text-red-500'}>
                          {String(value)}
                        </span>
                      </h3>
                      <Button
                        title="Toggle Supervisor"
                        className="bg-zinc-900 hover:bg-zinc-800 min-w-fit transition-colors duration-200 gap-2 px-4"
                        onClick={() => handleToggleSupervisor(key, !value)}
                        disabled={animating[key]}
                      >
                        <p className="sm:block text-ellipsis hidden text-nowrap">
                          {animating[key] ? 'Loading' : value ? 'Disable' : 'Enable'}
                        </p>
                        {animating[key] ? (
                          <IconLoading className="animate-spin" />
                        ) : value ? (
                          <IconPause className="text-red-500" />
                        ) : (
                          <IconPlay className="text-green-500" />
                        )}
                      </Button>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {is_nerd && (
            <div className="bg-zinc-900 p-4 rounded-lg">
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  withAnimation('command', async () => {
                    const resp = await sendCommand(adbId!, command)
                    setResponse(resp || 'No response')
                  })
                }}
                className="flex gap-3 items-center w-full"
              >
                <input
                  onChange={(e) => setCommand(e.target.value)}
                  value={command}
                  type="text"
                  placeholder="Enter ADB command..."
                  className="flex-1 px-4 py-2 bg-zinc-800 rounded-lg text-white border border-zinc-700 focus:outline-none focus:border-zinc-500 transition-colors duration-200"
                />
                <Button
                  title="Execute Command"
                  className="bg-zinc-800 hover:bg-zinc-700 transition-colors duration-200 p-2 rounded-lg"
                  type="submit"
                >
                  {animating.command ? (
                    <IconLoading className="animate-spin" />
                  ) : (
                    <IconPlay className="text-green-500" />
                  )}
                </Button>
              </form>
              {response && (
                <div className="bg-zinc-800 p-4 rounded-lg mt-4">
                  {response.split('\n').map((line, index) => (
                    <p key={index} className="text-sm font-geistMono text-zinc-300">
                      {line}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default ADBDeviceDetails
