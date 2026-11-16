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
  allocationSearchParams,
  buildUrl,
  fetchAllocation,
  sharedAllocationFetcher,
} from "./client";

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

describe("sharedAllocationFetcher", () => {
  const params = {
    window: "a,b",
    aggregate: "cluster",
    accumulate: true,
    includeIdle: true,
    shareIdle: false,
  };
  const options = { datasourceUrl: "http://oc:9003" };

  function deferred() {
    let resolve!: (v: unknown) => void;
    let reject!: (e: unknown) => void;
    const promise = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  }

  it("shares a request in flight and reuses the response until the TTL ends", async () => {
    let clock = 0;
    const fetcher = jest.fn().mockResolvedValue({ code: 200, data: [] });
    const shared = sharedAllocationFetcher(1000, fetcher, () => clock);

    const [a, b] = await Promise.all([
      shared(params, options),
      shared(params, options),
    ]);
    expect(a).toBe(b);
    expect(fetcher).toHaveBeenCalledTimes(1);

    clock = 999;
    await shared(params, options);
    expect(fetcher).toHaveBeenCalledTimes(1);

    clock = 1000;
    await shared(params, options);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("fetches different parameters and datasources separately", async () => {
    const fetcher = jest.fn().mockResolvedValue({ code: 200, data: [] });
    const shared = sharedAllocationFetcher(1000, fetcher, () => 0);
    await shared(params, options);
    await shared({ ...params, aggregate: "namespace" }, options);
    await shared(params, { datasourceUrl: "http://other:9003" });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("does not keep failures", async () => {
    const fetcher = jest
      .fn()
      .mockRejectedValueOnce(new Error("Bad Gateway"))
      .mockResolvedValue({ code: 200, data: [] });
    const shared = sharedAllocationFetcher(1000, fetcher, () => 0);
    await expect(shared(params, options)).rejects.toThrow("Bad Gateway");
    await expect(shared(params, options)).resolves.toEqual({
      code: 200,
      data: [],
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("lets one caller abort without failing the others", async () => {
    const pending = deferred();
    const fetcher = jest.fn().mockReturnValue(pending.promise);
    const shared = sharedAllocationFetcher(1000, fetcher, () => 0);

    const controller = new AbortController();
    const aborted = shared(params, options, controller.signal);
    const kept = shared(params, options);
    controller.abort();
    await expect(aborted).rejects.toBeDefined();

    pending.resolve({ code: 200, data: [] });
    await expect(kept).resolves.toEqual({ code: 200, data: [] });
    expect(fetcher).toHaveBeenCalledTimes(1);
    // The shared request runs without the caller's signal.
    expect(fetcher.mock.calls[0][2]).toBeUndefined();
  });
});
