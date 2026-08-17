// .tsx anchor — proves ts-object-keys handles the .tsx extension (§5.1:
// kinds describe declaration shape, not file type). The JSX below contains
// inline object literals ({{ color: ... }}) the extractor must NOT match:
// only the named exported symbol's span counts. Concept K-107.
import type { ReleaseStatus } from '../types/release-status';

export const STATUS_COLORS = {
  draft: '#8a8f98',
  'in-review': '#2d7ff9',
  published: '#1db954',
  deprecated: '#f5a623',
};

export function StatusBadge({ status }: { status: ReleaseStatus }) {
  return (
    <span className="status-badge" style={{ color: STATUS_COLORS[status] }}>
      {status}
    </span>
  );
}
