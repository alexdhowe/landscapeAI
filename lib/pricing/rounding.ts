export function floorTo(value: number, step: number): number {
  return Math.floor(value / step) * step;
}

export function ceilTo(value: number, step: number): number {
  return Math.ceil(value / step) * step;
}

export function roundTo(value: number, step: number): number {
  return Math.round(value / step) * step;
}
