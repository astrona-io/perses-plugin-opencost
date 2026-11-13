// Copyright The Perses Authors
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { fromZonedTime, toZonedTime } from "date-fns-tz";

export const HOUR_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * HOUR_MS;

/** Steps the plugin picks from when the query does not set one. OpenCost stores hourly data at best. */
export const AUTO_STEPS_MS = [
  HOUR_MS,
  2 * HOUR_MS,
  3 * HOUR_MS,
  6 * HOUR_MS,
  12 * HOUR_MS,
  DAY_MS,
  7 * DAY_MS,
];

/** Most points per series the auto step aims for. */
export const MAX_POINTS = 250;

export const DEFAULT_TIME_ZONE = "UTC";

export interface QueryWindow {
  /** Inclusive start, aligned. */
  start: Date;
  /** Exclusive end, aligned. */
  end: Date;
  /** Step in ms, or undefined when the query accumulates the whole window into one point. */
  stepMs?: number;
}

const DURATION_RE = /^(\d+)(m|h|d|w)$/;

/**
 * Parses the step override. Only whole minutes, hours, days or weeks are accepted (`30m`, `6h`, `1d`, `1w`);
 * anything shorter than an hour is raised to an hour because OpenCost has no finer data.
 */
export function parseStep(step: string | undefined): number | undefined {
  if (!step) return undefined;
  const match = DURATION_RE.exec(step.trim());
  if (!match)
    throw new Error(
      `Invalid step "${step}": use a whole number of m, h, d or w, e.g. 1h or 1d`,
    );
  const n = Number(match[1]);
  const unit = { m: 60 * 1000, h: HOUR_MS, d: DAY_MS, w: 7 * DAY_MS }[
    match[2] as "m" | "h" | "d" | "w"
  ];
  return Math.max(n * unit, HOUR_MS);
}

/** Picks the smallest auto step that keeps the range under MAX_POINTS points and honours the panel's suggestion. */
export function autoStepMs(rangeMs: number, suggestedStepMs?: number): number {
  const wanted = Math.max(suggestedStepMs ?? 0, rangeMs / MAX_POINTS, HOUR_MS);
  return (
    AUTO_STEPS_MS.find((s) => s >= wanted) ??
    AUTO_STEPS_MS[AUTO_STEPS_MS.length - 1]!
  );
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** Start of the calendar day that contains `date`, in `timeZone`. */
export function startOfDayInZone(date: Date, timeZone: string): Date {
  const zoned = toZonedTime(date, timeZone);
  zoned.setHours(0, 0, 0, 0);
  return fromZonedTime(zoned, timeZone);
}

/** Start of the next calendar day after the one containing `date`, in `timeZone`. */
export function startOfNextDayInZone(date: Date, timeZone: string): Date {
  const zoned = toZonedTime(date, timeZone);
  zoned.setHours(0, 0, 0, 0);
  zoned.setDate(zoned.getDate() + 1);
  return fromZonedTime(zoned, timeZone);
}

function floorTo(ms: number, unit: number): number {
  return Math.floor(ms / unit) * unit;
}

function ceilTo(ms: number, unit: number): number {
  return Math.ceil(ms / unit) * unit;
}

/**
 * Turns the dashboard range into the window the plugin asks OpenCost for.
 *
 * - accumulate: one window from the hour at or before `start` to the hour at or after `end`.
 * - steps under a day: start and end move out to whole UTC hours, then the end moves so the window holds a
 *   whole number of steps.
 * - steps of a day or more: start moves back to midnight and end forward to the next midnight in `timeZone`, so
 *   every point is one calendar day (or week) in that zone.
 */
export function alignWindow(
  start: Date,
  end: Date,
  opts: {
    accumulate: boolean;
    stepMs?: number;
    suggestedStepMs?: number;
    timeZone?: string;
  },
): QueryWindow {
  if (end.getTime() <= start.getTime()) {
    throw new Error("The time range is empty: its end is not after its start");
  }
  const timeZone = opts.timeZone || DEFAULT_TIME_ZONE;
  if (!isValidTimeZone(timeZone))
    throw new Error(`Unknown time zone "${timeZone}"`);

  const startMs = floorTo(start.getTime(), HOUR_MS);
  const endMs = ceilTo(end.getTime(), HOUR_MS);
  if (opts.accumulate) {
    return { start: new Date(startMs), end: new Date(endMs) };
  }

  const stepMs =
    opts.stepMs ?? autoStepMs(endMs - startMs, opts.suggestedStepMs);
  if (stepMs >= DAY_MS) {
    const dayStart = startOfDayInZone(start, timeZone);
    let dayEnd = startOfDayInZone(new Date(end.getTime() - 1), timeZone);
    dayEnd = startOfNextDayInZone(dayEnd, timeZone);
    const steps = Math.max(
      1,
      Math.round((dayEnd.getTime() - dayStart.getTime()) / stepMs),
    );
    const roundedEnd = Math.max(
      dayEnd.getTime(),
      dayStart.getTime() + steps * stepMs,
    );
    return { start: dayStart, end: new Date(roundedEnd), stepMs };
  }
  const steps = Math.max(1, Math.ceil((endMs - startMs) / stepMs));
  return {
    start: new Date(startMs),
    end: new Date(startMs + steps * stepMs),
    stepMs,
  };
}

/** RFC 3339 without milliseconds, the form OpenCost's window parser documents. */
export function toRfc3339(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function windowParam(window: QueryWindow): string {
  return `${toRfc3339(window.start)},${toRfc3339(window.end)}`;
}

/** OpenCost takes the step as a Go duration. */
export function stepParam(stepMs: number): string {
  return `${Math.round(stepMs / HOUR_MS)}h`;
}

/**
 * The timestamp a point is drawn at. For day or week steps it is the local midnight of the day that holds the
 * middle of the set, so a 24-hour set that DST pushed off midnight still lands on its calendar day.
 */
export function pointTimestamp(
  setStart: Date,
  setEnd: Date,
  stepMs: number | undefined,
  timeZone: string,
): number {
  if (stepMs === undefined || stepMs < DAY_MS) return setStart.getTime();
  const middle = new Date((setStart.getTime() + setEnd.getTime()) / 2);
  return startOfDayInZone(middle, timeZone).getTime();
}
