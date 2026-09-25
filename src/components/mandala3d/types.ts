export type MandalaRingLayer = 'seed' | 'tensor' | 'triton' | 'evaluation';

export interface MandalaMetric {
  label: string;
  value: string;
  status?: 'optimal' | 'warning' | 'critical';
}

export interface MandalaNode3D {
  id: string;
  name: string;
  subtitle: string;
  layer: MandalaRingLayer;
  ringRadius: number;
  angleDeg: number;
  elevation: number;
  color: string;
  glowColor: string;
  status: 'active' | 'synced' | 'idle';
  description: string;
  metrics: MandalaMetric[];
  parameters: Record<string, string | number | boolean>;
  logs: string[];
}

export interface MandalaEdge3D {
  id: string;
  source: string;
  target: string;
  color: string;
  type: 'radial' | 'cross' | 'link';
}

