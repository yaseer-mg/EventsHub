import EmptyState from '../shared/EmptyState'
import LoadingSpinner from '../shared/LoadingSpinner'

export default function Table({
  columns = [],
  data = [],
  loading = false,
  emptyMessage = 'No records found',
  emptyIcon,
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-700 bg-slate-800">
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-900 text-xs uppercase text-slate-400">
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className={['px-4 py-3 font-semibold', column.className].filter(Boolean).join(' ')}
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>

          {!loading && data.length > 0 ? (
            <tbody className="divide-y divide-slate-700 text-slate-100">
              {data.map((row, rowIndex) => (
                <tr
                  key={row.id ?? row.key ?? rowIndex}
                  className="border-b border-slate-700 transition last:border-b-0 hover:bg-slate-700/50"
                >
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      className={['px-4 py-3', column.className].filter(Boolean).join(' ')}
                    >
                      {column.render ? column.render(row, rowIndex) : row[column.key]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          ) : null}
        </table>
      </div>

      {loading ? (
        <div className="flex justify-center px-6 py-12">
          <LoadingSpinner />
        </div>
      ) : null}

      {!loading && data.length === 0 ? (
        <div className="px-6 py-10">
          <EmptyState title={emptyMessage} icon={emptyIcon} />
        </div>
      ) : null}
    </div>
  )
}
