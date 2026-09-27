export interface SectionScanState {
  url: string;
  arrivedAt: number;
  published: boolean;
  validated: boolean;
}

export function startSectionScan(url: string, now: number): SectionScanState {
  return { url, arrivedAt: now, published: false, validated: false };
}
