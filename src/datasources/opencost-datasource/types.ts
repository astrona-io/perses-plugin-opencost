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

import type { HTTPProxy } from "@perses-dev/spec";

export interface OpenCostDatasourceSpec {
  /** OpenCost API URL the browser calls directly. Use `proxy` instead to keep the URL and any secret server-side. */
  directUrl?: string;
  /** Perses backend proxy: URL, timeout, secret (for an auth header) and the allow-listed paths. */
  proxy?: HTTPProxy;
  /** ISO 4217 code of the currency OpenCost reports in, e.g. USD. Display only: values are never converted. */
  currency?: string;
}
