import { TerraDrawMouseEvent } from "../../../common";
import { BehaviorConfig, TerraDrawModeBehavior } from "../../base.behavior";
import { FeaturesAtMouseEventBehavior } from "./features-at-mouse-event.behavior";
import { Position } from "geojson";
import { SelectionPointBehavior } from "./selection-point.behavior";
import { MidPointBehavior } from "./midpoint.behavior";

export class DragFeatureBehavior extends TerraDrawModeBehavior {
	constructor(
		readonly config: BehaviorConfig,
		private readonly featuresAtMouseEvent: FeaturesAtMouseEventBehavior,
		private readonly selectionPoints: SelectionPointBehavior,
		private readonly midPoints: MidPointBehavior
	) {
		super(config);
	}

	private draggedFeatureId: string | null = null;

	private dragPosition: Position | undefined;

	// get position() {
	// 	return this.dragPosition ? this.dragPosition.concat() : undefined;
	// }

	// set position(newPosition: undefined | Position) {
	// 	if (newPosition === undefined) {
	// 		this.dragPosition = undefined;
	// 		return;
	// 	}

	// 	if (
	// 		!Array.isArray(newPosition) ||
	// 		newPosition.length !== 2 ||
	// 		typeof newPosition[0] !== "number" ||
	// 		typeof newPosition[1] !== "number"
	// 	) {
	// 		throw new Error("Position must be [number, number] array");
	// 	}

	// 	this.dragPosition = newPosition.concat();
	// }

	startDragging(event: TerraDrawMouseEvent, id: string) {
		this.draggedFeatureId = id;
		this.dragPosition = [event.lng, event.lat];
	}

	stopDragging() {
		this.draggedFeatureId = null;
		this.dragPosition = undefined;
	}

	isDragging() {
		return this.draggedFeatureId !== null;
	}

	canDrag(event: TerraDrawMouseEvent, selectedId: string) {
		const { clickedFeature } = this.featuresAtMouseEvent.find(event, true);

		// If the cursor is not over the selected
		// feature then we don't want to drag
		if (!clickedFeature || clickedFeature.id !== selectedId) {
			return false;
		}

		return true;
	}

	drag(event: TerraDrawMouseEvent) {
		if (!this.draggedFeatureId) {
			return;
		}

		const geometry = this.store.getGeometryCopy(this.draggedFeatureId);
		const mouseCoord = [event.lng, event.lat];

		// Update the geometry of the dragged feature
		if (geometry.type === "Polygon" || geometry.type === "LineString") {
			let updatedCoords: Position[];
			let upToCoord: number;

			if (geometry.type === "Polygon") {
				updatedCoords = geometry.coordinates[0];
				upToCoord = updatedCoords.length - 1;
			} else {
				// Must be LineString here
				updatedCoords = geometry.coordinates;
				upToCoord = updatedCoords.length;
			}

			if (!this.dragPosition) {
				return false;
			}

			const delta = [
				this.dragPosition[0] - mouseCoord[0],
				this.dragPosition[1] - mouseCoord[1],
			];

			// Validation function to prevent delta to go outside a certain range
			function validateDeltaRange(
				deltaIdx: number,
				position: Position,
				min: number,
				max: number
			) {
				const updatedCoordinate = position[deltaIdx] - delta[deltaIdx];
				if (updatedCoordinate < min) delta[deltaIdx] = min - position[deltaIdx];
				if (updatedCoordinate > max) delta[deltaIdx] = max - position[deltaIdx];
			}

			// make delta to not update a coordinate outside the map
			for (let i = 0; i < upToCoord; i++) {
				const coordinate = updatedCoords[i];
				// validateDeltaRange(0,coordinate,-180,180);
				validateDeltaRange(1, coordinate, -85, 85);
			}

			for (let i = 0; i < upToCoord; i++) {
				const coordinate = updatedCoords[i];
				const delta = [
					this.dragPosition[0] - mouseCoord[0],
					this.dragPosition[1] - mouseCoord[1],
				];

				const updatedLng = coordinate[0] - delta[0];
				const updatedLat = coordinate[1] - delta[1];

				// Ensure that coordinates are valid
				if (
					updatedLng > 180 ||
					updatedLng < -180 ||
					updatedLat > 90 ||
					updatedLat < -90
				) {
					return false;
				}

				updatedCoords[i] = [updatedLng, coordinate[1] - delta[1]];
			}

			// Set final coordinate identical to first
			// We only want to do this for polygons!
			if (geometry.type === "Polygon") {
				updatedCoords[updatedCoords.length - 1] = [
					updatedCoords[0][0],
					updatedCoords[0][1],
				];
			}

			const updatedSelectionPoints =
				this.selectionPoints.getUpdated(updatedCoords) || [];

			const updatedMidPoints = this.midPoints.getUpdated(updatedCoords) || [];

			// Issue the update to the selected feature
			this.store.updateGeometry([
				{ id: this.draggedFeatureId, geometry },
				...updatedSelectionPoints,
				...updatedMidPoints,
			]);

			this.dragPosition = [event.lng, event.lat];

			// Update mid point positions
		} else if (geometry.type === "Point") {
			// For mouse points we can simply move it
			// to the dragged position
			this.store.updateGeometry([
				{
					id: this.draggedFeatureId,
					geometry: {
						type: "Point",
						coordinates: mouseCoord,
					},
				},
			]);

			this.dragPosition = [event.lng, event.lat];
		}
	}
}
