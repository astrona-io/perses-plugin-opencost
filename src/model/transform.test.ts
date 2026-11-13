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

import type { TransformOptions } from "./transform";
import { buildRequestAggregate, buildSeries, splitKey } from "./transform";
import type { OpenCostAllocation, OpenCostAllocationSet } from "./types";
import { DAY_MS, HOUR_MS } from "./window";

const START = new Date("2026-03-10T00:00:00Z");

function alloc(
  name: string,
  totalCost: number,
  extra: Partial<OpenCostAllocation> = {},
): OpenCostAllocation {
  return {
    name,
    start: START.toISOString(),
    end: START.toISOString(),
    totalCost,
    ...extra,
  };
}

function opts(partial: Partial<TransformOptions> = {}): TransformOptions {
  const aggregate = partial.aggregate ?? ["label:team", "namespace"];
  const sharing = {
    sharedNamespaces: partial.sharedNamespaces ?? [],
    sharedLabels: partial.sharedLabels ?? [],
    shareSplit: partial.shareSplit ?? "weighted",
  };
  return {
    ...sharing,
    aggregate,
    requestAggregate:
      partial.requestAggregate ?? buildRequestAggregate(aggregate, sharing),
    costType: "totalCost",
    timeZone: "UTC",
    windowStart: START,
    windowEnd: new Date(START.getTime() + DAY_MS),
    ...partial,
  };
}

function totalOf(series: ReturnType<typeof buildSeries>, index = 0): number {
  return series.reduce((sum, s) => sum + (s.values[index]?.[1] ?? 0), 0);
}

describe("splitKey", () => {
  it("splits multi-property keys and keeps single ones whole", () => {
    expect(splitKey("payments/api", ["label:team", "namespace"])).toEqual([
      "payments",
      "api",
    ]);
    expect(splitKey("a/b", ["annotation:path"])).toEqual(["a/b"]);
  });

  it("marks every dimension of an idle key as idle", () => {
    expect(splitKey("__idle__", ["label:team", "namespace"])).toEqual([
      "__idle__",
      "__idle__",
    ]);
  });

  it("falls back to the whole key when the part count does not match", () => {
    expect(splitKey("x/y/z", ["label:team", "namespace"])).toEqual([
      "x/y/z",
      "__unallocated__",
    ]);
  });
});

describe("buildRequestAggregate", () => {
  it("adds the properties sharing needs, once", () => {
    expect(
      buildRequestAggregate(["label:team"], {
        sharedNamespaces: ["kube-system"],
        sharedLabels: [{ key: "tier", value: "shared" }],
        shareSplit: "even",
      }),
    ).toEqual(["label:team", "namespace", "label:tier"]);
    expect(
      buildRequestAggregate(["namespace"], {
        sharedNamespaces: ["kube-system"],
        sharedLabels: [],
        shareSplit: "even",
      }),
    ).toEqual(["namespace"]);
  });
});

describe("buildSeries", () => {
  it("returns no series for an empty response", () => {
    expect(buildSeries([], opts())).toEqual([]);
    expect(buildSeries([{}], opts())).toEqual([]);
    expect(buildSeries([null], opts())).toEqual([]);
  });

  it("writes each dimension as a label and names the series after the values", () => {
    const set: OpenCostAllocationSet = {
      "payments/api": alloc("payments/api", 3),
      "search/web": alloc("search/web", 5),
    };
    const series = buildSeries([set], opts());
    expect(series.map((s) => s.name)).toEqual([
      "search / web",
      "payments / api",
    ]);
    expect(series[1]!.labels).toEqual({ team: "payments", namespace: "api" });
    expect(series[1]!.values).toEqual([[START.getTime(), 3]]);
  });

  it("reads component costs with their adjustments and treats null as zero", () => {
    const set = {
      api: alloc("api", 10, {
        cpuCost: 2,
        cpuCostAdjustment: 0.5,
        ramCost: null,
        pvCost: 1,
        networkCost: undefined,
      }),
    };
    const cpu = buildSeries(
      [set],
      opts({ aggregate: ["namespace"], costType: "cpuCost" }),
    );
    expect(cpu[0]!.values[0]![1]).toBe(2.5);
    const ram = buildSeries(
      [set],
      opts({ aggregate: ["namespace"], costType: "ramCost" }),
    );
    expect(ram[0]!.values[0]![1]).toBe(0);
  });

  it("weights efficiency by CPU and RAM cost", () => {
    const set = {
      "a/x": alloc("a/x", 4, { cpuCost: 1, ramCost: 1, totalEfficiency: 0.2 }),
      "a/y": alloc("a/y", 4, { cpuCost: 3, ramCost: 3, totalEfficiency: 0.6 }),
    };
    const series = buildSeries(
      [set],
      opts({
        aggregate: ["label:team"],
        requestAggregate: ["label:team", "namespace"],
        costType: "efficiency",
      }),
    );
    expect(series[0]!.values[0]![1]).toBeCloseTo(0.5);
  });

  it("labels the idle series as idle in every dimension", () => {
    const set = {
      "payments/api": alloc("payments/api", 3),
      __idle__: alloc("__idle__", 7),
    };
    const series = buildSeries([set], opts());
    const idle = series.find((s) => s.name === "__idle__")!;
    expect(idle.labels).toEqual({ team: "__idle__", namespace: "__idle__" });
  });

  it("gives the idle share of the total with idleOnly and fractionOfTotal", () => {
    const set = {
      "payments/api": alloc("payments/api", 3),
      __idle__: alloc("__idle__", 1),
    };
    const series = buildSeries(
      [set],
      opts({ idleOnly: true, fractionOfTotal: true }),
    );
    expect(series).toHaveLength(1);
    expect(series[0]!.values[0]![1]).toBeCloseTo(0.25);
  });

  describe("shared cost", () => {
    const set: OpenCostAllocationSet = {
      "payments/api": alloc("payments/api", 30),
      "search/web": alloc("search/web", 10),
      "platform/kube-system": alloc("platform/kube-system", 20),
      __idle__: alloc("__idle__", 5),
    };

    it("splits shared namespaces by weight and keeps the total", () => {
      const series = buildSeries(
        [set],
        opts({ aggregate: ["label:team"], sharedNamespaces: ["kube-system"] }),
      );
      const byName = Object.fromEntries(
        series.map((s) => [s.name, s.values[0]![1]]),
      );
      expect(byName).toEqual({ payments: 45, search: 15, __idle__: 5 });
      expect(totalOf(series)).toBe(65);
    });

    it("splits evenly when asked", () => {
      const series = buildSeries(
        [set],
        opts({
          aggregate: ["label:team"],
          sharedNamespaces: ["kube-system"],
          shareSplit: "even",
        }),
      );
      const byName = Object.fromEntries(
        series.map((s) => [s.name, s.values[0]![1]]),
      );
      expect(byName).toEqual({ payments: 40, search: 20, __idle__: 5 });
    });

    it("shares by label too", () => {
      // Keys follow the request order: namespace, then the shared label.
      const byNamespace: OpenCostAllocationSet = {
        "api/payments": alloc("api/payments", 30),
        "web/search": alloc("web/search", 10),
        "kube-system/platform": alloc("kube-system/platform", 20),
        __idle__: alloc("__idle__", 5),
      };
      const series = buildSeries(
        [byNamespace],
        opts({
          aggregate: ["namespace"],
          sharedLabels: [{ key: "team", value: "platform" }],
          shareSplit: "even",
        }),
      );
      const byName = Object.fromEntries(
        series.map((s) => [s.name, s.values[0]![1]]),
      );
      expect(byName).toEqual({ api: 40, web: 20, __idle__: 5 });
    });

    it("falls back to an even split when every recipient costs nothing", () => {
      const zero = {
        "a/x": alloc("a/x", 0),
        "b/y": alloc("b/y", 0),
        "c/kube-system": alloc("c/kube-system", 8),
      };
      const series = buildSeries(
        [zero],
        opts({ aggregate: ["label:team"], sharedNamespaces: ["kube-system"] }),
      );
      expect(series.map((s) => s.values[0]![1])).toEqual([4, 4]);
    });

    it("keeps shared cost as __shared__ when nothing else is left", () => {
      const only = { "platform/kube-system": alloc("platform/kube-system", 8) };
      const series = buildSeries(
        [only],
        opts({ sharedNamespaces: ["kube-system"] }),
      );
      expect(series).toHaveLength(1);
      expect(series[0]!.name).toBe("__shared__ / __shared__");
      expect(series[0]!.values[0]![1]).toBe(8);
    });
  });

  it("places step sets at their window start and fills gaps with zero", () => {
    const t0 = START.toISOString();
    const t1 = new Date(START.getTime() + HOUR_MS).toISOString();
    const t2 = new Date(START.getTime() + 2 * HOUR_MS).toISOString();
    const w = (s: string, e: string) => ({ window: { start: s, end: e } });
    const sets: OpenCostAllocationSet[] = [
      { api: alloc("api", 1, w(t0, t1)), web: alloc("web", 2, w(t0, t1)) },
      { api: alloc("api", 3, w(t1, t2)) },
    ];
    const series = buildSeries(
      sets,
      opts({ aggregate: ["namespace"], stepMs: HOUR_MS }),
    );
    const web = series.find((s) => s.name === "web")!;
    expect(web.values).toEqual([
      [START.getTime(), 2],
      [START.getTime() + HOUR_MS, 0],
    ]);
  });

  it("uses the set position when allocations carry no window", () => {
    const sets: OpenCostAllocationSet[] = [
      { api: alloc("api", 1) },
      { api: alloc("api", 2) },
    ];
    const series = buildSeries(
      sets,
      opts({ aggregate: ["namespace"], stepMs: HOUR_MS }),
    );
    expect(series[0]!.values.map((v) => v[0])).toEqual([
      START.getTime(),
      START.getTime() + HOUR_MS,
    ]);
  });

  it("handles large responses", () => {
    const steps = 48;
    const sets: OpenCostAllocationSet[] = [];
    let expected = 0;
    for (let i = 0; i < steps; i++) {
      const set: OpenCostAllocationSet = {};
      for (let k = 0; k < 2000; k++) {
        const cost = (k % 17) / 10;
        expected += cost;
        set[`team-${k % 40}/ns-${k}`] = alloc(`team-${k % 40}/ns-${k}`, cost);
      }
      sets.push(set);
    }
    const started = Date.now();
    const series = buildSeries(sets, opts({ stepMs: HOUR_MS }));
    expect(Date.now() - started).toBeLessThan(5000);
    expect(series).toHaveLength(2000);
    const sum = series.reduce(
      (acc, s) => acc + s.values.reduce((a, v) => a + (v[1] ?? 0), 0),
      0,
    );
    expect(sum).toBeCloseTo(expected, 6);
  });
});
