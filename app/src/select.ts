import { C, PRI } from './theme';
import type { Need } from './types';
import { remaining, pct } from './data';

export interface EnrichedNeed extends Need {
  remaining: number;
  pctVal: number;
  done: boolean;
  barColor: string;
}

export function enrich(n: Need): EnrichedNeed {
  const rem = remaining(n);
  const done = rem === 0;
  return { ...n, remaining: rem, pctVal: pct(n), done, barColor: done ? C.success : (PRI[n.priority] ?? PRI.Normal).bar };
}

export function enrichSorted(needs: Need[]): EnrichedNeed[] {
  return needs.map(enrich).sort((a, b) => (PRI[a.priority] ?? PRI.Normal).rank - (PRI[b.priority] ?? PRI.Normal).rank);
}

// Responsive column templates — driven by the device toggle, mirroring the prototype.
export function cols(mob: boolean) {
  return {
    card: mob ? '1fr' : 'repeat(auto-fit, minmax(300px, 1fr))',
    need: mob ? '1fr' : 'repeat(auto-fill, minmax(310px, 1fr))',
    stat: mob ? 'repeat(2, minmax(0,1fr))' : 'repeat(auto-fit, minmax(150px, 1fr))',
    two: mob ? '1fr' : 'repeat(auto-fit, minmax(320px, 1fr))',
    form: mob ? '1fr' : 'repeat(2, minmax(0,1fr))',
    heroPad: mob ? '20px' : '30px',
    h1: mob ? 32 : 44,
    h2: mob ? 24 : 30,
  };
}
