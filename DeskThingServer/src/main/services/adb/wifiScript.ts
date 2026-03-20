import { ScriptInterface } from '@shared/interfaces/scriptInterface'
import { progressBus } from '@server/services/events/progressBus'
import { ProgressChannel } from '@shared/types'
import logger from '@server/utils/logger'
import { handleError } from '@server/utils/errorHandler'

/**
 * WiFi Setup Script
 * Configures wpa_supplicant on the Car Thing device to connect to a WiFi network.
 *
 * @param adbService - The ADBService instance.
 * @param config - Script configuration including deviceId, ssid, and password.
 * @returns A string indicating the status of the script.
 */
export const wifiScript: ScriptInterface = async (
  adbService,
  { deviceId, ssid, password, reboot = true }
) => {
  if (!ssid) {
    throw new Error('WiFi SSID is required')
  }

  if (ssid.length > 32) {
    throw new Error('WiFi SSID must be 32 characters or fewer')
  }

  try {
    progressBus.start(
      ProgressChannel.PUSH_SCRIPT,
      'WiFi Setup',
      'Checking WiFi module availability'
    )

    // Check if wpa_supplicant is available on the device
    const wpaCheck = await adbService.sendCommand(
      'shell "which wpa_supplicant 2>/dev/null && echo found || echo not_found"',
      deviceId
    )

    if (wpaCheck.trim() === 'not_found') {
      progressBus.error(
        ProgressChannel.PUSH_SCRIPT,
        'wpa_supplicant not found on device',
        'WiFi configuration requires wpa_supplicant to be installed on the device'
      )
      throw new Error(
        'wpa_supplicant not found on device. WiFi may not be supported on this firmware.'
      )
    }

    progressBus.update(ProgressChannel.PUSH_SCRIPT, 'Remounting filesystem', 10)
    await adbService.sendCommand('shell mount -o remount,rw /', deviceId)

    // Generate wpa_supplicant configuration
    // Escape backslashes and double quotes for wpa_supplicant config format
    progressBus.update(ProgressChannel.PUSH_SCRIPT, 'Generating WiFi configuration', 20)

    const escapedSsid = ssid.replace(/\\/g, '\\\\').replace(/"/g, '\\"')

    let wpaConfig: string
    if (password) {
      const escapedPassword = password.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
      wpaConfig = `ctrl_interface=/var/run/wpa_supplicant
update_config=1

network={
    ssid="${escapedSsid}"
    psk="${escapedPassword}"
    key_mgmt=WPA-PSK
}`
    } else {
      wpaConfig = `ctrl_interface=/var/run/wpa_supplicant
update_config=1

network={
    ssid="${escapedSsid}"
    key_mgmt=NONE
}`
    }

    // Write the wpa_supplicant configuration using heredoc (single-quoted delimiter prevents shell expansion)
    progressBus.update(ProgressChannel.PUSH_SCRIPT, 'Writing WiFi configuration', 30)
    await adbService.sendCommand('shell mkdir -p /etc/wpa_supplicant', deviceId)
    await adbService.sendCommand(
      `shell cat > /etc/wpa_supplicant/wpa_supplicant.conf << 'WPAEOF'
${wpaConfig}
WPAEOF`,
      deviceId
    )

    // Create a WiFi startup script
    progressBus.update(ProgressChannel.PUSH_SCRIPT, 'Creating WiFi startup script', 40)
    const wifiStartScript = `#!/bin/sh
# WiFi startup script for DeskThing
case "\$1" in
  start)
    echo "Starting WiFi..."
    ifconfig wlan0 up 2>/dev/null
    wpa_supplicant -B -i wlan0 -c /etc/wpa_supplicant/wpa_supplicant.conf -D nl80211,wext 2>/dev/null
    udhcpc -i wlan0 -b -q 2>/dev/null
    ;;
  stop)
    echo "Stopping WiFi..."
    killall wpa_supplicant 2>/dev/null
    ifconfig wlan0 down 2>/dev/null
    ;;
  restart)
    \$0 stop
    sleep 1
    \$0 start
    ;;
esac
exit 0`

    await adbService.sendCommand(
      `shell cat > /etc/init.d/S50wifi << 'WIFIEOF'
${wifiStartScript}
WIFIEOF`,
      deviceId
    )

    progressBus.update(ProgressChannel.PUSH_SCRIPT, 'Setting permissions', 50)
    await adbService.sendCommand('shell chmod +x /etc/init.d/S50wifi', deviceId)

    // Start WiFi immediately
    progressBus.update(ProgressChannel.PUSH_SCRIPT, 'Starting WiFi interface', 60)
    await adbService.sendCommand('shell ifconfig wlan0 up 2>/dev/null', deviceId)

    progressBus.update(ProgressChannel.PUSH_SCRIPT, 'Starting wpa_supplicant', 70)
    await adbService.sendCommand('shell killall wpa_supplicant 2>/dev/null', deviceId)
    await adbService.sendCommand(
      'shell wpa_supplicant -B -i wlan0 -c /etc/wpa_supplicant/wpa_supplicant.conf -D nl80211,wext 2>/dev/null',
      deviceId
    )

    // Request DHCP lease
    progressBus.update(ProgressChannel.PUSH_SCRIPT, 'Requesting IP address via DHCP', 80)
    await adbService.sendCommand('shell udhcpc -i wlan0 -b -q 2>/dev/null', deviceId)

    // Wait for connection to establish
    progressBus.update(ProgressChannel.PUSH_SCRIPT, 'Waiting for WiFi connection...', 85)
    await new Promise((resolve) => setTimeout(resolve, 3000))

    // Check if connected using the shared method
    progressBus.update(ProgressChannel.PUSH_SCRIPT, 'Checking WiFi connection', 88)
    const wifiIp = await adbService.getDeviceWifiIp(deviceId)

    if (!wifiIp) {
      progressBus.warn(
        ProgressChannel.PUSH_SCRIPT,
        'WiFi configuration saved but device may not have connected yet',
        'No IP address assigned. The device may need a reboot or the credentials may be incorrect.'
      )
    } else {
      logger.info(`Device ${deviceId} connected to WiFi with IP: ${wifiIp}`, {
        function: 'wifiScript',
        source: 'wifiScript'
      })
      progressBus.update(ProgressChannel.PUSH_SCRIPT, `Connected! Device IP: ${wifiIp}`, 90)
    }

    // Sync filesystem
    progressBus.update(ProgressChannel.PUSH_SCRIPT, 'Syncing filesystem', 92)
    await adbService.sendCommand('shell sync', deviceId)

    // Remount as read-only
    progressBus.update(ProgressChannel.PUSH_SCRIPT, 'Remounting filesystem', 95)
    await adbService.sendCommand('shell mount -o remount,ro /', deviceId)

    if (reboot) {
      progressBus.update(ProgressChannel.PUSH_SCRIPT, 'Rebooting device', 98)
      await adbService.sendCommand('shell reboot', deviceId)
      progressBus.complete(ProgressChannel.PUSH_SCRIPT, 'WiFi configured and device rebooting')
    } else {
      progressBus.complete(ProgressChannel.PUSH_SCRIPT, 'WiFi configured successfully')
    }

    return 'WiFi setup completed successfully'
  } catch (error) {
    const errorMessage = `Failed to configure WiFi: ${handleError(error)}`
    progressBus.error(ProgressChannel.PUSH_SCRIPT, 'Failed to configure WiFi', errorMessage)
    throw new Error(errorMessage)
  }
}
