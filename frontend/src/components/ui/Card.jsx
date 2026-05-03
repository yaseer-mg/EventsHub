export default function Card({
  children,
  title,
  subtitle,
  actions,
  className = '',
  padding = true,
}) {
  const hasHeader = title || subtitle || actions

  return (
    <div
      className={[
        'rounded-xl border border-slate-700 bg-slate-800',
        padding ? 'p-6' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {hasHeader ? (
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            {title ? <h3 className="text-lg font-semibold text-slate-100">{title}</h3> : null}
            {subtitle ? <p className="mt-1 text-sm text-slate-400">{subtitle}</p> : null}
          </div>

          {actions ? <div className="shrink-0">{actions}</div> : null}
        </div>
      ) : null}

      {children}
    </div>
  )
}
