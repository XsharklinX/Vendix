export {}

declare global {
  type VendixUpdateStatus = 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error'

  interface VendixUpdateState {
    status: VendixUpdateStatus
    currentVersion: string
    availableVersion: string | null
    channel: 'stable' | 'beta'
    message: string | null
    lastCheckedAt: string | null
    downloadedAt: string | null
  }

  interface VendixLogInfo {
    path: string
    exists: boolean
    size: number
    updatedAt: string | null
    tail: string
  }

  interface VendixSyncConfig {
    enabled: boolean
    cloudUrl: string
    hasCloudToken: boolean
    localBusinessId: string
    cloudBusinessId: string
    deviceKey: string
    deviceName: string
    intervalMs: number
  }

  interface VendixSyncConfigInput {
    enabled: boolean
    cloudUrl: string
    cloudToken?: string
    localBusinessId: string
    cloudBusinessId: string
    deviceKey: string
    deviceName: string
    intervalMs: number
  }

  interface Window {
    electronAPI?: {
      platform: string
      getUpdateState: () => Promise<VendixUpdateState>
      checkForUpdates: () => Promise<VendixUpdateState>
      installUpdate: () => Promise<boolean>
      setUpdateChannel: (channel: 'stable' | 'beta') => Promise<VendixUpdateState>
      onUpdateState: (callback: (state: VendixUpdateState) => void) => () => void
      getLogInfo: () => Promise<VendixLogInfo>
      getSyncConfig: () => Promise<VendixSyncConfig>
      saveSyncConfig: (config: VendixSyncConfigInput) => Promise<VendixSyncConfig>
      openUserData: () => Promise<boolean>
      openLogFile: () => Promise<boolean>
    }
  }
}
