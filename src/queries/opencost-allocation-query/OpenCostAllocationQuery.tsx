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
  isVariableDatasource,
  parseVariables,
} from "@perses-dev/plugin-system";

import { OpenCostAllocationQueryEditor } from "./OpenCostAllocationQueryEditor";
import { getOpenCostTimeSeriesData } from "./query";
import type { OpenCostAllocationQuerySpec } from "./types";

export const OpenCostAllocationQuery: TimeSeriesQueryPlugin<OpenCostAllocationQuerySpec> =
  {
    getTimeSeriesData: getOpenCostTimeSeriesData,
    OptionsEditorComponent: OpenCostAllocationQueryEditor,
    createInitialOptions: () => ({ aggregate: ["namespace"] }),
    dependsOn: (spec) => {
      const texts = [
        ...(spec.aggregate ?? []),
        ...(spec.sharedNamespaces ?? []),
        ...(spec.sharedLabels ?? []),
        spec.filter ?? "",
        spec.step ?? "",
        spec.timeZone ?? "",
      ];
      const variables = texts.flatMap((text) => parseVariables(text));
      if (spec.datasource && isVariableDatasource(spec.datasource)) {
        variables.push(...parseVariables(spec.datasource));
      }
      return { variables: [...new Set(variables)] };
    },
  };
