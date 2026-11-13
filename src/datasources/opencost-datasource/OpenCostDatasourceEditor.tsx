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

import { Stack, TextField } from "@mui/material";
import type { OptionsEditorProps } from "@perses-dev/plugin-system";
import { HTTPSettingsEditor } from "@perses-dev/plugin-system";
import type { ChangeEvent, ReactElement } from "react";

import { ALLOCATION_PATH } from "../../model/client";
import type { OpenCostDatasourceSpec } from "./types";

/** The only request the proxy lets through: a GET of the allocation API. */
export const OPENCOST_ALLOWED_ENDPOINTS = [
  { endpointPattern: ALLOCATION_PATH, method: "GET" },
];

export type OpenCostDatasourceEditorProps =
  OptionsEditorProps<OpenCostDatasourceSpec>;

export function OpenCostDatasourceEditor(
  props: OpenCostDatasourceEditorProps,
): ReactElement {
  const { value, onChange, isReadonly } = props;

  const initialSpecDirect: OpenCostDatasourceSpec = {
    directUrl: "",
    currency: value.currency,
  };
  const initialSpecProxy: OpenCostDatasourceSpec = {
    currency: value.currency,
    proxy: {
      kind: "HTTPProxy",
      spec: {
        url: "",
        allowedEndpoints: OPENCOST_ALLOWED_ENDPOINTS,
      },
    },
  };

  const handleCurrencyChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const currency = event.target.value.toUpperCase().slice(0, 3);
    const next = { ...value };
    if (currency) {
      next.currency = currency;
    } else {
      delete next.currency;
    }
    onChange(next);
  };

  return (
    <Stack spacing={2}>
      <HTTPSettingsEditor
        value={value}
        onChange={(next: OpenCostDatasourceSpec) =>
          onChange({ ...next, currency: value.currency })
        }
        isReadonly={isReadonly}
        initialSpecDirect={initialSpecDirect}
        initialSpecProxy={initialSpecProxy}
      />
      <TextField
        label="Currency"
        value={value.currency ?? ""}
        onChange={handleCurrencyChange}
        placeholder="USD"
        helperText="ISO 4217 code OpenCost reports costs in. Display only: values are never converted."
        inputProps={{ maxLength: 3, "aria-label": "Currency" }}
        InputProps={{ readOnly: isReadonly }}
      />
    </Stack>
  );
}
