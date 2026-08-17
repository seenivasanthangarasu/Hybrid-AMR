/** Hook — theme toggle with persistence */

import { useUiStore } from '@/stores/uiStore'
import { useCallback } from 'react'

export function useTheme() {
  const theme = useUiStore((s) => s.theme)
  const setTheme = useUiStore((s) => s.setTheme)

  /** Toggle between light and dark themes */
  const toggleTheme = useCallback(() => {
    setTheme(theme === 'light' ? 'dark' : 'light')
  }, [theme, setTheme])

  return { theme, toggleTheme }
}
