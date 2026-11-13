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

import { allocationSearchParams, buildUrl, fetchAllocation } from "./client";

describe("buildUrl", () => {
  it("joins absolute and proxy URLs without double slashes", () => {
    expect(buildUrl("/allocation/compute", "http://localhost:9003/")).toBe(
      "http://localhost:9003/allocation/compute",
    );
    expect(
      buildUrl("/allocation/compute", "/proxy/globaldatasources/opencost"),
    ).toBe("/proxy/globaldatasources/opencost/allocation/compute");
  });
});

describe("allocationSearchParams", () => {
  it("sends step only when not accumulating and shareIdle only with includeIdle", () => {
    const step = allocationSearchParams({
      window: "a,b",
      aggregate: "namespace",
      step: "24h",
      accumulate: false,
      includeIdle: false,
      shareIdle: true,
    });
    expect(step.toString()).toBe(
      "window=a%2Cb&aggregate=namespace&step=24h&includeIdle=false",
    );

    const acc = allocationSearchParams({
      window: "a,b",
      aggregate: "label:team,namespace",
      step: "24h",
      accumulate: true,
      includeIdle: true,
      shareIdle: true,
      filter: 'namespace:"api"',
    });
    expect(Object.fromEntries(acc)).toEqual({
      window: "a,b",
      aggregate: "label:team,namespace",
      accumulate: "true",
      includeIdle: "true",
      shareIdle: "true",
      filter: 'namespace:"api"',
    });
  });
});

describe("fetchAllocation", () => {
  const params = {
    window: "a,b",
    aggregate: "namespace",
    accumulate: true,
    includeIdle: false,
    shareIdle: false,
  };

  it("GETs the allocation API and returns the body", async () => {
    const fetch = jest
      .fn()
      .mockResolvedValue({ json: async () => ({ code: 200, data: [{}] }) });
    const body = await fetchAllocation(params, {
      datasourceUrl: "http://oc:9003",
      fetch,
    });
    expect(body.data).toEqual([{}]);
    expect(fetch.mock.calls[0][0]).toMatch(
      /^http:\/\/oc:9003\/allocation\/compute\?window=a%2Cb/,
    );
    expect(fetch.mock.calls[0][1].method).toBe("GET");
  });

  it("throws OpenCost errors that arrive with a 200 status", async () => {
    const fetch = jest.fn().mockResolvedValue({
      json: async () => ({ code: 400, message: "bad window" }),
    });
    await expect(
      fetchAllocation(params, { datasourceUrl: "http://oc:9003", fetch }),
    ).rejects.toThrow("OpenCost returned 400: bad window");
  });

  it("passes fetch failures on", async () => {
    const fetch = jest.fn().mockRejectedValue(new Error("Bad Gateway"));
    await expect(
      fetchAllocation(params, { datasourceUrl: "http://oc:9003", fetch }),
    ).rejects.toThrow("Bad Gateway");
  });
});
