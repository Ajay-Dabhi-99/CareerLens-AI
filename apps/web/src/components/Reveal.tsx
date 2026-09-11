import type { ElementType, ReactNode } from 'react';
import { useInView } from '@/hooks/useInView';
import { cn } from '@/lib/utils';

export interface RevealProps {
  children: ReactNode;
  /** Stagger within a group, in milliseconds. */
  delay?: number;
  as?: ElementType;
  className?: string;
}

/**
 * Scroll-triggered entrance. Content is always present in the DOM and readable by
 * assistive tech; only the visual transform is deferred until it scrolls into view.
 */
export function Reveal({ children, delay = 0, as: Tag = 'div', className }: RevealProps) {
  const { ref, inView } = useInView<HTMLDivElement>();

  return (
    <Tag
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={cn(
        'motion-safe:transition-all motion-safe:duration-700 motion-safe:ease-[cubic-bezier(0.16,1,0.3,1)]',
        inView
          ? 'opacity-100 blur-0 translate-y-0'
          : 'motion-safe:opacity-0 motion-safe:translate-y-6',
        className,
      )}
    >
      {children}
    </Tag>
  );
}
