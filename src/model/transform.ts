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

import type { TimeSeries, TimeSeriesValueTuple } from "@perses-dev/spec";

import { labelNameFor } from "./aggregate";
import type { OpenCostAllocation, OpenCostAllocationSet } from "./types";
import { IDLE_KEY, SHARED_KEY, UNALLOCATED_KEY } from "./types";
import { pointTimestamp } from "./window";

export const COST_TYPES = [
  "totalCost",
  "cpuCost",
  "ramCost",
  "pvCost",
  "networkCost",
  "gpuCost",
  "efficiency",
] as const;
export type CostType = (typeof COST_TYPES)[number];

export const SHARE_SPLITS = ["even", "weighted"] as const;
export type ShareSplit = (typeof SHARE_SPLITS)[number];

export interface SharedLabel {
  key: string;
  value: string;
}

export interface SharingOptions {
  sharedNamespaces: string[];
  sharedLabels: SharedLabel[];
  shareSplit: ShareSplit;
}

export interface TransformOptions extends SharingOptions {
  /** The dimensions the user asked for, in order. Become the series labels. */
  aggregate: string[];
  /** What OpenCost was asked to aggregate by: `aggregate` plus what sharing needs. */
  requestAggregate: string[];
  costType: CostType;
  /** Step in ms, undefined when accumulating. */
  stepMs?: number;
  timeZone: string;
  windowStart: Date;
  windowEnd: Date;
  /** Write each value as its share (0..1) of the sum of all series at that time. */
  fractionOfTotal?: boolean;
  /** Keep only the idle series. */
  idleOnly?: boolean;
}

/** Running sums for one series in one set. */
export interface CostSums {
  cpuCost: number;
  ramCost: number;
  pvCost: number;
  networkCost: number;
  gpuCost: number;
  loadBalancerCost: number;
  sharedCost: number;
  externalCost: number;
  totalCost: number;
  /** Efficiency weighted by CPU + RAM cost, and that weight. */
  efficiencyWeighted: number;
  efficiencyWeight: number;
}

function n(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function emptySums(): CostSums {
  return {
    cpuCost: 0,
    ramCost: 0,
    pvCost: 0,
    networkCost: 0,
    gpuCost: 0,
    loadBalancerCost: 0,
    sharedCost: 0,
    externalCost: 0,
    totalCost: 0,
    efficiencyWeighted: 0,
    efficiencyWeight: 0,
  };
}

/** Adds one allocation to `sums`. Component costs include OpenCost's adjustments, as its totalCost does. */
export function addAllocation(sums: CostSums, a: OpenCostAllocation): void {
  sums.cpuCost += n(a.cpuCost) + n(a.cpuCostAdjustment);
  sums.ramCost += n(a.ramCost) + n(a.ramCostAdjustment);
  sums.pvCost += n(a.pvCost) + n(a.pvCostAdjustment);
  sums.networkCost += n(a.networkCost) + n(a.networkCostAdjustment);
  sums.gpuCost += n(a.gpuCost) + n(a.gpuCostAdjustment);
  sums.loadBalancerCost +=
    n(a.loadBalancerCost) + n(a.loadBalancerCostAdjustment);
  sums.sharedCost += n(a.sharedCost);
  sums.externalCost += n(a.externalCost);
  sums.totalCost += n(a.totalCost);
  const weight = n(a.cpuCost) + n(a.ramCost);
  if (
    weight > 0 &&
    typeof a.totalEfficiency === "number" &&
    Number.isFinite(a.totalEfficiency)
  ) {
    sums.efficiencyWeighted += a.totalEfficiency * weight;
    sums.efficiencyWeight += weight;
  }
}

function mergeSums(into: CostSums, from: CostSums): void {
  for (const key of Object.keys(into) as Array<keyof CostSums>) {
    into[key] += from[key];
  }
}

export function costValue(sums: CostSums, costType: CostType): number | null {
  if (costType === "efficiency") {
    return sums.efficiencyWeight > 0
      ? sums.efficiencyWeighted / sums.efficiencyWeight
      : null;
  }
  return sums[costType];
}

/** What OpenCost has to aggregate by so the plugin can tell shared allocations apart. */
export function buildRequestAggregate(
  aggregate: string[],
  sharing: SharingOptions,
): string[] {
  const out = [...aggregate];
  if (sharing.sharedNamespaces.length > 0 && !out.includes("namespace"))
    out.push("namespace");
  for (const { key } of sharing.sharedLabels) {
    const property = `label:${key}`;
    if (!out.includes(property)) out.push(property);
  }
  return out;
}

export function isIdleKey(key: string): boolean {
  return key === IDLE_KEY || key.split("/").includes(IDLE_KEY);
}

/** Maps an allocation key (`platform/kube-system`) to one value per requested property. */
export function splitKey(key: string, requestAggregate: string[]): string[] {
  if (requestAggregate.length <= 1) return [key];
  if (isIdleKey(key)) return requestAggregate.map(() => IDLE_KEY);
  const parts = key.split("/");
  if (parts.length === requestAggregate.length) return parts;
  // A value with a slash in it (annotations can have one): keep the whole key in the first dimension.
  return requestAggregate.map((_, i) => (i === 0 ? key : UNALLOCATED_KEY));
}

interface Group {
  labels: Record<string, string>;
  sums: CostSums;
  idle: boolean;
}

export interface SetResult {
  groups: Map<string, Group>;
  /** Shared cost no group could take (every non-idle allocation was shared). */
  unassignedShared?: CostSums;
}

/**
 * Groups one allocation set by the user's dimensions and hands shared cost to the other groups.
 * Shared allocations are those in `sharedNamespaces` or carrying a `sharedLabels` label; idle is never shared.
 */
export function groupSet(
  set: OpenCostAllocationSet,
  opts: TransformOptions,
): SetResult {
  const groups = new Map<string, Group>();
  const shared = emptySums();
  let sharedCount = 0;
  const namespaceIndex = opts.requestAggregate.indexOf("namespace");
  const labelIndexes = opts.sharedLabels.map(({ key, value }) => ({
    index: opts.requestAggregate.indexOf(`label:${key}`),
    value,
  }));
  const sharedNamespaces = new Set(opts.sharedNamespaces);

  for (const [key, allocation] of Object.entries(set)) {
    if (!allocation) continue;
    const parts = splitKey(key, opts.requestAggregate);
    const idle = isIdleKey(key) || allocation.name === IDLE_KEY;
    if (!idle) {
      const byNamespace =
        namespaceIndex >= 0 && sharedNamespaces.has(parts[namespaceIndex]!);
      const byLabel = labelIndexes.some(
        ({ index, value }) => index >= 0 && parts[index] === value,
      );
      if (byNamespace || byLabel) {
        addAllocation(shared, allocation);
        sharedCount++;
        continue;
      }
    }
    const labels: Record<string, string> = {};
    const values = opts.aggregate.map((property, i) => {
      const value = idle ? IDLE_KEY : (parts[i] ?? UNALLOCATED_KEY);
      labels[labelNameFor(property)] = value;
      return value;
    });
    const groupKey = idle ? IDLE_KEY : values.join("\u0000");
    let group = groups.get(groupKey);
    if (!group) {
      group = {
        labels: idle && opts.aggregate.length === 0 ? {} : labels,
        sums: emptySums(),
        idle,
      };
      groups.set(groupKey, group);
    }
    addAllocation(group.sums, allocation);
  }

  if (sharedCount === 0) return { groups };
  const recipients = [...groups.values()].filter((g) => !g.idle);
  if (recipients.length === 0) return { groups, unassignedShared: shared };

  const weights = recipients.map((g) =>
    opts.shareSplit === "weighted" ? Math.max(g.sums.totalCost, 0) : 1,
  );
  let weightSum = weights.reduce((a, b) => a + b, 0);
  if (weightSum <= 0) {
    weights.fill(1);
    weightSum = recipients.length;
  }
  recipients.forEach((g, i) => {
    const part = (shared.totalCost * weights[i]!) / weightSum;
    g.sums.sharedCost += part;
    g.sums.totalCost += part;
  });
  return { groups };
}

function seriesName(
  labels: Record<string, string>,
  aggregate: string[],
  idle: boolean,
): string {
  if (idle) return IDLE_KEY;
  const values = aggregate.map((p) => labels[labelNameFor(p)] ?? "");
  return values.length > 0 ? values.join(" / ") : "total";
}

/** Where a set sits in time: from its allocations' window when present, else from its position. */
function setBounds(
  set: OpenCostAllocationSet,
  index: number,
  opts: TransformOptions,
): { start: Date; end: Date } {
  for (const allocation of Object.values(set)) {
    const w = allocation?.window;
    if (w?.start && w?.end)
      return { start: new Date(w.start), end: new Date(w.end) };
  }
  if (opts.stepMs === undefined)
    return { start: opts.windowStart, end: opts.windowEnd };
  const start = opts.windowStart.getTime() + index * opts.stepMs;
  return {
    start: new Date(start),
    end: new Date(Math.min(start + opts.stepMs, opts.windowEnd.getTime())),
  };
}

/**
 * Turns allocation sets (one per step, or one when accumulating) into Perses time series: one series per
 * combination of the user's dimensions, each dimension a label, so treemap and Sankey panels can group by them.
 */
export function buildSeries(
  sets: Array<OpenCostAllocationSet | null>,
  opts: TransformOptions,
): TimeSeries[] {
  type Point = { sums: CostSums };
  const series = new Map<
    string,
    {
      labels: Record<string, string>;
      idle: boolean;
      points: Map<number, Point>;
    }
  >();
  const timestamps = new Set<number>();

  const add = (
    key: string,
    labels: Record<string, string>,
    idle: boolean,
    ts: number,
    sums: CostSums,
  ): void => {
    let s = series.get(key);
    if (!s) {
      s = { labels, idle, points: new Map() };
      series.set(key, s);
    }
    const point = s.points.get(ts);
    if (point) {
      mergeSums(point.sums, sums);
    } else {
      s.points.set(ts, { sums: { ...sums } });
    }
  };

  sets.forEach((set, index) => {
    if (!set) return;
    const bounds = setBounds(set, index, opts);
    const ts = pointTimestamp(
      bounds.start,
      bounds.end,
      opts.stepMs,
      opts.timeZone,
    );
    timestamps.add(ts);
    const { groups, unassignedShared } = groupSet(set, opts);
    for (const [key, group] of groups)
      add(key, group.labels, group.idle, ts, group.sums);
    if (unassignedShared) {
      const labels = Object.fromEntries(
        opts.aggregate.map((p) => [labelNameFor(p), SHARED_KEY]),
      );
      add(SHARED_KEY, labels, false, ts, unassignedShared);
    }
  });

  const sortedTimestamps = [...timestamps].sort((a, b) => a - b);
  const totals = new Map<number, number>();
  if (opts.fractionOfTotal && opts.costType !== "efficiency") {
    for (const s of series.values()) {
      for (const [ts, p] of s.points)
        totals.set(
          ts,
          (totals.get(ts) ?? 0) + (costValue(p.sums, opts.costType) ?? 0),
        );
    }
  }

  const out: Array<TimeSeries & { _sum: number }> = [];
  for (const s of series.values()) {
    if (opts.idleOnly && !s.idle) continue;
    let sum = 0;
    const values: TimeSeriesValueTuple[] = sortedTimestamps.map((ts) => {
      const point = s.points.get(ts);
      let value: number | null = point
        ? costValue(point.sums, opts.costType)
        : opts.costType === "efficiency"
          ? null
          : 0;
      if (
        value !== null &&
        opts.fractionOfTotal &&
        opts.costType !== "efficiency"
      ) {
        const total = totals.get(ts) ?? 0;
        value = total > 0 ? value / total : null;
      }
      sum += value ?? 0;
      return [ts, value];
    });
    const name = seriesName(s.labels, opts.aggregate, s.idle);
    out.push({
      name,
      formattedName: name,
      labels: s.labels,
      values,
      _sum: sum,
    });
  }
  out.sort((a, b) => b._sum - a._sum || a.name.localeCompare(b.name));
  return out.map(({ _sum, ...rest }) => rest);
}
