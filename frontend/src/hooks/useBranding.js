import { useEffect } from 'react'
import { useAuthStore } from '../store/authStore'

const DEFAULT_PRIMARY = '#6366f1'

export function hexToRgb(hex) {
  const normalized = hex.replace('#', '').trim()
  const value =
    normalized.length === 3
      ? normalized
          .split('')
          .map((char) => char + char)
          .join('')
      : normalized

  const number = Number.parseInt(value, 16)

  if (Number.isNaN(number)) {
    return { r: 99, g: 102, b: 241 }
  }

  return {
    r: (number >> 16) & 255,
    g: (number >> 8) & 255,
    b: number & 255,
  }
}

export function useBranding() {
  const tenant = useAuthStore((state) => state.tenant)
  const primaryColor = tenant?.primary_color || DEFAULT_PRIMARY
  const logoUrl = tenant?.logo_url || null
  const businessName = tenant?.business_name || ''

  useEffect(() => {
    const root = document.documentElement
    const rgb = hexToRgb(primaryColor)

    root.style.setProperty('--primary', primaryColor)
    root.style.setProperty('--primary-rgb', `${rgb.r}, ${rgb.g}, ${rgb.b}`)
  }, [primaryColor, tenant])

  return {
    primaryColor,
    logoUrl,
    businessName,
  }
}
