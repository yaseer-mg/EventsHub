const sizes = {
  sm: {
    track: 'h-5 w-9',
    thumb: 'h-4 w-4',
    translate: 'translate-x-4',
  },
  md: {
    track: 'h-6 w-11',
    thumb: 'h-5 w-5',
    translate: 'translate-x-5',
  },
  lg: {
    track: 'h-7 w-14',
    thumb: 'h-6 w-6',
    translate: 'translate-x-7',
  },
}

export default function Toggle({ checked = false, onChange, disabled = false, size = 'md', label }) {
  const currentSize = sizes[size] ?? sizes.md

  return (
    <label className="inline-flex items-center gap-3">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange?.(!checked)}
        className={[
          'relative inline-flex shrink-0 rounded-full p-0.5 transition-colors duration-200 ease-in-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-60',
          currentSize.track,
          checked ? 'bg-[var(--primary)]' : 'bg-slate-600',
        ].join(' ')}
      >
        <span
          className={[
            'inline-block rounded-full bg-white shadow transition-transform duration-200 ease-in-out',
            currentSize.thumb,
            checked ? currentSize.translate : 'translate-x-0',
          ].join(' ')}
        />
      </button>

      {label ? <span className="text-sm font-medium text-slate-300">{label}</span> : null}
    </label>
  )
}
