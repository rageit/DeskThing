import { progressBus } from '@server/services/events/progressBus'
import { ProgressChannel } from '@shared/types'
import { handleError } from '@server/utils/errorHandler'

/**
 * Wraps an async operation with progress bus start/complete/error calls.
 * Reduces boilerplate in platform event handlers.
 */
export async function withProgress<T>(
  channel: ProgressChannel,
  title: string,
  fn: () => Promise<T>,
  options?: { errorTitle?: string; errorFallback?: T }
): Promise<T> {
  progressBus.start(channel, title, title)
  try {
    const result = await fn()
    progressBus.complete(channel, `${title} complete`)
    return result
  } catch (error) {
    progressBus.error(channel, options?.errorTitle || `${title} failed`, handleError(error))
    if (options?.errorFallback !== undefined) {
      return options.errorFallback
    }
    throw error
  }
}
