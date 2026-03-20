import { execFile } from 'child_process'
import logger from '@server/utils/logger'
import os from 'os'

export interface BluetoothDevice {
  address: string
  name: string
  paired: boolean
  connected: boolean
  trusted: boolean
}

/**
 * BluetoothService provides methods for interacting with the system Bluetooth.
 * Uses bluetoothctl on Linux and system_profiler on macOS.
 */
export class BluetoothService {
  private scanning: boolean = false
  private readonly platform: NodeJS.Platform = os.platform()

  /**
   * Runs a bluetoothctl command and returns the output (Linux only).
   */
  public async runCommand(command: string): Promise<string> {
    if (this.platform === 'darwin') {
      throw new Error('bluetoothctl is not available on macOS. Use macOS-specific methods.')
    }
    return new Promise((resolve, reject) => {
      execFile('bluetoothctl', command.split(' '), { timeout: 15000 }, (error, stdout, stderr) => {
        if (error) {
          logger.error(`Bluetooth command failed: ${command}`, {
            error: error as Error,
            function: 'runCommand',
            source: 'BluetoothService'
          })
          reject(new Error(`Bluetooth error: ${stderr || error.message}`))
        } else {
          resolve(stdout)
        }
      })
    })
  }

  /**
   * Runs a system_profiler command to query Bluetooth info (macOS only).
   */
  private async runMacCommand(args: string[] = []): Promise<string> {
    return new Promise((resolve, reject) => {
      execFile(
        'system_profiler',
        ['SPBluetoothDataType', ...args],
        { timeout: 15000 },
        (error, stdout, stderr) => {
          if (error) {
            logger.error(`macOS Bluetooth query failed`, {
              error: error as Error,
              function: 'runMacCommand',
              source: 'BluetoothService'
            })
            reject(new Error(`Bluetooth error: ${stderr || error.message}`))
          } else {
            resolve(stdout)
          }
        }
      )
    })
  }

  /**
   * Checks if Bluetooth is available on the system.
   */
  public async isAvailable(): Promise<boolean> {
    try {
      if (this.platform === 'darwin') {
        const output = await this.runMacCommand()
        return output.includes('Bluetooth')
      }
      // Linux: check for bluetoothctl
      await this.runCommand('--version')
      return true
    } catch {
      return false
    }
  }

  /**
   * Powers the Bluetooth adapter on or off.
   */
  public async setPower(on: boolean): Promise<void> {
    if (this.platform === 'darwin') {
      // macOS manages Bluetooth power through System Preferences; skip
      return
    }
    await this.runCommand(`power ${on ? 'on' : 'off'}`)
  }

  /**
   * Starts scanning for nearby Bluetooth devices.
   * Scans for the specified duration in seconds, then stops.
   */
  public async scan(durationMs: number = 10000): Promise<BluetoothDevice[]> {
    if (this.scanning) return []
    this.scanning = true

    try {
      if (this.platform === 'darwin') {
        // macOS: system_profiler returns currently known devices; no active scan needed
        return this.getDevices()
      }

      await this.runCommand('power on')

      // scan on is a blocking command in bluetoothctl, so we spawn it separately
      // with its own timeout and let it run in the background
      const scanProcess = execFile(
        'bluetoothctl',
        ['scan', 'on'],
        { timeout: durationMs + 2000 },
        () => {
          /* process ends when timeout kills it or scan off is sent */
        }
      )

      await new Promise((resolve) => setTimeout(resolve, durationMs))

      // Stop the scan gracefully; kill the process if scan off fails
      await this.runCommand('scan off').catch(() => {
        scanProcess.kill()
      })

      return this.getDevices()
    } finally {
      this.scanning = false
    }
  }

  /**
   * Gets the list of known Bluetooth devices.
   */
  public async getDevices(): Promise<BluetoothDevice[]> {
    try {
      if (this.platform === 'darwin') {
        return this.getMacDevices()
      }

      const output = await this.runCommand('devices')
      const deviceLines = output.split('\n').filter((line) => line.startsWith('Device'))
      const parsed: { address: string; name: string }[] = []

      for (const line of deviceLines) {
        const match = line.match(/Device\s+([0-9A-F:]+)\s+(.+)/i)
        if (match) {
          parsed.push({ address: match[1], name: match[2] })
        }
      }

      // Fetch device info in parallel to avoid N+1 sequential queries
      const infos = await Promise.all(parsed.map((d) => this.getDeviceInfo(d.address)))

      return parsed.map((d, i) => ({
        address: d.address,
        name: d.name,
        paired: infos[i].paired,
        connected: infos[i].connected,
        trusted: infos[i].trusted
      }))
    } catch (error) {
      logger.error('Failed to get Bluetooth devices', {
        error: error as Error,
        function: 'getDevices',
        source: 'BluetoothService'
      })
      return []
    }
  }

  /**
   * Parses macOS system_profiler output to get Bluetooth devices.
   */
  private async getMacDevices(): Promise<BluetoothDevice[]> {
    try {
      const output = await this.runMacCommand()
      const devices: BluetoothDevice[] = []

      // Parse connected/paired devices from system_profiler output
      const lines = output.split('\n')
      let currentDevice: Partial<BluetoothDevice> | null = null
      let inDevicesSection = false

      for (const line of lines) {
        const trimmed = line.trim()

        if (
          trimmed.includes('Connected:') ||
          trimmed.includes('Devices (Paired, Configured, etc.):')
        ) {
          inDevicesSection = true
          continue
        }

        if (inDevicesSection && trimmed.endsWith(':') && !trimmed.includes('Address')) {
          // New device name
          if (currentDevice?.address) {
            devices.push({
              address: currentDevice.address,
              name: currentDevice.name || 'Unknown',
              paired: currentDevice.paired ?? false,
              connected: currentDevice.connected ?? false,
              trusted: currentDevice.paired ?? false
            })
          }
          currentDevice = { name: trimmed.replace(':', '').trim() }
        }

        if (currentDevice) {
          if (trimmed.startsWith('Address:')) {
            currentDevice.address = trimmed.replace('Address:', '').trim()
          }
          if (trimmed.startsWith('Connected:')) {
            currentDevice.connected = trimmed.includes('Yes')
          }
          if (trimmed.startsWith('Paired:')) {
            currentDevice.paired = trimmed.includes('Yes')
          }
        }
      }

      // Push last device
      if (currentDevice?.address) {
        devices.push({
          address: currentDevice.address,
          name: currentDevice.name || 'Unknown',
          paired: currentDevice.paired ?? false,
          connected: currentDevice.connected ?? false,
          trusted: currentDevice.paired ?? false
        })
      }

      return devices
    } catch (error) {
      logger.error('Failed to get macOS Bluetooth devices', {
        error: error as Error,
        function: 'getMacDevices',
        source: 'BluetoothService'
      })
      return []
    }
  }

  /**
   * Gets detailed info about a specific Bluetooth device.
   */
  public async getDeviceInfo(
    address: string
  ): Promise<{ paired: boolean; connected: boolean; trusted: boolean }> {
    try {
      if (this.platform === 'darwin') {
        // On macOS, device info is already included in getDevices parsing
        const devices = await this.getMacDevices()
        const device = devices.find((d) => d.address === address)
        return {
          paired: device?.paired ?? false,
          connected: device?.connected ?? false,
          trusted: device?.paired ?? false
        }
      }
      const output = await this.runCommand(`info ${address}`)
      return {
        paired: output.includes('Paired: yes'),
        connected: output.includes('Connected: yes'),
        trusted: output.includes('Trusted: yes')
      }
    } catch {
      return { paired: false, connected: false, trusted: false }
    }
  }

  /**
   * Pairs with a Bluetooth device.
   */
  public async pair(address: string): Promise<boolean> {
    if (this.platform === 'darwin') {
      logger.warn('Bluetooth pairing must be done through macOS System Preferences', {
        function: 'pair',
        source: 'BluetoothService'
      })
      return false
    }
    try {
      await this.runCommand(`pair ${address}`)
      return true
    } catch (error) {
      logger.error(`Failed to pair with ${address}`, {
        error: error as Error,
        function: 'pair',
        source: 'BluetoothService'
      })
      return false
    }
  }

  /**
   * Trusts a Bluetooth device (allows auto-reconnect).
   */
  public async trust(address: string): Promise<boolean> {
    if (this.platform === 'darwin') {
      return false
    }
    try {
      await this.runCommand(`trust ${address}`)
      return true
    } catch (error) {
      logger.warn(`Failed to trust ${address}`, {
        error: error as Error,
        function: 'trust',
        source: 'BluetoothService'
      })
      return false
    }
  }

  /**
   * Connects to a paired Bluetooth device.
   */
  public async connect(address: string): Promise<boolean> {
    if (this.platform === 'darwin') {
      logger.warn('Bluetooth connections on macOS must be managed through System Preferences', {
        function: 'connect',
        source: 'BluetoothService'
      })
      return false
    }
    try {
      await this.runCommand(`connect ${address}`)
      return true
    } catch (error) {
      logger.error(`Failed to connect to ${address}`, {
        error: error as Error,
        function: 'connect',
        source: 'BluetoothService'
      })
      return false
    }
  }

  /**
   * Disconnects from a Bluetooth device.
   */
  public async disconnect(address: string): Promise<boolean> {
    if (this.platform === 'darwin') {
      return false
    }
    try {
      await this.runCommand(`disconnect ${address}`)
      return true
    } catch (error) {
      logger.warn(`Failed to disconnect from ${address}`, {
        error: error as Error,
        function: 'disconnect',
        source: 'BluetoothService'
      })
      return false
    }
  }

  /**
   * Removes a paired Bluetooth device.
   */
  public async remove(address: string): Promise<boolean> {
    if (this.platform === 'darwin') {
      return false
    }
    try {
      await this.runCommand(`remove ${address}`)
      return true
    } catch (error) {
      logger.warn(`Failed to remove ${address}`, {
        error: error as Error,
        function: 'remove',
        source: 'BluetoothService'
      })
      return false
    }
  }

  public isScanning(): boolean {
    return this.scanning
  }
}
