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

import { Autocomplete, FormControl, Stack, TextField } from "@mui/material";
import type {
  DatasourceSelectProps,
  OptionsEditorProps,
} from "@perses-dev/plugin-system";
import {
  DatasourceSelect,
  isVariableDatasource,
} from "@perses-dev/plugin-system";
import type { ReactElement } from "react";
import { useEffect, useState } from "react";

import { AGGREGATE_PROPERTIES } from "../../model/aggregate";
import {
  DEFAULT_OPENCOST,
  isDefaultOpenCostSelector,
  isOpenCostDatasourceSelector,
  OPENCOST_DATASOURCE_KIND,
} from "../../model/selectors";
import type { OpenCostAggregateVariableSpec } from "./types";

export function OpenCostAggregateVariableEditor(
  props: OptionsEditorProps<OpenCostAggregateVariableSpec>,
): ReactElement {
  const { value, onChange, isReadonly } = props;
  const [filter, setFilter] = useState(value.filter ?? "");
  useEffect(() => setFilter(value.filter ?? ""), [value.filter]);

  const handleDatasourceChange: DatasourceSelectProps["onChange"] = (next) => {
    if (isVariableDatasource(next) || isOpenCostDatasourceSelector(next)) {
      const updated = { ...value };
      if (!isVariableDatasource(next) && isDefaultOpenCostSelector(next)) {
        delete updated.datasource;
      } else {
        updated.datasource = next;
      }
      onChange(updated);
      return;
    }
    throw new Error("Got unexpected non-OpenCost datasource selector");
  };

  const commitFilter = (): void => {
    const next = filter.trim();
    if (next === (value.filter ?? "")) return;
    const updated = { ...value };
    if (next) {
      updated.filter = next;
    } else {
      delete updated.filter;
    }
    onChange(updated);
  };

  return (
    <Stack spacing={2}>
      <FormControl margin="dense" fullWidth>
        <DatasourceSelect
          datasourcePluginKind={OPENCOST_DATASOURCE_KIND}
          value={value.datasource ?? DEFAULT_OPENCOST}
          onChange={handleDatasourceChange}
          readOnly={isReadonly}
          labelId="opencost-variable-datasource-label"
          label="OpenCost Datasource"
        />
      </FormControl>
      <Autocomplete
        freeSolo
        autoSelect
        disableClearable
        readOnly={isReadonly}
        options={[...AGGREGATE_PROPERTIES, "label:team"]}
        value={value.aggregate ?? ""}
        onChange={(_, next) => onChange({ ...value, aggregate: next ?? "" })}
        renderInput={(params) => (
          <TextField
            {...params}
            required
            label="Aggregate"
            helperText="The values of this property over the dashboard range, e.g. namespace or label:team."
          />
        )}
      />
      <TextField
        label="Filter"
        value={filter}
        placeholder='label[team]:"payments"'
        helperText="Optional OpenCost filter; may reference other variables."
        onChange={(e) => setFilter(e.target.value)}
        onBlur={commitFilter}
        onKeyDown={(e) => {
          if (e.key === "Enter") commitFilter();
        }}
        InputProps={{ readOnly: isReadonly }}
      />
    </Stack>
  );
}
