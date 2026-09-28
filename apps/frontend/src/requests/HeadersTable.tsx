import type { HeaderRecord } from '@proxy-moxy/shared';

export function HeadersTable({ headers }: { headers: HeaderRecord }) {
  const entries = Object.entries(headers);
  if (entries.length === 0) return <p className="hint">No headers</p>;
  return (
    <table className="headers">
      <tbody>
        {entries.map(([name, value]) => (
          <tr key={name}>
            <td>{name}</td>
            <td>{Array.isArray(value) ? value.join(', ') : value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
