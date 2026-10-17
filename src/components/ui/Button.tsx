import { forwardRef, type ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'md' | 'lg';

const VARIANT: Record<Variant, string> = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  ghost: 'btn-ghost',
  danger: 'btn-danger',
};

/** md = 44px / 15px · lg = 56px / 17px (botão principal no celular). */
const SIZE: Record<Size, string> = {
  md: 'min-h-[44px] px-4 py-0 text-[15px]',
  lg: 'min-h-[56px] px-5 py-0 text-[17px]',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  block?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', block = false, className = '', type = 'button', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={`${VARIANT[variant]} ${SIZE[size]} rounded-md disabled:cursor-not-allowed disabled:opacity-50 ${block ? 'w-full' : ''} ${className}`}
      {...props}
    />
  );
});
