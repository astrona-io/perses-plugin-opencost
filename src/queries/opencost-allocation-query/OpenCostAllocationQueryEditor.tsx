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

import {
  Autocomplete,
  Chip,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Switch,
  TextField,
} from "@mui/material";
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
import type { CostType, ShareSplit } from "../../model/transform";
import { COST_TYPES } from "../../model/transform";
import { DEFAULT_TIME_ZONE } from "../../model/window";
import type { IdleMode, OpenCostAllocationQuerySpec } from "./types";
import { DEFAULT_COST_TYPE, DEFAULT_IDLE, DEFAULT_SHARE_SPLIT } from "./types";

export type OpenCostAllocationQueryEditorProps =
  OptionsEditorProps<OpenCostAllocationQuerySpec>;

const COST_TYPE_LABELS: Record<CostType, string> = {
  totalCost: "Total cost",
  cpuCost: "CPU cost",
  ramCost: "RAM cost",
  pvCost: "Persistent volume cost",
  networkCost: "Network cost",
  gpuCost: "GPU cost",
  efficiency: "Efficiency (0 to 1)",
};

const IDLE_LABELS: Record<IdleMode, string> = {
  exclude: "Exclude idle cost",
  include: "Include idle as its own series",
  share: "Share idle over the series",
};

const AGGREGATE_SUGGESTIONS = [
  ...AGGREGATE_PROPERTIES,
  "label:team",
  "label:app",
];

function timeZones(): string[] {
  const intl = Intl as unknown as {
    supportedValuesOf?: (key: string) => string[];
  };
  try {
    return intl.supportedValuesOf
      ? ["UTC", ...intl.supportedValuesOf("timeZone")]
      : ["UTC"];
  } catch {
    return ["UTC"];
  }
}

/** A text field that commits on blur or Enter, so a half-typed filter does not run a query per keystroke. */
function CommitTextField(props: {
  label: string;
  value: string | undefined;
  onCommit: (value: string | undefined) => void;
  helperText?: string;
  placeholder?: string;
  readOnly?: boolean;
}): ReactElement {
  const { label, value, onCommit, helperText, placeholder, readOnly } = props;
  const [draft, setDraft] = useState(value ?? "");
  useEffect(() => setDraft(value ?? ""), [value]);
  const commit = (): void => {
    const next = draft.trim();
    if (next !== (value ?? "")) onCommit(next || undefined);
  };
  return (
    <TextField
      label={label}
      value={draft}
      placeholder={placeholder}
      helperText={helperText}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
      }}
      InputProps={{ readOnly }}
      fullWidth
    />
  );
}

function ChipsField(props: {
  label: string;
  value: string[] | undefined;
  options?: readonly string[];
  onChange: (value: string[] | undefined) => void;
  helperText?: string;
  placeholder?: string;
  readOnly?: boolean;
  required?: boolean;
}): ReactElement {
  const {
    label,
    value,
    options = [],
    onChange,
    helperText,
    placeholder,
    readOnly,
    required,
  } = props;
  return (
    <Autocomplete
      multiple
      freeSolo
      autoSelect
      readOnly={readOnly}
      options={options as string[]}
      value={value ?? []}
      onChange={(_, next) =>
        onChange(next.length > 0 ? (next as string[]) : undefined)
      }
      renderTags={(tags, getTagProps) =>
        tags.map((tag, index) => {
          const { key, ...tagProps } = getTagProps({ index });
          return <Chip key={key} size="small" label={tag} {...tagProps} />;
        })
      }
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          required={required}
          helperText={helperText}
          placeholder={value && value.length > 0 ? undefined : placeholder}
        />
      )}
    />
  );
}

export function OpenCostAllocationQueryEditor(
  props: OpenCostAllocationQueryEditorProps,
): ReactElement {
  const { value, onChange, isReadonly } = props;
  const datasourceSelectValue = value.datasource ?? DEFAULT_OPENCOST;

  const set = <K extends keyof OpenCostAllocationQuerySpec>(
    key: K,
    next: OpenCostAllocationQuerySpec[K],
  ): void => {
    const updated = { ...value };
    if (next === undefined || next === false) {
      delete updated[key];
    } else {
      updated[key] = next;
    }
    onChange(updated);
  };

  const handleDatasourceChange: DatasourceSelectProps["onChange"] = (next) => {
    if (isVariableDatasource(next) || isOpenCostDatasourceSelector(next)) {
      set(
        "datasource",
        !isVariableDatasource(next) && isDefaultOpenCostSelector(next)
          ? undefined
          : next,
      );
      return;
    }
    throw new Error("Got unexpected non-OpenCost datasource selector");
  };

  const sharing =
    (value.sharedNamespaces?.length ?? 0) + (value.sharedLabels?.length ?? 0) >
    0;

  return (
    <Stack spacing={2}>
      <FormControl margin="dense" fullWidth>
        <DatasourceSelect
          datasourcePluginKind={OPENCOST_DATASOURCE_KIND}
          value={datasourceSelectValue}
          onChange={handleDatasourceChange}
          readOnly={isReadonly}
          labelId="opencost-datasource-label"
          label="OpenCost Datasource"
        />
      </FormControl>

      <ChipsField
        label="Aggregate by"
        required
        value={value.aggregate}
        options={AGGREGATE_SUGGESTIONS}
        onChange={(next) => onChange({ ...value, aggregate: next ?? [] })}
        helperText="Outermost first, e.g. label:team, namespace, controller. Each becomes a series label. ${var:csv} expands."
        placeholder="namespace"
        readOnly={isReadonly}
      />

      <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
        <FormControl fullWidth>
          <InputLabel id="opencost-cost-type-label">Cost type</InputLabel>
          <Select
            labelId="opencost-cost-type-label"
            label="Cost type"
            value={value.costType ?? DEFAULT_COST_TYPE}
            readOnly={isReadonly}
            onChange={(e) =>
              set(
                "costType",
                e.target.value === DEFAULT_COST_TYPE
                  ? undefined
                  : (e.target.value as CostType),
              )
            }
          >
            {COST_TYPES.map((t) => (
              <MenuItem key={t} value={t}>
                {COST_TYPE_LABELS[t]}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl fullWidth>
          <InputLabel id="opencost-idle-label">Idle cost</InputLabel>
          <Select
            labelId="opencost-idle-label"
            label="Idle cost"
            value={value.idle ?? DEFAULT_IDLE}
            readOnly={isReadonly}
            onChange={(e) =>
              set(
                "idle",
                e.target.value === DEFAULT_IDLE
                  ? undefined
                  : (e.target.value as IdleMode),
              )
            }
          >
            {(Object.keys(IDLE_LABELS) as IdleMode[]).map((m) => (
              <MenuItem key={m} value={m}>
                {IDLE_LABELS[m]}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Stack>

      <ChipsField
        label="Shared namespaces"
        value={value.sharedNamespaces}
        onChange={(next) => set("sharedNamespaces", next)}
        helperText="Their cost is spread over the other series, e.g. kube-system."
        placeholder="kube-system"
        readOnly={isReadonly}
      />
      <ChipsField
        label="Shared labels"
        value={value.sharedLabels}
        onChange={(next) => set("sharedLabels", next)}
        helperText="key:value. Workloads with the label are spread over the other series."
        placeholder="team:platform"
        readOnly={isReadonly}
      />
      <FormControl fullWidth disabled={!sharing}>
        <InputLabel id="opencost-share-split-label">
          Split shared cost
        </InputLabel>
        <Select
          labelId="opencost-share-split-label"
          label="Split shared cost"
          value={value.shareSplit ?? DEFAULT_SHARE_SPLIT}
          readOnly={isReadonly}
          onChange={(e) =>
            set(
              "shareSplit",
              e.target.value === DEFAULT_SHARE_SPLIT
                ? undefined
                : (e.target.value as ShareSplit),
            )
          }
        >
          <MenuItem value="weighted">
            Weighted by each series&apos; own cost
          </MenuItem>
          <MenuItem value="even">Evenly</MenuItem>
        </Select>
      </FormControl>

      <CommitTextField
        label="Filter"
        value={value.filter}
        onCommit={(next) => set("filter", next)}
        placeholder='namespace:"api","web"'
        helperText="OpenCost filter language. Use ${var:doublequote} for multi-value variables."
        readOnly={isReadonly}
      />

      <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
        <CommitTextField
          label="Step"
          value={value.step}
          onCommit={(next) => set("step", next)}
          placeholder="auto"
          helperText="1h, 6h, 1d or 1w. Empty picks one from the range."
          readOnly={isReadonly || value.accumulate}
        />
        <Autocomplete
          freeSolo
          fullWidth
          autoSelect
          readOnly={isReadonly}
          options={timeZones()}
          value={value.timeZone ?? DEFAULT_TIME_ZONE}
          onChange={(_, next) =>
            set(
              "timeZone",
              !next || next === DEFAULT_TIME_ZONE ? undefined : next,
            )
          }
          renderInput={(params) => (
            <TextField
              {...params}
              label="Time zone"
              helperText="Day and week steps start at midnight here."
            />
          )}
        />
      </Stack>

      <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
        <FormControlLabel
          control={
            <Switch
              checked={value.accumulate ?? false}
              disabled={isReadonly}
              onChange={(_, checked) => set("accumulate", checked)}
            />
          }
          label="Accumulate (one point for the range)"
        />
        <FormControlLabel
          control={
            <Switch
              checked={value.fractionOfTotal ?? false}
              disabled={isReadonly}
              onChange={(_, checked) => set("fractionOfTotal", checked)}
            />
          }
          label="Share of total (0 to 1)"
        />
        <FormControlLabel
          control={
            <Switch
              checked={value.idleOnly ?? false}
              disabled={isReadonly}
              onChange={(_, checked) => set("idleOnly", checked)}
            />
          }
          label="Idle series only"
        />
      </Stack>
    </Stack>
  );
}
