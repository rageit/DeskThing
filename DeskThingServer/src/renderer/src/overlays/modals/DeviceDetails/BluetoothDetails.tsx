import {
  IconBluetooth,
  IconDisconnect,
  IconRefresh,
  IconX
} from '@renderer/assets/icons'
import ActionButton from '@renderer/components/ActionButton'
import React from 'react'
import { Client, PlatformIDs } from '@deskthing/types'
import usePlatformStore from '@renderer/stores/platformStore'
import { ProgressChannel } from '@shared/types'
import { useChannelProgress } from '@renderer/hooks/useProgress'
import { LogEntry } from '@renderer/components/LogEntry'
import { useAnimatedAction } from '@renderer/hooks/useAnimatedAction'

interface BluetoothDetailsProps {
  client: Client
}

const BluetoothDetails: React.FC<BluetoothDetailsProps> = ({ client }) => {
  const btConnect = usePlatformStore((state) => state.btConnect)
  const btDisconnect = usePlatformStore((state) => state.btDisconnect)
  const btRemove = usePlatformStore((state) => state.btRemove)
  const btRefresh = usePlatformStore((state) => state.btRefresh)
  const progress = useChannelProgress(ProgressChannel.IPC_PLATFORM)

  const { animating, withAnimation } = useAnimatedAction()

  const btMeta = client.meta?.[PlatformIDs.BLUETOOTH]
  const address = btMeta?.address || client.identifiers[PlatformIDs.BLUETOOTH]?.id

  return (
    <div className="h-full p-4 overflow-y-auto bg-zinc-950">
      <div className="space-y-6">
        <div className="flex flex-wrap justify-between gap-4">
          {btMeta?.connected ? (
            <ActionButton
              title="Disconnect Bluetooth Device"
              label="Disconnect"
              icon={<IconDisconnect className="flex-shrink-0" />}
              onClick={() => withAnimation('disconnect', async () => {
                if (address) await btDisconnect(address)
              })}
              isAnimating={animating.disconnect}
              danger
            />
          ) : (
            <ActionButton
              title="Connect to Bluetooth Device"
              label="Connect"
              icon={<IconBluetooth className="flex-shrink-0" />}
              onClick={() => withAnimation('connect', async () => {
                if (address) await btConnect(address)
              })}
              isAnimating={animating.connect}
            />
          )}
          <ActionButton
            title="Refresh Bluetooth Devices"
            label="Refresh"
            icon={<IconRefresh className="flex-shrink-0" />}
            onClick={() => withAnimation('refresh', async () => { await btRefresh() })}
            isAnimating={animating.refresh}
            animationStyle="rotate"
          />
          <ActionButton
            title="Remove Bluetooth Device"
            label="Remove"
            icon={<IconX className="flex-shrink-0" />}
            onClick={() => withAnimation('remove', async () => {
              if (address) await btRemove(address)
            })}
            isAnimating={animating.remove}
            danger
          />
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
