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

import type { DatasourceSelectValue } from "@perses-dev/plugin-system";
import { isVariableDatasource } from "@perses-dev/plugin-system";
import type { DatasourceSelector } from "@perses-dev/spec";

export const OPENCOST_DATASOURCE_KIND = "OpenCostDatasource" as const;

export interface OpenCostDatasourceSelector extends DatasourceSelector {
  kind: typeof OPENCOST_DATASOURCE_KIND;
}

export const DEFAULT_OPENCOST: OpenCostDatasourceSelector = {
  kind: OPENCOST_DATASOURCE_KIND,
};

export function isDefaultOpenCostSelector(
  value: DatasourceSelectValue<OpenCostDatasourceSelector>,
): boolean {
  return !isVariableDatasource(value) && value.name === undefined;
}

export function isOpenCostDatasourceSelector(
  value: DatasourceSelectValue<DatasourceSelector>,
): value is OpenCostDatasourceSelector {
  return isVariableDatasource(value) || value.kind === OPENCOST_DATASOURCE_KIND;
}
