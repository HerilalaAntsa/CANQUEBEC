import { useState } from 'react';
import styles from './SortableTable.module.css';

/**
 * Tableau générique avec tri par colonne
 * @param {Array} columns - [{ key, label, sortable?, render?, align? }]
 * @param {Array} data    - Tableau d'objets
 * @param {string} defaultSort - Clé de tri par défaut
 * @param {'asc'|'desc'} defaultDir
 * @param {Function} onRowClick - Callback au clic sur une ligne
 */
export default function SortableTable({
  columns,
  data,
  defaultSort,
  defaultDir = 'desc',
  onRowClick,
  rowKey = 'id',
  emptyMessage = 'Aucune donnée',
}) {
  const [sortKey, setSortKey] = useState(defaultSort ?? columns[0]?.key);
  const [sortDir, setSortDir] = useState(defaultDir);

  const handleSort = (key) => {
    if (!columns.find(c => c.key === key)?.sortable) return;
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const sorted = [...data].sort((a, b) => {
    const va = a[sortKey];
    const vb = b[sortKey];
    if (va === undefined || vb === undefined) return 0;
    const cmp = typeof va === 'string'
      ? va.localeCompare(vb, 'fr', { sensitivity: 'base' })
      : va - vb;
    return sortDir === 'asc' ? cmp : -cmp;
  });

  return (
    <div className={styles.wrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            {columns.map(col => (
              <th
                key={col.key}
                className={`${styles.th} ${col.sortable ? styles.sortable : ''} ${col.align === 'right' ? styles.right : ''}`}
                onClick={() => col.sortable && handleSort(col.key)}
                title={col.sortable ? `Trier par ${col.label}` : undefined}
              >
                {col.label}
                {col.sortable && sortKey === col.key && (
                  <span className={styles.sortIcon}>
                    {sortDir === 'asc' ? ' ↑' : ' ↓'}
                  </span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className={styles.empty}>
                {emptyMessage}
              </td>
            </tr>
          ) : (
            sorted.map((row, i) => (
              <tr
                key={row[rowKey] ?? i}
                className={`${styles.tr} ${onRowClick ? styles.clickable : ''}`}
                onClick={() => onRowClick?.(row)}
              >
                {columns.map(col => (
                  <td
                    key={col.key}
                    className={`${styles.td} ${col.align === 'right' ? styles.right : ''} ${col.highlight ? styles.highlight : ''}`}
                  >
                    {col.render ? col.render(row[col.key], row) : (row[col.key] ?? '—')}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
