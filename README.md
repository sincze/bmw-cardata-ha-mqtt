# bmw-cardata-ha-mqtt
BMW Cardata via MQTT Bridge to Homeassistant.

Based on the great work initiated here https://dj0abr.github.io/bmw-mqtt-bridge/ and https://github.com/dj0abr/bmw-mqtt-bridge

<img width="1041" height="140" alt="{E2F96E23-C3A1-4BA2-AE06-671F1D31EBF0}" src="https://github.com/user-attachments/assets/2fab2b3b-dfe4-4129-bad0-640cc3913303" />

The Node-Red flow will process incoming MQTT messages and convert them into AUTODISCOVERY messages for Homeassistant.

Adjust the following in the 'HA Discovery' node
```// ---------- VEHICLE CONFIG ----------
const vin = "YOUR_VIN";
const model = "YOUR_MODEL";
const vehicleName = "BMW Vehicle";
const manufacturer = "BMW";

// ---------- HOME ZONE CONFIG ----------
const homeLatitude = 0.0;   // YOUR_HOME_LATITUDE
const homeLongitude = 0.0;  // YOUR_HOME_LONGITUDE
const homeRadiusMeters = 100;
```

`homeLatitude`/`homeLongitude` should match your Home Assistant home zone coordinates, and `homeRadiusMeters` sets how close the car needs to be to be reported as `home` on the `device_tracker.bmw_location` entity.

# License
MIT License © 2025 SINCZE

See LICENSE for details.
