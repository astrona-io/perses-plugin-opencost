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

import {
  alignWindow,
  autoStepMs,
  DAY_MS,
  HOUR_MS,
  parseStep,
  pointTimestamp,
  startOfDayInZone,
  stepParam,
  windowParam,
} from "./window";

const d = (iso: string): Date => new Date(iso);

describe("parseStep", () => {
  it("reads whole units and raises sub-hour steps to an hour", () => {
    expect(parseStep("6h")).toBe(6 * HOUR_MS);
    expect(parseStep("1d")).toBe(DAY_MS);
    expect(parseStep("1w")).toBe(7 * DAY_MS);
    expect(parseStep("15m")).toBe(HOUR_MS);
    expect(parseStep(undefined)).toBeUndefined();
    expect(parseStep("")).toBeUndefined();
  });

  it("rejects anything else", () => {
    expect(() => parseStep("1.5h")).toThrow(/Invalid step/);
    expect(() => parseStep("1y")).toThrow(/Invalid step/);
  });
});

describe("autoStepMs", () => {
  it("uses an hour for short ranges", () => {
    expect(autoStepMs(6 * HOUR_MS)).toBe(HOUR_MS);
  });

  it("keeps a 30-day range under 250 points", () => {
    expect(autoStepMs(30 * DAY_MS)).toBe(3 * HOUR_MS);
  });

  it("honours the panel suggestion", () => {
    expect(autoStepMs(2 * DAY_MS, 5 * HOUR_MS)).toBe(6 * HOUR_MS);
  });

  it("falls back to a week for very long ranges", () => {
    expect(autoStepMs(10 * 365 * DAY_MS)).toBe(7 * DAY_MS);
  });
});

describe("alignWindow", () => {
  it("rounds an accumulate window out to whole hours", () => {
    const w = alignWindow(
      d("2026-03-10T10:20:00Z"),
      d("2026-03-11T10:20:00Z"),
      { accumulate: true },
    );
    expect(w).toEqual({
      start: d("2026-03-10T10:00:00Z"),
      end: d("2026-03-11T11:00:00Z"),
    });
    expect(windowParam(w)).toBe("2026-03-10T10:00:00Z,2026-03-11T11:00:00Z");
  });

  it("makes hourly windows a whole number of steps", () => {
    const w = alignWindow(
      d("2026-03-10T10:20:00Z"),
      d("2026-03-10T17:05:00Z"),
      { accumulate: false, stepMs: 3 * HOUR_MS },
    );
    expect(w.start).toEqual(d("2026-03-10T10:00:00Z"));
    expect(w.end).toEqual(d("2026-03-10T19:00:00Z"));
    expect(stepParam(w.stepMs!)).toBe("3h");
  });

  it("aligns day steps to UTC midnight by default", () => {
    const w = alignWindow(
      d("2026-03-03T13:00:00Z"),
      d("2026-03-10T13:00:00Z"),
      { accumulate: false, stepMs: DAY_MS },
    );
    expect(w.start).toEqual(d("2026-03-03T00:00:00Z"));
    expect(w.end).toEqual(d("2026-03-11T00:00:00Z"));
    expect(stepParam(w.stepMs!)).toBe("24h");
  });

  it("does not add a day when the end is already midnight", () => {
    const w = alignWindow(
      d("2026-03-03T00:00:00Z"),
      d("2026-03-10T00:00:00Z"),
      { accumulate: false, stepMs: DAY_MS },
    );
    expect(w.end).toEqual(d("2026-03-10T00:00:00Z"));
  });

  it("aligns day steps to midnight in the query time zone", () => {
    const w = alignWindow(
      d("2026-02-03T13:00:00Z"),
      d("2026-02-05T13:00:00Z"),
      {
        accumulate: false,
        stepMs: DAY_MS,
        timeZone: "Europe/Copenhagen",
      },
    );
    // Copenhagen is UTC+1 in February.
    expect(w.start).toEqual(d("2026-02-02T23:00:00Z"));
    expect(w.end).toEqual(d("2026-02-05T23:00:00Z"));
  });

  it("handles a range that crosses the spring DST change", () => {
    // 2026-03-29 is 23 hours long in Copenhagen.
    const w = alignWindow(
      d("2026-03-28T12:00:00Z"),
      d("2026-03-30T12:00:00Z"),
      {
        accumulate: false,
        stepMs: DAY_MS,
        timeZone: "Europe/Copenhagen",
      },
    );
    expect(w.start).toEqual(d("2026-03-27T23:00:00Z"));
    // Local midnight after the change is 22:00 UTC; the window grows to three whole 24h steps.
    expect(w.end.getTime() - w.start.getTime()).toBe(3 * DAY_MS);
  });

  it("handles a range that crosses the autumn DST change", () => {
    // 2026-10-25 is 25 hours long in Copenhagen.
    const w = alignWindow(
      d("2026-10-24T12:00:00Z"),
      d("2026-10-26T12:00:00Z"),
      {
        accumulate: false,
        stepMs: DAY_MS,
        timeZone: "Europe/Copenhagen",
      },
    );
    expect(w.start).toEqual(d("2026-10-23T22:00:00Z"));
    expect(w.end).toEqual(d("2026-10-26T23:00:00Z"));
  });

  it("rejects an empty range and an unknown time zone", () => {
    expect(() =>
      alignWindow(d("2026-03-10T00:00:00Z"), d("2026-03-10T00:00:00Z"), {
        accumulate: true,
      }),
    ).toThrow(/empty/);
    expect(() =>
      alignWindow(d("2026-03-10T00:00:00Z"), d("2026-03-11T00:00:00Z"), {
        accumulate: false,
        timeZone: "Mars/Olympus",
      }),
    ).toThrow(/Unknown time zone/);
  });
});

describe("pointTimestamp", () => {
  it("uses the set start for hourly steps and accumulate", () => {
    expect(
      pointTimestamp(
        d("2026-03-10T10:00:00Z"),
        d("2026-03-10T11:00:00Z"),
        HOUR_MS,
        "UTC",
      ),
    ).toBe(d("2026-03-10T10:00:00Z").getTime());
    expect(
      pointTimestamp(
        d("2026-03-10T10:00:00Z"),
        d("2026-03-12T10:00:00Z"),
        undefined,
        "UTC",
      ),
    ).toBe(d("2026-03-10T10:00:00Z").getTime());
  });

  it("puts a 24h set DST pushed off midnight on its calendar day", () => {
    // After spring forward a 24h step from 23:00Z runs 01:00 to 01:00 local; it still belongs to 30 March.
    const ts = pointTimestamp(
      d("2026-03-29T23:00:00Z"),
      d("2026-03-30T23:00:00Z"),
      DAY_MS,
      "Europe/Copenhagen",
    );
    expect(ts).toBe(
      startOfDayInZone(
        d("2026-03-30T12:00:00Z"),
        "Europe/Copenhagen",
      ).getTime(),
    );
    expect(new Date(ts).toISOString()).toBe("2026-03-29T22:00:00.000Z");
  });
});
