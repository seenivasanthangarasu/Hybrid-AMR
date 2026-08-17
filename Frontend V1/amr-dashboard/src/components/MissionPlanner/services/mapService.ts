import { Waypoint } from '../types';
import L from 'leaflet';

// Map service for handling all map operations
export class MapService {
  private static instance: MapService;
  private map: L.Map | null = null;
  private waypointMarkers: Map<string, L.Marker> = new Map();
  private missionPath: L.Polyline | null = null;

  private constructor() {}

  static getInstance(): MapService {
    if (!MapService.instance) {
      MapService.instance = new MapService();
    }
    return MapService.instance;
  }

  initializeMap(mapElement: HTMLElement, center: [number, number] = [0, 0], zoom: number = 15): void {
    if (this.map) {
      this.map.remove();
    }

    this.map = L.map(mapElement, {
      center,
      zoom,
      zoomControl: true,
      attributionControl: false,
    });

    // Add OpenStreetMap tiles
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap contributors'
    }).addTo(this.map);

    // Add click handler for adding waypoints
    this.map.on('click', (e) => {
      this.handleMapClick(e);
    });
  }

  handleMapClick(event: L.LeafletEvent): void {
    // This will be handled by the parent component or event system
    console.log('Map clicked at:', event);
  }

  addWaypointMarker(waypoint: Waypoint, onClickCallback?: (waypoint: Waypoint) => void): void {
    if (!this.map) return;

    const marker = L.marker([waypoint.latitude, waypoint.longitude], {
      title: waypoint.name,
      draggable: true
    });

    // Add click handler to the marker
    if (onClickCallback) {
      marker.on('click', () => onClickCallback(waypoint));
    }

    // Add drag end handler
    marker.on('dragend', (e) => {
      const newPos = e.target.getLatLng();
      if (onClickCallback) {
        onClickCallback({ ...waypoint, latitude: newPos.lat, longitude: newPos.lng });
      }
    });

    marker.addTo(this.map);
    this.waypointMarkers.set(waypoint.id, marker);
  }

  updateWaypointMarkerPosition(id: string, lat: number, lng: number): void {
    const marker = this.waypointMarkers.get(id);
    if (marker) {
      marker.setLatLng([lat, lng]);
    }
  }

  removeWaypointMarker(id: string): void {
    const marker = this.waypointMarkers.get(id);
    if (marker) {
      marker.remove();
      this.waypointMarkers.delete(id);
    }
  }

  clearAllMarkers(): void {
    this.waypointMarkers.forEach(marker => marker.remove());
    this.waypointMarkers.clear();
  }

  drawMissionPath(waypoints: Waypoint[]): void {
    if (!this.map || waypoints.length < 2) return;

    const latLngs = waypoints.map(wp => [wp.latitude, wp.longitude]);

    if (this.missionPath) {
      this.missionPath.remove();
    }

    this.missionPath = L.polyline(latLngs, {
      color: '#3b82f6',
      weight: 4,
      opacity: 0.8
    }).addTo(this.map);
  }

  setView(lat: number, lng: number, zoom: number = 15): void {
    if (this.map) {
      this.map.setView([lat, lng], zoom);
    }
  }

  getMap(): L.Map | null {
    return this.map;
  }

  // Get the current map center
  getCenter(): [number, number] | null {
    if (!this.map) return null;
    const center = this.map.getCenter();
    return [center.lat, center.lng];
  }

  // Get the current zoom level
  getZoom(): number | null {
    if (!this.map) return null;
    return this.map.getZoom();
  }
}