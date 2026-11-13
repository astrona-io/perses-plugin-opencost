import { fetch } from '@perses-dev/client';
import type { DatasourcePlugin } from '@perses-dev/plugin-system';

import type { OpenCostDatasourceSpec, OpenCostDatasourceClient } from './open-cost-datasource-types';
import { OpenCostDatasourceEditor } from './OpenCostDatasourceEditor';

const createClient: DatasourcePlugin<OpenCostDatasourceSpec, OpenCostDatasourceClient>['createClient'] = (spec, options) => {
  const { directUrl, proxy } = spec;
  const { proxyUrl } = options;

  // Use the direct URL if specified, but fallback to the proxyUrl by default if not specified
  const datasourceUrl = directUrl ?? proxyUrl;
  if (datasourceUrl === undefined) {
    throw new Error('No URL specified for OpenCostDatasource client. You can use directUrl in the spec to configure it.');
  }

  const specHeaders = proxy?.spec.headers;

  return {
    options: {
      datasourceUrl,
    },
    query: async (params, headers) => {
      let url = `${datasourceUrl}/api/search`;
      if (params) {
        url += '?' + new URLSearchParams(params as Record<string, string>);
      }
      const init = {
        method: 'GET',
        headers: headers ?? specHeaders,
      };

      const response = await fetch(url, init);

      try {
        const body = await response.json();
        return {
          status: response.ok ? 'success' : 'error',
          data: body.data,
        };
      } catch (e) {
        console.error('Invalid response from server', e);
        throw new Error('Invalid response from server', { cause: e });
      }
    },
  };
};

export const OpenCostDatasource: DatasourcePlugin<OpenCostDatasourceSpec, OpenCostDatasourceClient> = {
  createClient,
  OptionsEditorComponent: OpenCostDatasourceEditor,
  createInitialOptions: () => ({ directUrl: '' }),
};
