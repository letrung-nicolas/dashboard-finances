import { describe, expect, it } from 'vitest';
import { IdleTimer } from '../src/app/idleLock';
import type { Clock } from '../src/app/idleLock';

/** Horloge manuelle : on avance le temps à la main, comme un navigateur qui se réveille. */
function fakeClock() {
  let time = 0;
  let nextId = 1;
  const timers = new Map<number, { at: number; fn: () => void }>();
  const clock: Clock = {
    now: () => time,
    setTimeout: (fn, ms) => {
      const id = nextId++;
      timers.set(id, { at: time + ms, fn });
      return id;
    },
    clearTimeout: (id) => {
      timers.delete(id);
    },
  };
  return {
    clock,
    /** Avance le temps ; `fire` = faut-il laisser les minuteurs se déclencher (sinon : veille). */
    advance(ms: number, fire = true) {
      time += ms;
      if (!fire) return;
      Array.from(timers.entries()).forEach(([id, t]) => {
        if (t.at <= time) {
          timers.delete(id);
          t.fn();
        }
      });
    },
  };
}

const FIVE_MIN = 5 * 60 * 1000;

describe('verrouillage automatique', () => {
  it('verrouille après 5 minutes sans activité, pas avant', () => {
    const f = fakeClock();
    let locked = 0;
    const timer = new IdleTimer(FIVE_MIN, () => locked++, f.clock);
    timer.start();
    f.advance(FIVE_MIN - 1);
    expect(locked).toBe(0);
    f.advance(1);
    expect(locked).toBe(1);
  });

  it("l'activité repousse le verrouillage", () => {
    const f = fakeClock();
    let locked = 0;
    const timer = new IdleTimer(FIVE_MIN, () => locked++, f.clock);
    timer.start();
    f.advance(FIVE_MIN - 1000);
    timer.touch();
    f.advance(FIVE_MIN - 1000);
    expect(locked).toBe(0);
    f.advance(1000);
    expect(locked).toBe(1);
  });

  it('téléphone mis en veille (minuteurs gelés) : le retour de la page verrouille', () => {
    const f = fakeClock();
    let locked = 0;
    const timer = new IdleTimer(FIVE_MIN, () => locked++, f.clock);
    timer.start();
    f.advance(FIVE_MIN * 3, false); // veille : aucun minuteur ne se déclenche
    expect(locked).toBe(0);
    expect(timer.check()).toBe(true);
    expect(locked).toBe(1);
  });

  it("n'agit plus une fois arrêté, et ne verrouille qu'une fois", () => {
    const f = fakeClock();
    let locked = 0;
    const timer = new IdleTimer(FIVE_MIN, () => locked++, f.clock);
    timer.start();
    timer.stop();
    f.advance(FIVE_MIN * 2);
    expect(locked).toBe(0);
    timer.start();
    f.advance(FIVE_MIN);
    f.advance(FIVE_MIN);
    expect(locked).toBe(1);
  });
});
