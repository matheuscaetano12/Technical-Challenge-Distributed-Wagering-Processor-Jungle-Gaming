import type { Clock } from '../domain/clock.port';

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}