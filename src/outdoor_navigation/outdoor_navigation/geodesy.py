#!/usr/bin/env python3
"""
Geodesy and Coordinate Transformations for Outdoor Autonomous Navigation.
Implements WGS-84 Ellipsoid transformations, Local Tangent Plane (East-North-Up),
Haversine distance, and Great Circle bearing calculations.
"""

import math
from typing import Tuple, Optional

# WGS-84 Ellipsoid Constants
WGS84_A = 6378137.0          # Semi-major axis (meters)
WGS84_F = 1.0 / 298.257223563 # Flattening
WGS84_E2 = 2.0 * WGS84_F - WGS84_F ** 2 # First eccentricity squared (~0.00669437999014)
EARTH_RADIUS = 6371000.0     # Mean earth radius (meters)


def validate_coordinates(lat: float, lon: float) -> Tuple[bool, str]:
    """
    Validates geographic latitude and longitude.
    Returns (True, '') if valid, (False, 'error description') otherwise.
    """
    if lat is None or lon is None:
        return False, "Coordinates cannot be None."
    try:
        lat_f = float(lat)
        lon_f = float(lon)
    except (ValueError, TypeError):
        return False, f"Coordinates must be floating point numbers (got lat={lat}, lon={lon})."

    if math.isnan(lat_f) or math.isinf(lat_f):
        return False, f"Invalid latitude (NaN or Inf): {lat_f}"
    if math.isnan(lon_f) or math.isinf(lon_f):
        return False, f"Invalid longitude (NaN or Inf): {lon_f}"

    if not (-90.0 <= lat_f <= 90.0):
        return False, f"Latitude {lat_f} is out of bounds [-90.0, +90.0]."
    if not (-180.0 <= lon_f <= 180.0):
        return False, f"Longitude {lon_f} is out of bounds [-180.0, +180.0]."

    # Check for uninitialized (0.0, 0.0) null island
    if abs(lat_f) < 1e-7 and abs(lon_f) < 1e-7:
        return False, "Coordinates (0.0, 0.0) indicate uninitialized GPS fix."

    return True, ""


def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Calculates great-circle distance between two points in meters using Haversine formula.
    """
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = (math.sin(delta_phi / 2.0) ** 2 +
         math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0) ** 2)
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(max(0.0, 1.0 - a)))
    return EARTH_RADIUS * c


def initial_bearing(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Calculates initial compass bearing (azimuth) from point 1 to point 2.
    Returns bearing in degrees [0, 360) clockwise from True North.
    0° = North, 90° = East, 180° = South, 270° = West.
    """
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_lambda = math.radians(lon2 - lon1)

    y = math.sin(delta_lambda) * math.cos(phi2)
    x = math.cos(phi1) * math.sin(phi2) - math.sin(phi1) * math.cos(phi2) * math.cos(delta_lambda)

    bearing_rad = math.atan2(y, x)
    bearing_deg = (math.degrees(bearing_rad) + 360.0) % 360.0
    return bearing_deg


def geodetic_to_enu(lat: float, lon: float, lat0: float, lon0: float) -> Tuple[float, float]:
    """
    Projects geodetic coordinates (lat, lon) to Local Tangent Plane East-North-Up (ENU)
    relative to reference datum origin (lat0, lon0) using WGS-84 ellipsoidal radii.
    Returns (x_east, y_north) in meters.
    """
    phi0 = math.radians(lat0)
    sin_phi0 = math.sin(phi0)
    denom = math.sqrt(1.0 - WGS84_E2 * sin_phi0 * sin_phi0)

    # Prime vertical radius of curvature (East-West)
    N = WGS84_A / denom
    # Meridian radius of curvature (North-South)
    M = WGS84_A * (1.0 - WGS84_E2) / (denom ** 3)

    delta_lat_rad = math.radians(lat - lat0)
    delta_lon_rad = math.radians(lon - lon0)

    x_east = delta_lon_rad * N * math.cos(phi0)
    y_north = delta_lat_rad * M

    return x_east, y_north


def enu_to_geodetic(x_east: float, y_north: float, lat0: float, lon0: float) -> Tuple[float, float]:
    """
    Converts Local Tangent Plane (ENU) coordinates (x_east, y_north) back to geodetic (lat, lon).
    Returns (lat, lon) in decimal degrees.
    """
    phi0 = math.radians(lat0)
    sin_phi0 = math.sin(phi0)
    denom = math.sqrt(1.0 - WGS84_E2 * sin_phi0 * sin_phi0)

    N = WGS84_A / denom
    M = WGS84_A * (1.0 - WGS84_E2) / (denom ** 3)

    delta_lat_rad = y_north / M
    delta_lon_rad = x_east / (N * math.cos(phi0)) if abs(math.cos(phi0)) > 1e-9 else 0.0

    lat = lat0 + math.degrees(delta_lat_rad)
    lon = lon0 + math.degrees(delta_lon_rad)

    return lat, lon


def normalize_angle_rad(angle_rad: float) -> float:
    """
    Normalizes angle in radians to the range [-pi, +pi].
    """
    return math.atan2(math.sin(angle_rad), math.cos(angle_rad))


def normalize_angle_deg(angle_deg: float) -> float:
    """
    Normalizes angle in degrees to the range [-180.0, +180.0].
    """
    normalized = (angle_deg + 180.0) % 360.0 - 180.0
    return normalized


def compass_to_enu_yaw(compass_bearing_deg: float) -> float:
    """
    Converts compass bearing (0° North, 90° East, clockwise)
    to ROS standard ENU yaw (0 rad East, pi/2 rad North, counter-clockwise) in radians.
    """
    # ENU angle = 90° - compass_bearing
    enu_deg = 90.0 - compass_bearing_deg
    return normalize_angle_rad(math.radians(enu_deg))


def enu_yaw_to_compass(enu_yaw_rad: float) -> float:
    """
    Converts ROS standard ENU yaw (radians) to compass bearing (degrees [0, 360)).
    """
    enu_deg = math.degrees(enu_yaw_rad)
    compass_deg = (90.0 - enu_deg) % 360.0
    return compass_deg
