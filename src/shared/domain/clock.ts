export type NowFn = () => number;

let nowFn: NowFn = () => Date.now();

export const clock = {
  now(): number {
    return nowFn();
  },
  nowIso(): string {
    return new Date(nowFn()).toISOString();
  },
  setNow(fn: NowFn): void {
    nowFn = fn;
  },
  reset(): void {
    nowFn = () => Date.now();
  },
};
