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
 * The part of an OpenCost `Allocation` (allocation API JSON) that the plugin reads. Every cost field
 * is nullable: OpenCost writes `null` for NaN and leaves fields out in older versions.
 */
export interface OpenCostAllocation {
  name: string;
  properties?: OpenCostAllocationProperties | null;
  start: string;
  end: string;
  window?: { start: string; end: string } | null;
  cpuCost?: number | null;
  cpuCostAdjustment?: number | null;
  gpuCost?: number | null;
  gpuCostAdjustment?: number | null;
  ramCost?: number | null;
  ramCostAdjustment?: number | null;
  pvCost?: number | null;
  pvCostAdjustment?: number | null;
  networkCost?: number | null;
  networkCostAdjustment?: number | null;
  loadBalancerCost?: number | null;
  loadBalancerCostAdjustment?: number | null;
  sharedCost?: number | null;
  externalCost?: number | null;
  totalCost?: number | null;
  totalEfficiency?: number | null;
}

export interface OpenCostAllocationProperties {
  cluster?: string;
  node?: string;
  namespace?: string;
  controller?: string;
  controllerKind?: string;
  pod?: string;
  container?: string;
  labels?: Record<string, string>;
  annotations?: Record<string, string>;
}

/** One allocation set (one step) keyed by the aggregate key, e.g. `platform/kube-system`. */
export type OpenCostAllocationSet = Record<string, OpenCostAllocation>;

/** `GET /allocation/compute` (and `/allocation`) response. */
export interface OpenCostAllocationResponse {
  code: number;
  status?: string;
  message?: string;
  data: Array<OpenCostAllocationSet | null> | null;
}

/** The query parameters the plugin sends to the allocation API. */
export interface OpenCostAllocationParams {
  /** `<RFC3339 start>,<RFC3339 end>` */
  window: string;
  /** Comma-separated aggregation properties, e.g. `label:team,namespace`. Empty means none. */
  aggregate: string;
  /** Go duration, e.g. `1h`, `24h`. Ignored by OpenCost when `accumulate` is true. */
  step?: string;
  accumulate: boolean;
  includeIdle: boolean;
  shareIdle: boolean;
  /** OpenCost filter language (v2), e.g. `namespace:"api","web"`. */
  filter?: string;
}

/** Names OpenCost gives to allocations that do not belong to a workload. */
export const IDLE_KEY = "__idle__";
export const UNALLOCATED_KEY = "__unallocated__";
/** Name the plugin gives to shared cost it could not hand to any other series. */
export const SHARED_KEY = "__shared__";
