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

import type { DatasourcePlugin } from "@perses-dev/plugin-system";

import type { OpenCostClient } from "../../model/client";
import { fetchAllocation } from "../../model/client";
import type { OpenCostDatasourceSpec } from "./types";
import { OpenCostDatasourceEditor } from "./OpenCostDatasourceEditor";

const createClient: DatasourcePlugin<
  OpenCostDatasourceSpec,
  OpenCostClient
>["createClient"] = (spec, options) => {
  const { directUrl, currency } = spec;
  const { proxyUrl, fetch: customFetch } = options;

  const datasourceUrl = directUrl || proxyUrl;
  if (!datasourceUrl) {
    throw new Error(
      "No URL specified for the OpenCost datasource: set directUrl or a proxy URL.",
    );
  }

  return {
    options: { datasourceUrl, currency },
    allocation: (params, abortSignal) =>
      fetchAllocation(
        params,
        { datasourceUrl, fetch: customFetch },
        abortSignal,
      ),
  };
};

export const OpenCostDatasource: DatasourcePlugin<
  OpenCostDatasourceSpec,
  OpenCostClient
> = {
  createClient,
  OptionsEditorComponent: OpenCostDatasourceEditor,
  createInitialOptions: () => ({ directUrl: "" }),
};
