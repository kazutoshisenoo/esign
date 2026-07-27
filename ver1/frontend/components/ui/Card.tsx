import React from 'react';
import { cn } from '../../lib/utils';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  hoverEffect?: boolean;
}

export const Card: React.FC<CardProps> = ({ className, hoverEffect = false, children, ...props }) => {
  return (
    <div
      className={cn(
        'bg-[#121214]/65 backdrop-blur-lg border border-white/5 rounded-xl shadow-2xl overflow-hidden transition-all duration-300',
        hoverEffect && 'hover:bg-[#121214]/80 hover:border-white/10 hover:shadow-[0_20px_40px_-15px_rgba(0,0,0,0.7)]',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
};

export const CardHeader: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className, children, ...props }) => (
  <div className={cn('px-6 py-5 border-b border-white/5', className)} {...props}>
    {children}
  </div>
);

export const CardContent: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className, children, ...props }) => (
  <div className={cn('p-6', className)} {...props}>
    {children}
  </div>
);

export const CardFooter: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className, children, ...props }) => (
  <div className={cn('px-6 py-4 bg-[#09090b]/30 border-t border-white/5 flex items-center justify-end gap-3', className)} {...props}>
    {children}
  </div>
);
