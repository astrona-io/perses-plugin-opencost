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

/**
 * @jest-environment node
 *
 * Compares the plugin's numbers with the OpenCost API it reads. Runs only when OPENCOST_URL points at an
 * OpenCost API (the dev stack exposes one: see dev/README.md), e.g.
 *
 *   OPENCOST_URL=http://127.0.0.1:18184 npm test -- integration
 */

import { get } from "node:http";

import type { TimeSeriesQueryContext } from "@perses-dev/plugin-system";

import { OpenCostDatasource } from "../datasources/opencost-datasource";
import type { OpenCostAllocationResponse } from "../model/types";
import { HOUR_MS } from "../model/window";
import { getOpenCostTimeSeriesData } from "../queries/opencost-allocation-query/query";

const OPENCOST_URL = process.env.OPENCOST_URL;
const describeLive = OPENCOST_URL ? describe : describe.skip;

// Whole hours that OpenCost has finished: the last six full hours before now.
const end = new Date(Math.floor(Date.now() / HOUR_MS) * HOUR_MS);
const start = new Date(end.getTime() - 6 * HOUR_MS);
const window = `${start.toISOString().replace(".000Z", "Z")},${end.toISOString().replace(".000Z", "Z")}`;

// Jest's node environment has no global fetch, so the test talks HTTP itself.
function httpFetch(input: RequestInfo | URL): Promise<Response> {
  return new Promise((resolve, reject) => {
    get(String(input), (res) => {
      let text = "";
      res.setEncoding("utf8");
      res.on("data", (chunk: string) => (text += chunk));
      res.on("end", () =>
        resolve({
          ok: (res.statusCode ?? 0) < 400,
          status: res.statusCode ?? 0,
          json: async () => JSON.parse(text),
          text: async () => text,
        } as Response),
      );
    }).on("error", reject);
  });
}

function ctx(): TimeSeriesQueryContext {
  const client = OpenCostDatasource.createClient(
    { directUrl: OPENCOST_URL },
    { fetch: httpFetch },
  );
  return {
    timeRange: { start, end },
    suggestedStepMs: HOUR_MS,
    variableState: {},
    datasourceStore: {
      listDatasourceSelectItems: async () => [],
      getDatasourceClient: async () => client,
    },
  } as unknown as TimeSeriesQueryContext;
}

async function raw(
  query: Record<string, string>,
): Promise<Record<string, number>> {
  const search = new URLSearchParams({ window, ...query });
  const response = await httpFetch(
    `${OPENCOST_URL}/allocation/compute?${search}`,
  );
  const body = (await response.json()) as OpenCostAllocationResponse;
  const totals: Record<string, number> = {};
  for (const set of body.data ?? []) {
    for (const [key, a] of Object.entries(set ?? {}))
      totals[key] = (totals[key] ?? 0) + (a.totalCost ?? 0);
  }
  return totals;
}

function sum(values: Record<string, number>): number {
  return Object.values(values).reduce((a, b) => a + b, 0);
}

describeLive("totals match the OpenCost API", () => {
  it("per team, accumulated", async () => {
    const expected = await raw({
      aggregate: "label:team",
      accumulate: "true",
      includeIdle: "false",
    });
    expect(Object.keys(expected).length).toBeGreaterThan(0);
    const data = await getOpenCostTimeSeriesData(
      { aggregate: ["label:team"], accumulate: true },
      ctx(),
    );
    const actual = Object.fromEntries(
      data.series.map((s) => [s.labels!.team!, s.values[0]![1]!]),
    );
    expect(Object.keys(actual).sort()).toEqual(Object.keys(expected).sort());
    for (const key of Object.keys(expected))
      expect(actual[key]).toBeCloseTo(expected[key]!, 6);
  });

  it("per team and namespace, hourly steps, including idle", async () => {
    const expected = await raw({
      aggregate: "label:team,namespace",
      step: "1h",
      includeIdle: "true",
    });
    const data = await getOpenCostTimeSeriesData(
      { aggregate: ["label:team", "namespace"], idle: "include", step: "1h" },
      ctx(),
    );
    const actual: Record<string, number> = {};
    for (const s of data.series) {
      const key =
        s.name === "__idle__"
          ? "__idle__"
          : `${s.labels!.team}/${s.labels!.namespace}`;
      actual[key] = s.values.reduce((a, v) => a + (v[1] ?? 0), 0);
    }
    for (const key of Object.keys(expected))
      expect(actual[key]).toBeCloseTo(expected[key]!, 6);
    expect(sum(actual)).toBeCloseTo(sum(expected), 6);
  });

  it("keeps the total when shared namespaces are redistributed", async () => {
    const expected = await raw({
      aggregate: "label:team",
      accumulate: "true",
      includeIdle: "false",
    });
    for (const shareSplit of ["even", "weighted"] as const) {
      const data = await getOpenCostTimeSeriesData(
        {
          aggregate: ["label:team"],
          accumulate: true,
          sharedNamespaces: ["kube-system"],
          shareSplit,
        },
        ctx(),
      );
      const actual = data.series.reduce(
        (a, s) => a + (s.values[0]![1] ?? 0),
        0,
      );
      expect(actual).toBeCloseTo(sum(expected), 6);
      expect(data.series.some((s) => s.labels!.team === "kube-system")).toBe(
        false,
      );
    }
  });
});
