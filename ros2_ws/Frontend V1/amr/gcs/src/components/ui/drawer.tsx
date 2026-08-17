import * as React from 'react'
import { Drawer as DrawerPrimitive } from 'vaul'
import { cn } from '@/lib/utils'

const Drawer = ({ shouldScaleBackground = true, ...props }: React.ComponentProps<typeof DrawerPrimitive.Root>) => (
  <DrawerPrimitive.Root shouldScaleBackground={shouldScaleBackground} {...props} />
)
Drawer.displayName = 'Drawer'

const DrawerTrigger = DrawerPrimitive.Trigger
const DrawerClose = DrawerPrimitive.Close

const DrawerContent = React.forwardRef<React.ElementRef<typeof DrawerPrimitive.Content>, React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Content>>(
  ({ className, children, ...props }, ref) => (
    <DrawerPrimitive.Portal>
      <DrawerPrimitive.Overlay className="fixed inset-0 z-40 bg-overlay/50" />
      <DrawerPrimitive.Content ref={ref} className={cn('fixed inset-x-0 bottom-0 z-50 mt-24 h-[96%] rounded-t-xl border bg-white', className)} {...props}>
        <div className="mx-auto mt-4 w-12 h-1.5 bg-border rounded-full" />
        {children}
      </DrawerPrimitive.Content>
    </DrawerPrimitive.Portal>
  ),
)
DrawerContent.displayName = 'DrawerContent'

export { Drawer, DrawerTrigger, DrawerClose, DrawerContent }
