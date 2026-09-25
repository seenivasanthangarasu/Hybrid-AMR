#!/usr/bin/env python3
"""
Deterministic State Machine for Outdoor GPS Autonomous Navigation.
Enforces strict transitions and safety overrides.
"""

from enum import Enum
import time


class NavState(Enum):
    IDLE = "IDLE"
    WAITING_FOR_GPS = "WAITING_FOR_GPS"
    WAITING_FOR_VALID_GOAL = "WAITING_FOR_VALID_GOAL"
    NAVIGATING = "NAVIGATING"
    OBSTACLE_STOP = "OBSTACLE_STOP"
    GPS_LOST = "GPS_LOST"
    GOAL_REACHED = "GOAL_REACHED"
    ERROR = "ERROR"
    STOPPED = "STOPPED"


class NavigationStateMachine:

    def __init__(self, logger=None):
        self.current_state = NavState.IDLE
        self.last_transition_time = time.time()
        self.logger = logger
        self.state_reason = "System Initialized"

    def transition_to(self, new_state: NavState, reason: str = "") -> bool:
        if new_state == self.current_state:
            return False

        old_state = self.current_state
        self.current_state = new_state
        self.last_transition_time = time.time()
        self.state_reason = reason

        log_msg = f"STATE TRANSITION: [{old_state.value}] -> [{new_state.value}]"
        if reason:
            log_msg += f" (Reason: {reason})"

        if self.logger:
            if new_state in (NavState.ERROR, NavState.GPS_LOST, NavState.OBSTACLE_STOP):
                self.logger.warn(log_msg)
            elif new_state in (NavState.GOAL_REACHED, NavState.NAVIGATING):
                self.logger.info(log_msg)
            else:
                self.logger.info(log_msg)
        else:
            print(log_msg)

        return True

    @property
    def state(self) -> NavState:
        return self.current_state

    @property
    def state_str(self) -> str:
        return self.current_state.value

    @property
    def time_in_state(self) -> float:
        return time.time() - self.last_transition_time

    def is_autonomous_motion_allowed(self) -> bool:
        """Only allow motor commands strictly in NAVIGATING state."""
        return self.current_state == NavState.NAVIGATING
