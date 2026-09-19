import { cva } from 'class-variance-authority';
import { cn } from '../../lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors',
  {
    variants: {
      variant: {
        default:  'bg-blue-500 text-white',
        success:  'bg-green-500 text-white',
        warning:  'bg-amber-500 text-white',
        danger:   'bg-red-500 text-white',
        muted:    'bg-[#373c3f] text-gray-300',
        outline:  'border border-[#4b5563] text-gray-300',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export function Badge({ className, variant, children, ...props }) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props}>
      {children}
    </span>
  );
}
