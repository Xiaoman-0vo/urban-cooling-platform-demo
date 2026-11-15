# sc-datav attribution

Upstream: https://github.com/knight-L/sc-datav

Reviewed revision: `c1aebf1d9ceb6067d41cb6fd7440b00ec2d71f8e`

License: Apache License 2.0 (the upstream LICENSE is included alongside this file).

UrbanCool AI adapts the ECharts component lifecycle from
`src/components/chart.tsx`, and bounding-box UV mapping from
`src/pages/Demo0/map/shape.tsx`. The grid index's bounded paging and optional
play/pause interface is inspired by `src/components/seamVirtualScroll.tsx`.

Changes made on 2026-10-25: JavaScript/CSS integration with the existing React
application; explicit chart/GPU disposal and resizing; existing Chengdu geometry
and source statistics; semantic controls, keyboard pause and reduced-motion
handling. Source example metrics, heatmaps, textures, fonts and model assets
have not been imported. No upstream NOTICE file was present in the reviewed tree.

ECharts and Three.js remain separate npm dependencies with their own licenses.
