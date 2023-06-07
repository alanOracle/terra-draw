import { TerraDrawMouseEvent } from "../../../common";
import { BehaviorConfig, TerraDrawModeBehavior } from "../../base.behavior";
import { LineString, Polygon, Position } from "geojson";
import { SelectionPointBehavior } from "./selection-point.behavior";
import { MidPointBehavior } from "./midpoint.behavior";
import { centroid } from "../../../geometry/centroid";
import { haversineDistanceKilometers } from "../../../geometry/measure/haversine-distance";
import { transformScale } from "../../../geometry/transform/scale";
import { limitPrecision } from "../../../geometry/limit-decimal-precision";

export class ScaleFeatureBehavior extends TerraDrawModeBehavior {
	constructor(
		readonly config: BehaviorConfig,
		private readonly selectionPoints: SelectionPointBehavior,
		private readonly midPoints: MidPointBehavior
	) {
		super(config);
	}

	private lastDistance: number | undefined;

	reset() {
		this.lastDistance = undefined;
	}

	scale(event: TerraDrawMouseEvent, selectedId: string) {
		const geometry = this.store.getGeometryCopy<LineString | Polygon>(
			selectedId
		);

		// Update the geometry of the dragged feature
		if (geometry.type !== "Polygon" && geometry.type !== "LineString") {
			return;
		}

		if (event.setDraggability) {
			event.setDraggability(false);
		}

		const mouseCoord = [event.lng, event.lat];

		const distance = haversineDistanceKilometers(
			centroid({ type: "Feature", geometry, properties: {} }),
			mouseCoord
		);

		// We need an original bearing to compare against
		if (!this.lastDistance) {
			this.lastDistance = distance;
			return;
		}

		const scale = 1 - (this.lastDistance - distance) / distance;

		transformScale({ type: "Feature", geometry, properties: {} }, scale);

		let updatedCoords: Position[] | undefined;

		if (geometry.type === "Polygon") {
			updatedCoords = geometry.coordinates[0];
		} else if (geometry.type === "LineString") {
			updatedCoords = geometry.coordinates;
		} else {
			return;
		}

		// Ensure that coordinate precision is maintained
		updatedCoords.forEach((coordinate) => {
			coordinate[0] = limitPrecision(coordinate[0], this.coordinatePrecision);
			coordinate[1] = limitPrecision(coordinate[1], this.coordinatePrecision);
		});

		const updatedMidPoints = this.midPoints.getUpdated(updatedCoords) || [];

		const updatedSelectionPoints =
			this.selectionPoints.getUpdated(updatedCoords) || [];

		// Issue the update to the selected feature
		this.store.updateGeometry([
			{ id: selectedId, geometry },
			...updatedSelectionPoints,
			...updatedMidPoints,
		]);

		this.lastDistance = distance;
	}
}
