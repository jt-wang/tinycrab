import { cn } from '@/lib/utils';

interface CrabIconProps {
  className?: string;
}

export function CrabIcon({ className }: CrabIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={cn('w-6 h-6', className)}
    >
      {/* Compact crab icon for header/nav */}
      {/* Body */}
      <ellipse cx="12" cy="14" rx="7" ry="5" />
      {/* Left claw */}
      <path d="M3 10c-1-1.5-1-3 .5-4s3 0 3.5 1.5L5 9c-.3-.5-1-.7-1.5-.5s-.3 1 0 1.5H3z" />
      {/* Right claw */}
      <path d="M21 10c1-1.5 1-3-.5-4s-3 0-3.5 1.5L19 9c.3-.5 1-.7 1.5-.5s.3 1 0 1.5h.5z" />
      {/* Eyes */}
      <circle cx="10" cy="12" r="1" fill="white" />
      <circle cx="14" cy="12" r="1" fill="white" />
      <circle cx="10" cy="12" r="0.5" fill="black" />
      <circle cx="14" cy="12" r="0.5" fill="black" />
      {/* Legs left */}
      <line x1="6" y1="15" x2="2" y2="18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="6" y1="17" x2="3" y2="20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      {/* Legs right */}
      <line x1="18" y1="15" x2="22" y2="18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="18" y1="17" x2="21" y2="20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
