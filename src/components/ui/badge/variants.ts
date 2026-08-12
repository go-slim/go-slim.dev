import { tv } from 'tailwind-variants'

export default tv({
  base: [
    'starwind-badge inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-full font-medium',
    '[&_svg]:pointer-events-none [&_svg]:shrink-0',
    'transition-[color,background-color,border-color,box-shadow,filter] outline-hidden focus-visible:ring-3 focus-visible:ring-outline/50',
    'aria-invalid:ring-error/40 aria-invalid:focus-visible:ring-error/50',
  ],
  variants: {
    variant: {
      solid: '',
      outline: '',
      soft: '',
      subtle: '',
    },
    color: {
      default: '',
      primary: '',
      info: '',
      success: '',
      warning: '',
      error: '',
    },
    size: {
      xs: "px-2 py-0.5 text-[10px] [&_svg:not([class*='size-'])]:size-2.5",
      sm: "px-2.5 py-0.5 text-xs [&_svg:not([class*='size-'])]:size-3",
      md: "px-3 py-0.5 text-sm [&_svg:not([class*='size-'])]:size-4",
      lg: "px-4 py-1 text-base [&_svg:not([class*='size-'])]:size-4.5",
      xl: "px-5 py-1.5 text-lg [&_svg:not([class*='size-'])]:size-5",
    },
    square: {
      true: 'aspect-square gap-0',
    },
    isLink: {
      true: 'cursor-pointer hover:brightness-95 active:brightness-90 dark:hover:brightness-110',
      false: '',
    },
  },
  compoundVariants: [
    { variant: 'solid', color: 'default', class: 'bg-foreground text-background' },
    { variant: 'outline', color: 'default', class: 'bg-background text-foreground ring ring-inset ring-border' },
    { variant: 'soft', color: 'default', class: 'bg-accent text-foreground' },
    { variant: 'subtle', color: 'default', class: 'bg-accent text-foreground ring ring-inset ring-border' },

    { variant: 'solid', color: 'primary', class: 'bg-primary text-primary-foreground' },
    { variant: 'outline', color: 'primary', class: 'text-primary ring ring-inset ring-primary/50' },
    { variant: 'soft', color: 'primary', class: 'bg-primary/10 text-primary' },
    { variant: 'subtle', color: 'primary', class: 'bg-primary/10 text-primary ring ring-inset ring-primary/25' },

    { variant: 'solid', color: 'info', class: 'bg-info text-info-foreground' },
    { variant: 'outline', color: 'info', class: 'text-info ring ring-inset ring-info/50' },
    { variant: 'soft', color: 'info', class: 'bg-info/10 text-info' },
    { variant: 'subtle', color: 'info', class: 'text-info ring ring-inset ring-info/25' },

    { variant: 'solid', color: 'success', class: 'bg-success text-success-foreground' },
    { variant: 'outline', color: 'success', class: 'text-success ring ring-inset ring-success/50' },
    { variant: 'soft', color: 'success', class: 'bg-success/10 text-success' },
    { variant: 'subtle', color: 'success', class: 'text-success ring ring-inset ring-success/25' },

    { variant: 'solid', color: 'warning', class: 'bg-warning text-warning-foreground' },
    { variant: 'outline', color: 'warning', class: 'text-warning ring ring-inset ring-warning/50' },
    { variant: 'soft', color: 'warning', class: 'bg-warning/10 text-warning' },
    { variant: 'subtle', color: 'warning', class: 'bg-warning/10 text-warning ring ring-inset ring-warning/25' },

    { variant: 'solid', color: 'error', class: 'bg-error text-error-foreground' },
    { variant: 'outline', color: 'error', class: 'text-error ring ring-inset ring-error/50' },
    { variant: 'soft', color: 'error', class: 'bg-error/10 text-error' },
    { variant: 'subtle', color: 'error', class: 'bg-error/10 text-error ring ring-inset ring-error/25' },

    { color: 'primary', class: 'focus-visible:ring-primary/50' },
    { color: 'info', class: 'focus-visible:ring-info/50' },
    { color: 'success', class: 'focus-visible:ring-success/50' },
    { color: 'warning', class: 'focus-visible:ring-warning/50' },
    { color: 'error', class: 'focus-visible:ring-error/50' },

    { size: 'xs', square: true, class: 'p-0.5' },
    { size: 'sm', square: true, class: 'p-1' },
    { size: 'md', square: true, class: 'p-1' },
    { size: 'lg', square: true, class: 'p-1' },
    { size: 'xl', square: true, class: 'p-1' },
  ],
  defaultVariants: {
    variant: 'solid',
    color: 'default',
    size: 'md',
    square: false,
    isLink: false,
  },
})
