import { HTTPSettingsEditor } from '@perses-dev/plugin-system';
import type { ReactElement } from 'react';

import type { OpenCostDatasourceSpec } from './open-cost-datasource-types';

export interface OpenCostDatasourceEditorProps {
  value: OpenCostDatasourceSpec;
  onChange: (next: OpenCostDatasourceSpec) => void;
  isReadonly?: boolean;
}

const INITIAL_SPEC_DIRECT: OpenCostDatasourceSpec = {
  directUrl: '',
};

const INITIAL_SPEC_PROXY: OpenCostDatasourceSpec = {
  proxy: {
    kind: 'HTTPProxy',
    spec: {
      allowedEndpoints: [
        // Adjust based on your API
        {
          endpointPattern: '/api/search',
          method: 'GET',
        },
      ],
      url: '',
    },
  },
};

export function OpenCostDatasourceEditor(props: OpenCostDatasourceEditorProps): ReactElement {
  const { value, onChange, isReadonly } = props;

  return (
    <HTTPSettingsEditor
      value={value}
      onChange={onChange}
      isReadonly={isReadonly}
      initialSpecDirect={INITIAL_SPEC_DIRECT}
      initialSpecProxy={INITIAL_SPEC_PROXY}
    />
  );
}
