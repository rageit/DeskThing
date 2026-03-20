export enum SCRIPT_IDs {
  RESTART = 'restart_script',
  PROXY = 'proxy_script',
  WIFI_SETUP = 'wifi_setup'
}

export type ScriptConfig = {
  reboot?: boolean
  force?: boolean
  deviceId: string
  ssid?: string
  password?: string
}
