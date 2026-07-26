import React from 'react';
import { cn } from '../../lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = 'text', label, error, helperText, ...props }, ref) => {
    return (
      <div className="w-full flex flex-col gap-1.5 text-left">
        {label && (
          <label className="text-xs font-medium text-[#86868b] select-none">
            {label}
          </label>
        )}
        <input
          type={type}
          ref={ref}
          className={cn(
            'w-full px-3.5 py-2.5 bg-[#09090b]/50 border border-[#27272a] rounded-lg text-sm text-[#f5f5f7] placeholder-[#3f3f46] outline-none transition-all duration-200 focus:border-white/50 focus:ring-1 focus:ring-white/20 disabled:opacity-50 disabled:pointer-events-none shadow-[0_2px_8px_rgba(0,0,0,0.2)]',
            error && 'border-red-500/50 focus:border-red-500 focus:ring-red-500/20',
            className
          )}
          {...props}
        />
        {error && (
          <span className="text-xs text-red-400 font-medium">
            {error}
          </span>
        )}
        {!error && helperText && (
          <span className="text-xs text-[#86868b]">
            {helperText}
          </span>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';
