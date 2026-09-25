#!/usr/bin/env python3
"""
Unit tests for Outdoor Navigation Geodesy Module.
"""

import math
import pytest
from outdoor_navigation.geodesy import (
    validate_coordinates,
    haversine_distance,
    initial_bearing,
    geodetic_to_enu,
    enu_to_geodetic,
    normalize_angle_rad,
    normalize_angle_deg,
    compass_to_enu_yaw,
    enu_yaw_to_compass
)


def test_validate_coordinates():
    # Valid coordinates
    ok, err = validate_coordinates(12.9715987, 77.5945627)
    assert ok is True
    assert err == ""

    # Out of range latitude
    ok, err = validate_coordinates(95.0, 77.0)
    assert ok is False
    assert "Latitude" in err

    ok, err = validate_coordinates(-91.0, 77.0)
    assert ok is False

    # Out of range longitude
    ok, err = validate_coordinates(12.0, 185.0)
    assert ok is False
    assert "Longitude" in err

    # Null Island (0, 0)
    ok, err = validate_coordinates(0.0, 0.0)
    assert ok is False
    assert "uninitialized" in err

    # NaN / Inf
    ok, err = validate_coordinates(float('nan'), 77.0)
    assert ok is False

    ok, err = validate_coordinates(12.0, float('inf'))
    assert ok is False


def test_haversine_distance():
    # London (51.5074, -0.1278) to Paris (48.8566, 2.3522) ~ 343.5 km
    d = haversine_distance(51.5074, -0.1278, 48.8566, 2.3522)
    assert 340000 < d < 350000

    # Short distance: 100m North
    # 1 deg latitude ~ 111,000m -> 0.0009 deg ~ 100m
    d_short = haversine_distance(12.0, 77.0, 12.0009, 77.0)
    assert 90.0 < d_short < 110.0

    # Same point
    assert haversine_distance(12.0, 77.0, 12.0, 77.0) == 0.0


def test_initial_bearing():
    # Due North: bearing should be 0 deg
    b_north = initial_bearing(12.0, 77.0, 13.0, 77.0)
    assert abs(b_north - 0.0) < 0.1

    # Due East: bearing should be 90 deg
    b_east = initial_bearing(0.0, 77.0, 0.0, 78.0)
    assert abs(b_east - 90.0) < 0.1

    # Due South: bearing should be 180 deg
    b_south = initial_bearing(13.0, 77.0, 12.0, 77.0)
    assert abs(b_south - 180.0) < 0.1

    # Due West: bearing should be 270 deg
    b_west = initial_bearing(0.0, 78.0, 0.0, 77.0)
    assert abs(b_west - 270.0) < 0.1


def test_geodetic_enu_roundtrip():
    lat0, lon0 = 12.9715987, 77.5945627
    lat_target, lon_target = 12.9725000, 77.5955000

    # Convert to ENU
    x_east, y_north = geodetic_to_enu(lat_target, lon_target, lat0, lon0)
    assert x_east > 0 # East of origin
    assert y_north > 0 # North of origin

    # Convert back to Geodetic
    lat_recovered, lon_recovered = enu_to_geodetic(x_east, y_north, lat0, lon0)
    assert abs(lat_recovered - lat_target) < 1e-7
    assert abs(lon_recovered - lon_target) < 1e-7


def test_angle_normalizations():
    # Radians
    assert abs(normalize_angle_rad(3.0 * math.pi) - math.pi) < 1e-6
    assert abs(normalize_angle_rad(-3.0 * math.pi) - (-math.pi)) < 1e-6

    # Degrees
    assert abs(normalize_angle_deg(200.0) - (-160.0)) < 1e-6
    assert abs(normalize_angle_deg(-200.0) - (160.0)) < 1e-6


def test_compass_enu_conversions():
    # Compass 0° (North) -> ENU yaw = pi/2 rad (90°)
    yaw_north = compass_to_enu_yaw(0.0)
    assert abs(yaw_north - math.pi / 2.0) < 1e-6
    assert abs(enu_yaw_to_compass(yaw_north) - 0.0) < 1e-6

    # Compass 90° (East) -> ENU yaw = 0.0 rad
    yaw_east = compass_to_enu_yaw(90.0)
    assert abs(yaw_east - 0.0) < 1e-6
    assert abs(enu_yaw_to_compass(yaw_east) - 90.0) < 1e-6
