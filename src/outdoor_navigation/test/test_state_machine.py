#!/usr/bin/env python3
"""
Unit tests for Outdoor Navigation State Machine.
"""

import pytest
from outdoor_navigation.state_machine import NavState, NavigationStateMachine


def test_state_machine_transitions():
    sm = NavigationStateMachine()
    assert sm.state == NavState.IDLE
    assert not sm.is_autonomous_motion_allowed()

    # Transition to WAITING_FOR_GPS
    assert sm.transition_to(NavState.WAITING_FOR_GPS, "Waiting for fix") is True
    assert sm.state == NavState.WAITING_FOR_GPS
    assert not sm.is_autonomous_motion_allowed()

    # Repeated transition to same state returns False
    assert sm.transition_to(NavState.WAITING_FOR_GPS) is False

    # Transition to NAVIGATING
    assert sm.transition_to(NavState.NAVIGATING, "Fix and goal ready") is True
    assert sm.state == NavState.NAVIGATING
    assert sm.is_autonomous_motion_allowed() is True

    # Transition to OBSTACLE_STOP
    assert sm.transition_to(NavState.OBSTACLE_STOP, "Obstacle in path") is True
    assert sm.state == NavState.OBSTACLE_STOP
    assert not sm.is_autonomous_motion_allowed()

    # Resume to NAVIGATING
    assert sm.transition_to(NavState.NAVIGATING, "Obstacle cleared") is True
    assert sm.is_autonomous_motion_allowed() is True

    # Transition to GOAL_REACHED
    assert sm.transition_to(NavState.GOAL_REACHED, "Arrived at goal") is True
    assert not sm.is_autonomous_motion_allowed()
