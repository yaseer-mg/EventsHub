export default function Input({
  label,
  name,
  type = 'text',
  placeholder,
  value,
  onChange,
  error,
  required = false,
  icon,
  disabled = false,
  hint,
  className = '',
  ...props
}) {
  return (
    <div className={className}>
      {label ? (
        <label htmlFor={name} className="mb-1 block text-sm font-medium text-slate-300">
          {label}
          {required ? <span className="ml-1 text-red-400">*</span> : null}
        </label>
      ) : null}

      <div className="relative">
        {icon ? (
          <span className="pointer-events-none absolute left-3 top-1/2 flex -translate-y-1/2 items-center text-slate-500">
            {icon}
          </span>
        ) : null}

        <input
          id={name}
          name={name}
          type={type}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          required={required}
          disabled={disabled}
          aria-invalid={error ? 'true' : 'false'}
          aria-describedby={
            error ? `${name}-error` : hint ? `${name}-hint` : undefined
          }
          className={[
            'w-full rounded-lg border bg-slate-900 py-2 text-sm text-slate-100 placeholder:text-slate-500 transition focus:border-[var(--primary)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-60',
            icon ? 'pl-10 pr-3' : 'px-3',
            error ? 'border-red-500' : 'border-slate-700',
          ].join(' ')}
          {...props}
        />
      </div>

      {error ? (
        <p id={`${name}-error`} className="mt-1 text-xs text-red-400">
          {error}
        </p>
      ) : hint ? (
        <p id={`${name}-hint`} className="mt-1 text-xs text-slate-500">
          {hint}
        </p>
      ) : null}
    </div>
  )
}
