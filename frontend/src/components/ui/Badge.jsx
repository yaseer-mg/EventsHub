const variants = {
  success: 'border-emerald-500/30 bg-emerald-500/20 text-emerald-400',
  warning: 'border-amber-500/30 bg-amber-500/20 text-amber-400',
  danger: 'border-red-500/30 bg-red-500/20 text-red-400',
  info: 'border-blue-500/30 bg-blue-500/20 text-blue-400',
  neutral: 'border-slate-600 bg-slate-700 text-slate-400',
  primary: 'border-[color-mix(in_srgb,var(--primary)_30%,transparent)] bg-[color-mix(in_srgb,var(--primary)_20%,transparent)] text-[var(--primary)]',
}

const sizes = {
  sm: 'px-2.5 py-0.5 text-xs',
  md: 'px-3 py-1 text-sm',
}

export default function Badge({ children, variant = 'neutral', size = 'sm' }) {
  return (
    <span
      className={[
        'inline-flex items-center rounded-full border font-medium',
        variants[variant] ?? variants.neutral,
        sizes[size] ?? sizes.sm,
      ].join(' ')}
    >
      {children}
    </span>
  )
}
