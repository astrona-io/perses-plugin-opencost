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

import type { TimeSeriesQueryPlugin } from "@perses-dev/plugin-system";
import {
  datasourceSelectValueToSelector,
  replaceVariables,
} from "@perses-dev/plugin-system";
import type { TimeSeriesData } from "@perses-dev/spec";

import { validateAggregate, parseSharedLabel } from "../../model/aggregate";
import type { OpenCostClient } from "../../model/client";
import { allocationSearchParams, ALLOCATION_PATH } from "../../model/client";
import {
  DEFAULT_OPENCOST,
  OPENCOST_DATASOURCE_KIND,
} from "../../model/selectors";
import {
  buildRequestAggregate,
  buildSeries,
  COST_TYPES,
  SHARE_SPLITS,
} from "../../model/transform";
import type { OpenCostAllocationParams } from "../../model/types";
import {
  alignWindow,
  DEFAULT_TIME_ZONE,
  parseStep,
  stepParam,
  windowParam,
} from "../../model/window";
import type { OpenCostAllocationQuerySpec } from "./types";
import { DEFAULT_COST_TYPE, DEFAULT_IDLE, DEFAULT_SHARE_SPLIT } from "./types";

type VariableState = Parameters<typeof replaceVariables>[1];

/** Replaces variables in each entry and splits the result on commas, so `${teams:csv}` expands to several. */
export function expandList(
  values: string[] | undefined,
  variables: VariableState,
): string[] {
  const out: string[] = [];
  for (const value of values ?? []) {
    for (const part of replaceVariables(value, variables).split(",")) {
      const trimmed = part.trim();
      if (trimmed && !out.includes(trimmed)) out.push(trimmed);
    }
  }
  return out;
}

export const getOpenCostTimeSeriesData: TimeSeriesQueryPlugin<OpenCostAllocationQuerySpec>["getTimeSeriesData"] =
  async (spec, ctx, abortSignal) => {
    const aggregate = expandList(spec.aggregate, ctx.variableState);
    aggregate.forEach(validateAggregate);
    const costType = spec.costType ?? DEFAULT_COST_TYPE;
    if (!COST_TYPES.includes(costType))
      throw new Error(`Unknown cost type "${costType}"`);
    const shareSplit = spec.shareSplit ?? DEFAULT_SHARE_SPLIT;
    if (!SHARE_SPLITS.includes(shareSplit))
      throw new Error(`Unknown share split "${shareSplit}"`);
    const idle = spec.idle ?? DEFAULT_IDLE;
    const sharedNamespaces = expandList(
      spec.sharedNamespaces,
      ctx.variableState,
    );
    const sharedLabels = expandList(spec.sharedLabels, ctx.variableState).map(
      parseSharedLabel,
    );
    const timeZone = spec.timeZone
      ? replaceVariables(spec.timeZone, ctx.variableState)
      : DEFAULT_TIME_ZONE;
    const accumulate = spec.accumulate ?? false;
    const step = spec.step
      ? replaceVariables(spec.step, ctx.variableState)
      : undefined;

    const window = alignWindow(ctx.timeRange.start, ctx.timeRange.end, {
      accumulate,
      stepMs: parseStep(step),
      suggestedStepMs: ctx.suggestedStepMs,
      timeZone,
    });
    const sharing = { sharedNamespaces, sharedLabels, shareSplit };
    const requestAggregate = buildRequestAggregate(aggregate, sharing);

    const params: OpenCostAllocationParams = {
      window: windowParam(window),
      aggregate: requestAggregate.join(","),
      step: window.stepMs !== undefined ? stepParam(window.stepMs) : undefined,
      accumulate,
      includeIdle: idle !== "exclude",
      shareIdle: idle === "share",
      filter: spec.filter
        ? replaceVariables(spec.filter, ctx.variableState).trim() || undefined
        : undefined,
    };

    const selector =
      datasourceSelectValueToSelector(
        spec.datasource ?? DEFAULT_OPENCOST,
        ctx.variableState,
        await ctx.datasourceStore.listDatasourceSelectItems(
          OPENCOST_DATASOURCE_KIND,
        ),
      ) ?? DEFAULT_OPENCOST;
    const client: OpenCostClient =
      await ctx.datasourceStore.getDatasourceClient(selector);
    const response = await client.allocation(params, abortSignal);

    const series = buildSeries(response.data ?? [], {
      ...sharing,
      aggregate,
      requestAggregate,
      costType,
      stepMs: window.stepMs,
      timeZone,
      windowStart: window.start,
      windowEnd: window.end,
      fractionOfTotal: spec.fractionOfTotal,
      idleOnly: spec.idleOnly,
    });

    const data: TimeSeriesData = {
      timeRange: { start: window.start, end: window.end },
      stepMs: window.stepMs ?? window.end.getTime() - window.start.getTime(),
      series,
      metadata: {
        executedQueryString: `${ALLOCATION_PATH}?${allocationSearchParams(params).toString()}`,
        currency: client.options.currency,
      },
    };
    return data;
  };
