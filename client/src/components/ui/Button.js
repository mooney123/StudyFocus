import { cva } from 'class-variance-authority';
import { cn } from '../../lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default:   'bg-blue-500 text-white hover:bg-blue-400',
        secondary: 'bg-[#2f3437] text-white hover:bg-[#373c3f] border border-[#4b5563]',
        ghost:     'hover:bg-[#373c3f] text-gray-300 hover:text-white',
        danger:    'bg-red-500 text-white hover:bg-red-600',
        success:   'bg-green-500 text-white hover:bg-green-600',
        outline:   'border border-[#4b5563] text-white hover:bg-[#373c3f]',
      },
      size: {
        sm:   'h-8 px-3 text-xs',
        md:   'h-9 px-4',
        lg:   'h-10 px-6 text-base',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'md',
    },
  }
);

export function Button({ className, variant, size, children, ...props }) {
  return (
    <button className={cn(buttonVariants({ variant, size }), className)} {...props}>
      {children}
    </button>
  );
}
