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

	private dragPosition: Position | undefined;

	get position() {
		return this.dragPosition ? this.dragPosition.concat() : undefined;
	}

	set position(newPosition: undefined | Position) {
		if (newPosition === undefined) {
			this.dragPosition = undefined;
			return;
		}

		if (
			!Array.isArray(newPosition) ||
			newPosition.length !== 2 ||
			typeof newPosition[0] !== "number" ||
			typeof newPosition[1] !== "number"
		) {
			throw new Error("Position must be [number, number] array");
		}

		this.dragPosition = newPosition.concat();
	}

	drag(event: TerraDrawMouseEvent, selectedId: string) {

		if (event.setDraggability) {
			event.setDraggability(false);
		}

		const geometry = this.store.getGeometryCopy(selectedId);
		const mouseCoord = [event.lng, event.lat];

		// Update the geometry of the dragged feature
		if (geometry.type === "Polygon" || geometry.type === "LineString") {
			let updatedCoords: Position[] | undefined;
			let upToCoord: number | undefined;

			if (geometry.type === "Polygon") {
				updatedCoords = geometry.coordinates[0];
				upToCoord = updatedCoords.length - 1;
			} else if (geometry.type === "LineString") {
				updatedCoords = geometry.coordinates;
				upToCoord = updatedCoords.length;
			}

			if (upToCoord === undefined || !updatedCoords || !this.dragPosition) {
				return false;
			}

			const delta = [
				this.dragPosition[0] - mouseCoord[0],
				this.dragPosition[1] - mouseCoord[1],
			];

			// Validation function to prevent delta to go outside a certain range
			function validateDeltaRange(deltaIdx: number,position: Position,min: number,max: number){
				const updatedCoordinate = position[deltaIdx] - delta[deltaIdx];
				if (updatedCoordinate < min) delta[deltaIdx] = min - position[deltaIdx];
				if (updatedCoordinate > max) delta[deltaIdx] = max - position[deltaIdx];
			}

			// make delta to not update a coordinate outside the map
			for (let i = 0; i < upToCoord; i++) {
				const coordinate = updatedCoords[i];
				// validateDeltaRange(0,coordinate,-180,180);
				validateDeltaRange(1,coordinate,-85,85);
			}

			for (let i = 0; i < upToCoord; i++) {
				const coordinate = updatedCoords[i];
				updatedCoords[i] = [coordinate[0] - delta[0], coordinate[1] - delta[1]];
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
				{ id: selectedId, geometry },
				...updatedSelectionPoints,
				...updatedMidPoints,
			]);

			// Update mid point positions
		} else if (geometry.type === "Point") {
			// For mouse points we can simply move it
			// to the dragged position
			this.store.updateGeometry([
				{
					id: selectedId,
					geometry: {
						type: "Point",
						coordinates: mouseCoord,
					},
				},
			]);
		}
	}
}
