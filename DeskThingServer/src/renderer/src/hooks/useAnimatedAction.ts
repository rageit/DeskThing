import { useState, useCallback } from 'react'

/**
 * Hook to manage loading/animation states for multiple actions.
 * Returns the current animation state map and a wrapper that
 * sets/clears the key automatically around an async action.
 */
export function useAnimatedAction(): {
  animating: Record<string, boolean>
  withAnimation: (key: string, action: () => Promise<void>) => Promise<void>
  setAnimating: React.Dispatch<React.SetStateAction<Record<string, boolean>>>
} {
  const [animating, setAnimating] = useState<Record<string, boolean>>({})

  const withAnimation = useCallback(async (key: string, action: () => Promise<void>) => {
    setAnimating((prev) => ({ ...prev, [key]: true }))
    try {
      await action()
    } finally {
      setAnimating((prev) => ({ ...prev, [key]: false }))
    }
  }, [])

  return { animating, withAnimation, setAnimating }
}
