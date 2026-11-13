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

import type {
  GetVariableOptionsContext,
  VariableOption,
  VariablePlugin,
} from "@perses-dev/plugin-system";
import {
  datasourceSelectValueToSelector,
  isVariableDatasource,
  parseVariables,
  replaceVariables,
} from "@perses-dev/plugin-system";

import { validateAggregate } from "../../model/aggregate";
import type { OpenCostClient } from "../../model/client";
import {
  DEFAULT_OPENCOST,
  OPENCOST_DATASOURCE_KIND,
} from "../../model/selectors";
import type { OpenCostAllocationResponse } from "../../model/types";
import { IDLE_KEY, UNALLOCATED_KEY } from "../../model/types";
import { alignWindow, windowParam } from "../../model/window";
import { OpenCostAggregateVariableEditor } from "./OpenCostAggregateVariableEditor";
import type { OpenCostAggregateVariableSpec } from "./types";

/** Keys of every set, without idle and unallocated, sorted. */
export function keysToOptions(
  response: OpenCostAllocationResponse,
): VariableOption[] {
  const keys = new Set<string>();
  for (const set of response.data ?? []) {
    for (const key of Object.keys(set ?? {})) {
      if (key !== IDLE_KEY && key !== UNALLOCATED_KEY && key !== "")
        keys.add(key);
    }
  }
  return [...keys]
    .sort((a, b) => a.localeCompare(b))
    .map((key) => ({ value: key, label: key }));
}

export const OpenCostAggregateVariable: VariablePlugin<OpenCostAggregateVariableSpec> =
  {
    getVariableOptions: async (
      spec: OpenCostAggregateVariableSpec,
      ctx: GetVariableOptionsContext,
      abortSignal,
    ) => {
      const aggregate = replaceVariables(
        spec.aggregate ?? "",
        ctx.variables,
      ).trim();
      if (!aggregate) return { data: [] };
      validateAggregate(aggregate);

      const selector =
        datasourceSelectValueToSelector(
          spec.datasource ?? DEFAULT_OPENCOST,
          ctx.variables,
          await ctx.datasourceStore.listDatasourceSelectItems(
            OPENCOST_DATASOURCE_KIND,
          ),
        ) ?? DEFAULT_OPENCOST;
      const client: OpenCostClient =
        await ctx.datasourceStore.getDatasourceClient(selector);
      const window = alignWindow(ctx.timeRange.start, ctx.timeRange.end, {
        accumulate: true,
      });
      const filter = spec.filter
        ? replaceVariables(spec.filter, ctx.variables).trim()
        : "";
      const response = await client.allocation(
        {
          window: windowParam(window),
          aggregate,
          accumulate: true,
          includeIdle: false,
          shareIdle: false,
          filter: filter || undefined,
        },
        abortSignal,
      );
      return { data: keysToOptions(response) };
    },
    dependsOn: (spec) => {
      const variables = [
        ...parseVariables(spec.aggregate ?? ""),
        ...parseVariables(spec.filter ?? ""),
      ];
      if (spec.datasource && isVariableDatasource(spec.datasource))
        variables.push(...parseVariables(spec.datasource));
      return { variables: [...new Set(variables)] };
    },
    OptionsEditorComponent: OpenCostAggregateVariableEditor,
    createInitialOptions: () => ({ aggregate: "namespace" }),
  };
