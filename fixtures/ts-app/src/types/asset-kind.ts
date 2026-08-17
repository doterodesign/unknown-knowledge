// Asset kinds — planted drift anchor (K-104).
// 'video' exists here but the store's claim omits it: the value validator
// must emit source-value-missing for it (A3, drift direction 2).
export type AssetKind = 'icon' | 'illustration' | 'photo' | 'video';

export interface AssetUpload {
  kind: AssetKind;
  sizeBytes: number;
}
