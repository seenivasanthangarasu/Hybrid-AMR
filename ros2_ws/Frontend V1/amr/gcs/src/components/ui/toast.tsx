import * as React from 'react'
import * as ToastPrimitives from '@radix-ui/react-toast'
import { cva, type VariantProps } from 'class-variance-authority'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

const ToastProvider = ToastPrimitives.Provider
const ToastViewport = React.forwardRef<React.ElementRef<typeof ToastPrimitives.Viewport>, React.ComponentPropsWithoutRef<typeof ToastPrimitives.Viewport>>(
  ({ className, ...props }, ref) => (
    <ToastPrimitives.Viewport ref={ref} className={cn('fixed top-0 right-0 z-50 flex flex-col p-4 gap-2 w-full max-w-[420px] pointer-events-none', className)} {...props} />
  ),
)
ToastViewport.displayName = ToastPrimitives.Viewport.displayName

const toastVariants = cva(
  'group pointer-events-auto relative flex items-center gap-3 rounded-xl border p-4 shadow-card duration-300 data-[state=open]:animate-in data-[state=closed]:animate-out',
  {
    variants: { variant: { default: 'bg-white border-border', success: 'bg-success-bg border-success/30 text-success', warning: 'bg-warning-bg border-warning/30 text-warning', error: 'bg-error-bg border-error/30 text-error', info: 'bg-info-bg border-info/30 text-info' } },
    defaultVariants: { variant: 'default' },
  },
)

const Toast = React.forwardRef<React.ElementRef<typeof ToastPrimitives.Root>, React.ComponentPropsWithoutRef<typeof ToastPrimitives.Root> & VariantProps<typeof toastVariants>>(
  ({ className, variant, ...props }, ref) => <ToastPrimitives.Root ref={ref} className={cn(toastVariants({ variant }), className)} {...props} />,
)
Toast.displayName = ToastPrimitives.Root.displayName

const ToastAction = React.forwardRef<React.ElementRef<typeof ToastPrimitives.Action>, React.ComponentPropsWithoutRef<typeof ToastPrimitives.Action>>(
  ({ className, ...props }, ref) => <ToastPrimitives.Action ref={ref} className={cn('h-8 px-3 text-xs font-semibold rounded-lg border bg-white hover:bg-bg-secondary', className)} {...props} />,
)
ToastAction.displayName = ToastPrimitives.Action.displayName

const ToastClose = React.forwardRef<React.ElementRef<typeof ToastPrimitives.Close>, React.ComponentPropsWithoutRef<typeof ToastPrimitives.Close>>(
  ({ className, ...props }, ref) => (
    <ToastPrimitives.Close ref={ref} className={cn('absolute right-2 top-2 rounded-md p-1 opacity-0 transition-opacity group-hover:opacity-100', className)} toast-close="" {...props}>
      <X className="h-4 w-4" />
    </ToastPrimitives.Close>
  ),
)
ToastClose.displayName = ToastPrimitives.Close.displayName

const ToastTitle = React.forwardRef<React.ElementRef<typeof ToastPrimitives.Title>, React.ComponentPropsWithoutRef<typeof ToastPrimitives.Title>>(
  ({ className, ...props }, ref) => <ToastPrimitives.Title ref={ref} className={cn('text-sm font-semibold', className)} {...props} />,
)
ToastTitle.displayName = ToastPrimitives.Title.displayName

const ToastDescription = React.forwardRef<React.ElementRef<typeof ToastPrimitives.Description>, React.ComponentPropsWithoutRef<typeof ToastPrimitives.Description>>(
  ({ className, ...props }, ref) => <ToastPrimitives.Description ref={ref} className={cn('text-sm opacity-90', className)} {...props} />,
)
ToastDescription.displayName = ToastPrimitives.Description.displayName

export { ToastProvider, ToastViewport, Toast, ToastAction, ToastClose, ToastTitle, ToastDescription }
