package model

import (
	"github.com/perses/shared/cue/common"
	"github.com/perses/spec/cue/datasource"
)

#kind: "OpenCostDatasource"
    
kind: #kind
spec: {
	datasource.#HTTPDatasourceSpec
}

#selector: common.#datasourceSelector & {_kind: #kind}
