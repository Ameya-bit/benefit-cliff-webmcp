/**
 * The map's legend, docked at the top of the map card (not the chart's
 * foot) so the space under the chart stays clear for the connector beams
 * that tie the map to the detail tiles below.
 */

import { BASE_LAYER, PROGRAM_LAYERS } from "./palette";

export function MapLegend() {
  return (
    <div className="legend map-legend">
      <span className="legend-item">
        <span className="swatch" style={{ background: BASE_LAYER.color }} />
        {BASE_LAYER.label}
      </span>
      {PROGRAM_LAYERS.map((layer) => (
        <span key={layer.slug} className="legend-item">
          <span className="swatch" style={{ background: layer.color }} />
          {layer.label}
        </span>
      ))}
    </div>
  );
}
