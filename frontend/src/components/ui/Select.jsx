export default function Select({
  label,
  name,
  value,
  onChange,
  options = [],
  error,
  required = false,
  disabled = false,
  placeholder,
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

      <select
        id={name}
        name={name}
        value={value}
        onChange={onChange}
        required={required}
        disabled={disabled}
        aria-invalid={error ? 'true' : 'false'}
        aria-describedby={error ? `${name}-error` : undefined}
        className={[
          'w-full rounded-lg border bg-slate-900 px-3 py-2 text-sm text-slate-100 transition focus:border-[var(--primary)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-60',
          error ? 'border-red-500' : 'border-slate-700',
        ].join(' ')}
        {...props}
      >
        {placeholder ? (
          <option value="" disabled>
            {placeholder}
          </option>
        ) : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      {error ? (
        <p id={`${name}-error`} className="mt-1 text-xs text-red-400">
          {error}
        </p>
      ) : null}
    </div>
  )
}
