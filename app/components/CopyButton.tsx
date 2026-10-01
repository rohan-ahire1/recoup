'use client';

import { useState } from 'react';
import { Icon } from './icons';
import { buttonClass, type ButtonVariant } from './ui';

export function CopyButton({
  text,
  label = 'Copy',
  variant = 'quiet',
  size = 'md',
  onCopied,
  className = '',
}: {
  text: string;
  label?: string;
  variant?: ButtonVariant;
  size?: 'sm' | 'md';
  onCopied?: () => void;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={`${buttonClass(variant, size)} ${className}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          onCopied?.();
          setTimeout(() => setCopied(false), 1600);
        } catch {
          window.prompt('Copy this text', text);
        }
      }}
    >
      <Icon name={copied ? 'check' : 'copy'} size={size === 'sm' ? 16 : 18} />
      <span aria-live="polite">{copied ? 'Copied' : label}</span>
    </button>
  );
}
