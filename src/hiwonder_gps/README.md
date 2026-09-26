# hiwonder_gps

ROS 2 driver for the **Hiwonder GNSS GPS Module** over serial (`/dev/hiwonder_gps` at 9600 baud).

## 📌 Features

* Reads standard NMEA sentences from GNSS serial receiver.
* Parses `$GNGGA`, `$GNRMC`, and related NMEA sentences into standard ROS 2 coordinates.
* Published Topics:
  * `/hiwonder/gps/fix` (`sensor_msgs/NavSatFix`): Latitude, longitude, altitude, and position covariance.
  * `/hiwonder/gps/nmea` (`std_msgs/String`): Raw NMEA sentence stream for logging and debugging.

## 🚀 Usage

```bash
ros2 run hiwonder_gps gps_node
```
