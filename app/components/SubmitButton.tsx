'use client';

import { useFormStatus } from 'react-dom';
import { buttonClass, type ButtonVariant } from './ui';
import { Icon, type IconName } from './icons';

export function SubmitButton({
  children,
  variant = 'quiet',
  size = 'md',
  pendingLabel,
  icon,
  className = '',
  confirm,
  disabled,
}: {
  children: React.ReactNode;
  variant?: ButtonVariant;
  size?: 'sm' | 'md' | 'lg';
  pendingLabel?: string;
  icon?: IconName;
  className?: string;
  confirm?: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      aria-busy={pending}
      onClick={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
      className={`${buttonClass(variant, size)} ${className}`}
    >
      {icon && <Icon name={icon} size={size === 'sm' ? 16 : 18} />}
      {pending && pendingLabel ? pendingLabel : children}
    </button>
  );
}
