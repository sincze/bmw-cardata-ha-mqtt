// ============================================================
//  BMW CarData -> HA : Prepare
//  Input : one bmw-mqtt-bridge message  bmw/raw/<VIN>/<event>
//          payload = { vin, data: { descriptor: {value, unit, timestamp}, ... } }
//  Output: one msg per descriptor  { vin, payload: {name, value, unit, timestamp} }
//          plus a merged "vehicle.currentLocation" msg when lat/lon are known
// ============================================================

const p = msg.payload;
if (!p || typeof p !== "object" || !p.data || typeof p.data !== "object") {
    // bmw/status and other non-telemetry topics land here: ignore quietly
    return null;
}

// VIN: payload first, topic second (bmw/raw/<VIN>/<event>)
let vin = typeof p.vin === "string" ? p.vin.trim() : null;
if (!vin && typeof msg.topic === "string") {
    const parts = msg.topic.split("/");
    const i = parts.indexOf("raw");
    if (i >= 0 && parts[i + 1]) vin = parts[i + 1];
}
if (!vin) {
    node.warn("No VIN in payload or topic, skipping: " + msg.topic);
    return null;
}

const LOC = {
    "vehicle.cabin.infotainment.navigation.currentLocation.latitude": "latitude",
    "vehicle.cabin.infotainment.navigation.currentLocation.longitude": "longitude",
    "vehicle.cabin.infotainment.navigation.currentLocation.heading": "heading",
    "vehicle.cabin.infotainment.navigation.currentLocation.altitude": "altitude",
};

const out = [];
let locTouched = false;
const locKey = "bmwLocation_" + vin;
const loc = context.get(locKey) || {};

for (const [name, m] of Object.entries(p.data)) {
    if (!m || typeof m !== "object" || m.value === undefined || m.value === null) continue;

    const field = LOC[name];
    if (field) {
        const n = Number(m.value);
        if (Number.isFinite(n)) {
            loc[field] = n;
            loc.timestamp = m.timestamp;
            locTouched = true;
        }
        // GPS fields are also emitted as plain sensors below
    }

    out.push({
        vin,
        topic: msg.topic,
        payload: { name, value: m.value, unit: m.unit ?? null, timestamp: m.timestamp ?? null },
    });
}

if (locTouched) {
    context.set(locKey, loc);
    if (loc.latitude !== undefined && loc.longitude !== undefined) {
        out.push({
            vin,
            topic: msg.topic,
            payload: {
                name: "vehicle.currentLocation",
                value: { latitude: loc.latitude, longitude: loc.longitude, heading: loc.heading, altitude: loc.altitude },
                unit: null,
                timestamp: loc.timestamp,
            },
        });
    }
}

return out.length ? [out] : null;
