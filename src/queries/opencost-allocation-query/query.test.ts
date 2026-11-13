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

import type { TimeSeriesQueryContext } from "@perses-dev/plugin-system";

import type { OpenCostClient } from "../../model/client";
import type {
  OpenCostAllocationParams,
  OpenCostAllocationResponse,
} from "../../model/types";
import { expandList, getOpenCostTimeSeriesData } from "./query";

function context(
  client: OpenCostClient,
  variableState = {},
): TimeSeriesQueryContext {
  return {
    timeRange: {
      start: new Date("2026-03-01T00:00:00Z"),
      end: new Date("2026-03-08T00:00:00Z"),
    },
    suggestedStepMs: 24 * 60 * 60 * 1000,
    variableState,
    datasourceStore: {
      listDatasourceSelectItems: jest.fn().mockResolvedValue([]),
      getDatasourceClient: jest.fn().mockResolvedValue(client),
    },
  } as unknown as TimeSeriesQueryContext;
}

function client(
  response: OpenCostAllocationResponse | Error,
): OpenCostClient & { calls: OpenCostAllocationParams[] } {
  const calls: OpenCostAllocationParams[] = [];
  return {
    calls,
    options: { datasourceUrl: "http://oc:9003", currency: "EUR" },
    allocation: async (params) => {
      calls.push(params);
      if (response instanceof Error) throw response;
      return response;
    },
  };
}

const variables = {
  teams: { value: ["payments", "search"], loading: false },
  dims: { value: ["label:team", "namespace"], loading: false },
};

describe("expandList", () => {
  it("expands csv variables and drops duplicates", () => {
    expect(
      expandList(["${dims:csv}", "namespace", "controller"], variables),
    ).toEqual(["label:team", "namespace", "controller"]);
  });
});

describe("getOpenCostTimeSeriesData", () => {
  it("asks for daily steps over whole days and builds labelled series", async () => {
    const c = client({
      code: 200,
      data: [
        {
          "payments/api": {
            name: "payments/api",
            start: "",
            end: "",
            totalCost: 2,
          },
        },
        {
          "payments/api": {
            name: "payments/api",
            start: "",
            end: "",
            totalCost: 3,
          },
        },
      ],
    });
    const data = await getOpenCostTimeSeriesData(
      {
        aggregate: ["${dims:csv}"],
        filter: "label[team]:${teams:doublequote}",
      },
      context(c, variables),
    );
    expect(c.calls[0]).toEqual({
      window: "2026-03-01T00:00:00Z,2026-03-08T00:00:00Z",
      aggregate: "label:team,namespace",
      step: "24h",
      accumulate: false,
      includeIdle: false,
      shareIdle: false,
      filter: 'label[team]:"payments","search"',
    });
    expect(data.series).toHaveLength(1);
    expect(data.series[0]!.labels).toEqual({
      team: "payments",
      namespace: "api",
    });
    expect(data.series[0]!.values.map((v) => v[1])).toEqual([2, 3]);
    expect(data.metadata?.currency).toBe("EUR");
    expect(data.metadata?.executedQueryString).toContain(
      "/allocation/compute?window=",
    );
  });

  it("maps idle modes and accumulate", async () => {
    const c = client({ code: 200, data: [] });
    await getOpenCostTimeSeriesData(
      { aggregate: ["namespace"], idle: "share", accumulate: true },
      context(c),
    );
    expect(c.calls[0]).toMatchObject({
      accumulate: true,
      includeIdle: true,
      shareIdle: true,
      step: undefined,
    });
    await getOpenCostTimeSeriesData(
      { aggregate: ["namespace"], idle: "include" },
      context(c),
    );
    expect(c.calls[1]).toMatchObject({ includeIdle: true, shareIdle: false });
  });

  it("returns no series when OpenCost has no data", async () => {
    const data = await getOpenCostTimeSeriesData(
      { aggregate: ["namespace"] },
      context(client({ code: 200, data: null })),
    );
    expect(data.series).toEqual([]);
  });

  it("surfaces API errors", async () => {
    await expect(
      getOpenCostTimeSeriesData(
        { aggregate: ["namespace"] },
        context(client(new Error("connection refused"))),
      ),
    ).rejects.toThrow("connection refused");
  });

  it("rejects bad options before calling OpenCost", async () => {
    const c = client({ code: 200, data: [] });
    await expect(
      getOpenCostTimeSeriesData({ aggregate: ["team"] }, context(c)),
    ).rejects.toThrow(/Unknown aggregate/);
    await expect(
      getOpenCostTimeSeriesData(
        { aggregate: ["namespace"], sharedLabels: ["platform"] },
        context(c),
      ),
    ).rejects.toThrow(/Invalid shared label/);
    expect(c.calls).toHaveLength(0);
  });
});
