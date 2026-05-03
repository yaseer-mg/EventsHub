export default function Textarea({
  label,
  name,
  value,
  onChange,
  error,
  rows = 4,
  placeholder,
  required = false,
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

      <textarea
        id={name}
        name={name}
        value={value}
        onChange={onChange}
        rows={rows}
        placeholder={placeholder}
        required={required}
        aria-invalid={error ? 'true' : 'false'}
        aria-describedby={error ? `${name}-error` : undefined}
        className={[
          'w-full rounded-lg border bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 transition focus:border-[var(--primary)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]',
          error ? 'border-red-500' : 'border-slate-700',
        ].join(' ')}
        {...props}
      />

      {error ? (
        <p id={`${name}-error`} className="mt-1 text-xs text-red-400">
          {error}
        </p>
      ) : null}
    </div>
  )
}
