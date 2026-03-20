import {
  IconBluetooth,
  IconDisconnect,
  IconLoading,
  IconRefresh,
  IconX
} from '@renderer/assets/icons'
import Button from '@renderer/components/Button'
import React, { useState } from 'react'
import { Client, PlatformIDs } from '@deskthing/types'
import usePlatformStore from '@renderer/stores/platformStore'
import { ProgressChannel } from '@shared/types'
import { useChannelProgress } from '@renderer/hooks/useProgress'
import { LogEntry } from '@renderer/components/LogEntry'

interface BluetoothDetailsProps {
  client: Client
}

const BluetoothDetails: React.FC<BluetoothDetailsProps> = ({ client }) => {
  const btConnect = usePlatformStore((state) => state.btConnect)
  const btDisconnect = usePlatformStore((state) => state.btDisconnect)
  const btRemove = usePlatformStore((state) => state.btRemove)
  const btRefresh = usePlatformStore((state) => state.btRefresh)
  const progress = useChannelProgress(ProgressChannel.IPC_PLATFORM)

  const [animating, setAnimating] = useState<Record<string, boolean>>({})

  const btMeta = client.meta?.[PlatformIDs.BLUETOOTH]
  const address = btMeta?.address || client.identifiers[PlatformIDs.BLUETOOTH]?.id

  const handleConnect = async (): Promise<void> => {
    if (!address) return
    setAnimating((prev) => ({ ...prev, connect: true }))
    await btConnect(address)
    setAnimating((prev) => ({ ...prev, connect: false }))
  }

  const handleDisconnect = async (): Promise<void> => {
    if (!address) return
    setAnimating((prev) => ({ ...prev, disconnect: true }))
    await btDisconnect(address)
    setAnimating((prev) => ({ ...prev, disconnect: false }))
  }

  const handleRemove = async (): Promise<void> => {
    if (!address) return
    setAnimating((prev) => ({ ...prev, remove: true }))
    await btRemove(address)
    setAnimating((prev) => ({ ...prev, remove: false }))
  }

  const handleRefresh = async (): Promise<void> => {
    setAnimating((prev) => ({ ...prev, refresh: true }))
    await btRefresh()
    setAnimating((prev) => ({ ...prev, refresh: false }))
  }

  return (
    <div className="h-full p-4 overflow-y-auto bg-zinc-950">
      <div className="space-y-6">
        <div className="flex flex-wrap justify-between gap-4">
          {btMeta?.connected ? (
            <Button
              title="Disconnect Bluetooth Device"
              className="bg-zinc-900 hover:bg-zinc-800 border-red-500/50 border transition-colors duration-200 gap-2 rounded-lg p-3"
              onClick={handleDisconnect}
              disabled={animating.disconnect}
            >
              {animating.disconnect ? (
                <IconLoading className="animate-spin flex-shrink-0" />
              ) : (
                <IconDisconnect className="flex-shrink-0" />
              )}
              <p className="sm:block text-ellipsis hidden text-nowrap">Disconnect</p>
            </Button>
          ) : (
            <Button
              title="Connect to Bluetooth Device"
              className="bg-zinc-900 hover:bg-zinc-800 transition-colors duration-200 gap-2 rounded-lg p-3"
              onClick={handleConnect}
              disabled={animating.connect}
            >
              {animating.connect ? (
                <IconLoading className="animate-spin flex-shrink-0" />
              ) : (
                <IconBluetooth className="flex-shrink-0" />
              )}
              <p className="sm:block text-ellipsis hidden text-nowrap">Connect</p>
            </Button>
          )}
          <Button
            title="Refresh Bluetooth Devices"
            className="bg-zinc-900 hover:bg-zinc-800 transition-colors duration-200 gap-2 rounded-lg p-3"
            onClick={handleRefresh}
            disabled={animating.refresh}
          >
            <IconRefresh
              className={`flex-shrink-0 transition-transform duration-1000 ${animating.refresh ? 'rotate-[360deg]' : ''}`}
            />
            <p className="sm:block text-ellipsis hidden text-nowrap">Refresh</p>
          </Button>
          <Button
            title="Remove Bluetooth Device"
            className="bg-zinc-900 hover:bg-zinc-800 border-red-500/50 border transition-colors duration-200 gap-2 rounded-lg p-3"
            onClick={handleRemove}
            disabled={animating.remove}
          >
            {animating.remove ? (
              <IconLoading className="animate-spin flex-shrink-0" />
            ) : (
              <IconX className="flex-shrink-0" />
            )}
            <p className="sm:block text-ellipsis hidden text-nowrap">Remove</p>
          </Button>
        </div>

        {progress.progress && (
          <div className="w-full">
            <LogEntry className="w-full" progressEvent={progress.progress} />
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-zinc-900 p-4 rounded-lg">
            <p className="text-sm font-geistMono text-zinc-400">Device Name</p>
            <h3 className="text-xl mt-2">{btMeta?.name || 'Unknown'}</h3>
          </div>
          <div className="bg-zinc-900 p-4 rounded-lg">
            <p className="text-sm font-geistMono text-zinc-400">Address</p>
            <h3 className="text-xl mt-2 font-geistMono">{address || 'Unknown'}</h3>
          </div>
          <div className="bg-zinc-900 p-4 rounded-lg">
            <p className="text-sm font-geistMono text-zinc-400">Status</p>
            <div className="flex items-center gap-2 mt-2">
              <div
                className={`w-2.5 h-2.5 rounded-full ${btMeta?.connected ? 'bg-green-500' : btMeta?.paired ? 'bg-yellow-500' : 'bg-red-500'}`}
              />
              <h3 className="text-xl">
                {btMeta?.connected ? 'Connected' : btMeta?.paired ? 'Paired' : 'Not Paired'}
              </h3>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-zinc-900 p-4 rounded-lg">
            <p className="text-sm font-geistMono text-zinc-400">Paired</p>
            <h3 className="text-xl mt-2">{btMeta?.paired ? 'Yes' : 'No'}</h3>
          </div>
          <div className="bg-zinc-900 p-4 rounded-lg">
            <p className="text-sm font-geistMono text-zinc-400">Trusted</p>
            <h3 className="text-xl mt-2">{btMeta?.trusted ? 'Yes' : 'No'}</h3>
          </div>
        </div>
      </div>
    </div>
  )
}

export default BluetoothDetails
