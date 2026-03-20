import React from 'react'
import { IconLoading } from '@renderer/assets/icons'
import Button from './Button'

interface ActionButtonProps {
  title: string
  label: string
  icon: React.ReactNode
  onClick: () => void
  isAnimating?: boolean
  disabled?: boolean
  /** Use 'spin' for a loading spinner, 'rotate' for a rotation animation on the icon itself */
  animationStyle?: 'spin' | 'rotate'
  /** Add a red border to indicate a destructive action */
  danger?: boolean
  className?: string
}

/**
 * Reusable action button with built-in loading/animation states.
 * Used across device detail panels (ADB, Bluetooth, etc).
 */
const ActionButton: React.FC<ActionButtonProps> = ({
  title,
  label,
  icon,
  onClick,
  isAnimating = false,
  disabled = false,
  animationStyle = 'spin',
  danger = false,
  className
}) => {
  const borderClass = danger ? 'border-red-500/50 border' : ''
  const baseClass = `bg-zinc-900 hover:bg-zinc-800 min-w-fit transition-colors duration-200 gap-2 rounded-lg p-3 ${borderClass}`
  const finalClass = className ? `${baseClass} ${className}` : baseClass

  const renderIcon = (): React.ReactNode => {
    if (!isAnimating) return icon

    if (animationStyle === 'rotate') {
      // For rotate style, clone the icon element and add rotation class
      return React.isValidElement(icon)
        ? React.cloneElement(icon as React.ReactElement<{ className?: string }>, {
            className: `${(icon as React.ReactElement<{ className?: string }>).props.className || ''} transition-transform duration-1000 rotate-[360deg]`.trim()
          })
        : <IconLoading className="animate-spin flex-shrink-0" />
    }

    return <IconLoading className="animate-spin flex-shrink-0" />
  }

  return (
    <Button
      title={title}
      className={finalClass}
      onClick={onClick}
      disabled={disabled || isAnimating}
    >
      {renderIcon()}
      <p className="sm:block text-ellipsis hidden text-nowrap">{label}</p>
    </Button>
  )
}

export default ActionButton
