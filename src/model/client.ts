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

import { fetch as persesFetch } from "@perses-dev/client";
import type { RequestHeaders } from "@perses-dev/client";

import type {
  OpenCostAllocationParams,
  OpenCostAllocationResponse,
} from "./types";

/** The one path the plugin reads. The proxy allow-list in the datasource editor matches it. */
export const ALLOCATION_PATH = "/allocation/compute";

export interface OpenCostClientOptions {
  datasourceUrl: string;
  headers?: RequestHeaders;
  fetch?: typeof persesFetch;
}

export interface OpenCostClient {
  options: { datasourceUrl: string; currency?: string };
  allocation: (
    params: OpenCostAllocationParams,
    abortSignal?: AbortSignal,
  ) => Promise<OpenCostAllocationResponse>;
}

/** Joins the datasource URL (absolute, or relative to the Perses origin for the proxy) with an API path. */
export function buildUrl(
  path: string,
  datasourceUrl: string,
  search?: URLSearchParams,
): string {
  const base = datasourceUrl.replace(/\/+$/, "");
  const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;
  const query = search?.toString();
  return query ? `${url}?${query}` : url;
}

export function allocationSearchParams(
  params: OpenCostAllocationParams,
): URLSearchParams {
  const search = new URLSearchParams();
  search.set("window", params.window);
  if (params.aggregate) search.set("aggregate", params.aggregate);
  if (params.accumulate) {
    search.set("accumulate", "true");
  } else if (params.step) {
    search.set("step", params.step);
  }
  search.set("includeIdle", String(params.includeIdle));
  if (params.includeIdle && params.shareIdle) search.set("shareIdle", "true");
  if (params.filter) search.set("filter", params.filter);
  return search;
}

export async function fetchAllocation(
  params: OpenCostAllocationParams,
  options: OpenCostClientOptions,
  abortSignal?: AbortSignal,
): Promise<OpenCostAllocationResponse> {
  const doFetch = options.fetch ?? persesFetch;
  const url = buildUrl(
    ALLOCATION_PATH,
    options.datasourceUrl,
    allocationSearchParams(params),
  );
  const response = await doFetch(url, {
    method: "GET",
    headers: options.headers,
    signal: abortSignal,
  });
  const body = (await response.json()) as OpenCostAllocationResponse;
  if (body.code !== undefined && body.code !== 200) {
    throw new Error(
      `OpenCost returned ${body.code}: ${body.message ?? "unknown error"}`,
    );
  }
  return body;
}

/** How long a finished allocation response is reused. Shorter than any sensible dashboard refresh. */
export const ALLOCATION_CACHE_TTL_MS = 30_000;

type AllocationFetcher = (
  params: OpenCostAllocationParams,
  options: OpenCostClientOptions,
  abortSignal?: AbortSignal,
) => Promise<OpenCostAllocationResponse>;

/**
 * Wraps fetchAllocation so panels asking for the same URL share one request.
 *
 * Every /allocation/compute call rebuilds allocations from Prometheus, which costs
 * OpenCost seconds of CPU, and panels often differ only in what they read from the
 * same response (cost type, idle handling). Requests in flight are shared, and a
 * response is reused for `ttlMs`. A caller's abort only stops its own wait, so one
 * panel unmounting does not fail the others. Failures are not kept.
 */
export function sharedAllocationFetcher(
  ttlMs: number = ALLOCATION_CACHE_TTL_MS,
  fetcher: AllocationFetcher = fetchAllocation,
  now: () => number = Date.now,
): AllocationFetcher {
  const entries = new Map<
    string,
    { response: Promise<OpenCostAllocationResponse>; expiresAt: number }
  >();

  return (params, options, abortSignal) => {
    const key = buildUrl(
      ALLOCATION_PATH,
      options.datasourceUrl,
      allocationSearchParams(params),
    );
    for (const [k, entry] of entries) {
      if (entry.expiresAt <= now()) entries.delete(k);
    }

    let entry = entries.get(key);
    if (!entry) {
      const response = fetcher(params, options);
      // In flight: kept until it settles, then for ttlMs.
      const created = { response, expiresAt: Number.POSITIVE_INFINITY };
      entries.set(key, created);
      response.then(
        () => {
          created.expiresAt = now() + ttlMs;
        },
        () => {
          if (entries.get(key) === created) entries.delete(key);
        },
      );
      entry = created;
    }
    return withAbort(entry.response, abortSignal);
  };
}

function withAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(abortError(signal));
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(abortError(signal));
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

function abortError(signal: AbortSignal): unknown {
  return (
    signal.reason ??
    new DOMException("The operation was aborted.", "AbortError")
  );
}
