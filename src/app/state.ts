import { PLANES, type Plane } from '../math/rotation';
import type { RenderMode } from '../render/tesseractView';

export interface PlaneSetting {
  enabled: boolean;
  /** radians per second */
  rate: number;
}

export interface Settings {
  paused: boolean;
  speed: number;
  /** distance of the 4D eye from the w = 0 hyperplane */
  distance: number;
  planes: Record<Plane, PlaneSetting>;
  mode: RenderMode;
  showVertices: boolean;
  showEdges: boolean;
}

/**
 * A vertex of the tesseract lies at 4D radius 2, so after rotation its w
 * can reach 2. The eye must stay strictly beyond that.
 */
export const MIN_DISTANCE = 2.4;
export const MAX_DISTANCE = 8;

export function defaultSettings(): Settings {
  return {
    paused: false,
    speed: 1,
    distance: 3,
    planes: {
      xy: { enabled: false, rate: 0.2 },
      xz: { enabled: false, rate: 0.2 },
      xw: { enabled: true, rate: 0.42 },
      yz: { enabled: false, rate: 0.2 },
      yw: { enabled: true, rate: 0.26 },
      zw: { enabled: true, rate: 0.16 },
    },
    mode: 'solid',
    showVertices: true,
    showEdges: true,
  };
}

export function assignSettings(target: Settings, source: Settings): void {
  const { planes, ...rest } = source;
  Object.assign(target, rest);
  for (const p of PLANES) Object.assign(target.planes[p], planes[p]);
}
