// .tsx anchor — proves ts-object-keys handles the .tsx extension (§5.1:
// kinds describe declaration shape, not file type). The JSX below contains
// inline object literals ({{ color: ... }}) the extractor must NOT match:
// only the named exported symbol's span counts. Concept K-107.
import type { BetStatus } from '../types/bet-status';

export const STATUS_COLORS = {
  open: '#2d7ff9',
  settled: '#1db954',
  voided: '#8a8f98',
  'cashed-out': '#f5a623',
};

export function StatusBadge({ status }: { status: BetStatus }) {
  return (
    <span className="status-badge" style={{ color: STATUS_COLORS[status] }}>
      {status}
    </span>
  );
}
