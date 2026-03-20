import { execFile } from 'child_process'
import logger from '@server/utils/logger'

export interface BluetoothDevice {
  address: string
  name: string
  paired: boolean
  connected: boolean
  trusted: boolean
}

/**
 * BluetoothService provides methods for interacting with the system Bluetooth
 * via bluetoothctl (Linux). Supports scanning, pairing, connecting, and
 * sending data over RFCOMM serial connections.
 */
export class BluetoothService {
  private scanning: boolean = false

  /**
   * Runs a bluetoothctl command and returns the output.
   */
  public async runCommand(command: string): Promise<string> {
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
   * Checks if bluetoothctl is available on the system.
   */
  public async isAvailable(): Promise<boolean> {
    try {
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
   * Gets detailed info about a specific Bluetooth device.
   */
  public async getDeviceInfo(
    address: string
  ): Promise<{ paired: boolean; connected: boolean; trusted: boolean }> {
    try {
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
