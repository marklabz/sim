import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertCircle, Check, Pencil, X } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useActiveOrganization } from '@/lib/auth-client'
import { createLogger } from '@/lib/logs/console/logger'
import { cn } from '@/lib/utils'
import { UsageHeader } from '@/app/workspace/[workspaceId]/w/components/sidebar/components/settings-modal/components/shared/usage-header'
import {
  UsageLimit,
  type UsageLimitRef,
} from '@/app/workspace/[workspaceId]/w/components/sidebar/components/settings-modal/components/subscription/components'
import { useOrganizationStore } from '@/stores/organization'
import { useSubscriptionStore } from '@/stores/subscription/store'

const logger = createLogger('TeamUsage')

// Team-specific usage limit component
interface TeamUsageLimitProps {
  currentLimit: number
  currentUsage: number
  canEdit: boolean
  minimumLimit: number
  organizationId: string
  onLimitUpdated?: (newLimit: number) => void
}

function TeamUsageLimit({
  currentLimit,
  currentUsage,
  canEdit,
  minimumLimit,
  organizationId,
  onLimitUpdated,
}: TeamUsageLimitProps) {
  const [inputValue, setInputValue] = useState(currentLimit.toString())
  const [isSaving, setIsSaving] = useState(false)
  const [hasError, setHasError] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleStartEdit = () => {
    if (!canEdit) return
    setIsEditing(true)
    setInputValue(currentLimit.toString())
  }

  useEffect(() => {
    setInputValue(currentLimit.toString())
  }, [currentLimit])

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  useEffect(() => {
    if (hasError) {
      const timer = setTimeout(() => {
        setHasError(false)
      }, 2000)
      return () => clearTimeout(timer)
    }
  }, [hasError])

  const handleSubmit = async () => {
    const newLimit = Number.parseInt(inputValue, 10)

    if (Number.isNaN(newLimit) || newLimit < minimumLimit) {
      setInputValue(currentLimit.toString())
      setIsEditing(false)
      return
    }

    if (newLimit < currentUsage) {
      setHasError(true)
      return
    }

    if (newLimit === currentLimit) {
      setIsEditing(false)
      return
    }

    setIsSaving(true)

    try {
      const response = await fetch('/api/usage-limits', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          context: 'organization',
          organizationId,
          limit: newLimit,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update usage cap')
      }

      setInputValue(newLimit.toString())
      onLimitUpdated?.(newLimit)
      setIsEditing(false)
      setHasError(false)
    } catch (error) {
      logger.error('Failed to update team usage limit', { error })
      setHasError(true)
    } finally {
      setIsSaving(false)
    }
  }

  const handleCancelEdit = () => {
    setIsEditing(false)
    setInputValue(currentLimit.toString())
    setHasError(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSubmit()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      handleCancelEdit()
    }
  }

  return (
    <div className='flex items-center'>
      {isEditing ? (
        <>
          <span className='text-muted-foreground text-xs tabular-nums'>$</span>
          <input
            ref={inputRef}
            type='number'
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={(e) => {
              const relatedTarget = e.relatedTarget as HTMLElement
              if (relatedTarget?.closest('button')) {
                return
              }
              handleSubmit()
            }}
            className={cn(
              'w-[3ch] border-0 bg-transparent p-0 text-xs tabular-nums',
              'outline-none focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0',
              '[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none',
              hasError && 'text-red-500'
            )}
            min={minimumLimit}
            max='999'
            step='1'
            disabled={isSaving}
            autoComplete='off'
            autoCorrect='off'
            autoCapitalize='off'
            spellCheck='false'
          />
        </>
      ) : (
        <span className='text-muted-foreground text-xs tabular-nums'>${currentLimit}</span>
      )}
      {canEdit && (
        <Button
          variant='ghost'
          size='icon'
          className={cn(
            'ml-1 h-4 w-4 p-0 transition-colors hover:bg-transparent',
            hasError
              ? 'text-red-500 hover:text-red-600'
              : 'text-muted-foreground hover:text-foreground'
          )}
          onClick={isEditing ? handleSubmit : handleStartEdit}
          disabled={isSaving}
          data-team-usage-edit
        >
          {isEditing ? (
            hasError ? (
              <X className='!h-3 !w-3' />
            ) : (
              <Check className='!h-3 !w-3' />
            )
          ) : (
            <Pencil className='!h-3 !w-3' />
          )}
          <span className='sr-only'>{isEditing ? 'Save limit' : 'Edit limit'}</span>
        </Button>
      )}
    </div>
  )
}

interface TeamUsageProps {
  hasAdminAccess: boolean
}

export function TeamUsage({ hasAdminAccess }: TeamUsageProps) {
  const { data: activeOrg } = useActiveOrganization()
  const { getSubscriptionStatus } = useSubscriptionStore()

  const {
    organizationBillingData: billingData,
    loadOrganizationBillingData,
    isLoadingOrgBilling,
    error,
  } = useOrganizationStore()

  useEffect(() => {
    if (activeOrg?.id) {
      loadOrganizationBillingData(activeOrg.id)
    }
  }, [activeOrg?.id, loadOrganizationBillingData])

  const handleLimitUpdated = useCallback(
    async (newLimit: number) => {
      // Reload the organization billing data to reflect the new limit
      if (activeOrg?.id) {
        await loadOrganizationBillingData(activeOrg.id, true)
      }
    },
    [activeOrg?.id, loadOrganizationBillingData]
  )

  const usageLimitRef = useRef<UsageLimitRef | null>(null)

  if (isLoadingOrgBilling) {
    return (
      <div className='rounded-[8px] border bg-background p-3 shadow-xs'>
        <div className='space-y-2'>
          <div className='flex items-center justify-between'>
            <div className='flex items-center gap-2'>
              <Skeleton className='h-5 w-16' />
              <Skeleton className='h-4 w-20' />
            </div>
            <div className='flex items-center gap-1 text-xs'>
              <Skeleton className='h-4 w-8' />
              <span className='text-muted-foreground'>/</span>
              <Skeleton className='h-4 w-8' />
            </div>
          </div>
          <Skeleton className='h-2 w-full rounded' />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <Alert variant='destructive'>
        <AlertCircle className='h-4 w-4' />
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    )
  }

  if (!billingData) {
    return null
  }

  const currentUsage = billingData.totalCurrentUsage || 0
  const currentCap = billingData.totalUsageLimit || billingData.minimumBillingAmount || 0
  const minimumBilling = billingData.minimumBillingAmount || 0
  const seatsCount = billingData.seatsCount || 1
  const percentUsed = currentCap > 0 ? Math.min((currentUsage / currentCap) * 100, 100) : 0

  const subscription = getSubscriptionStatus()
  const title = subscription.isEnterprise
    ? 'Enterprise'
    : subscription.isTeam
      ? 'Team'
      : (subscription.plan || 'Free').charAt(0).toUpperCase() +
        (subscription.plan || 'Free').slice(1)

  return (
    <UsageHeader
      title={title}
      gradientTitle
      showBadge={!!(hasAdminAccess && activeOrg?.id && !subscription.isEnterprise)}
      badgeText={subscription.isEnterprise ? undefined : 'Increase Limit'}
      onBadgeClick={() => {
        if (!subscription.isEnterprise) usageLimitRef.current?.startEdit()
      }}
      seatsText={`${seatsCount} seats`}
      current={currentUsage}
      limit={currentCap}
      rightContent={
        hasAdminAccess && activeOrg?.id && !subscription.isEnterprise ? (
          <UsageLimit
            ref={usageLimitRef}
            currentLimit={currentCap}
            currentUsage={currentUsage}
            canEdit={hasAdminAccess && !subscription.isEnterprise}
            minimumLimit={minimumBilling}
            context='organization'
            organizationId={activeOrg.id}
            onLimitUpdated={handleLimitUpdated}
          />
        ) : (
          <span className='text-muted-foreground text-xs tabular-nums'>
            ${currentCap.toFixed(0)}
          </span>
        )
      }
      progressValue={percentUsed}
    />
  )
}
