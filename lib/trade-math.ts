export type Contract = "MNQ" | "NQ";
export type Direction = "做多" | "做空";

export const POINT_VALUE_USD: Record<Contract, number> = { MNQ: 2, NQ: 20 };
export const TICK_SIZE = 0.25;

export function isValidPrice(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 && value < 1_000_000
    && Math.abs(value * 4 - Math.round(value * 4)) < 1e-7;
}

export function isValidQuantity(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 1000;
}

export function plannedPoints(direction: Direction, entry: number, target: number, stop: number) {
  return direction === "做多"
    ? { reward: target - entry, risk: entry - stop }
    : { reward: entry - target, risk: stop - entry };
}

export function grossPnlUsd(direction: Direction, entry: number, exit: number, contract: Contract, quantity: number) {
  const points = direction === "做多" ? exit - entry : entry - exit;
  return Math.round(points * POINT_VALUE_USD[contract] * quantity * 100) / 100;
}

export function plannedUsd(points: number, contract: Contract, quantity: number) {
  return Math.round(points * POINT_VALUE_USD[contract] * quantity * 100) / 100;
}

export function nqEquivalentContracts(contract: Contract, quantity: number) {
  return contract === "MNQ" ? quantity / 10 : quantity;
}
