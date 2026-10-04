// ============================================================
//  BMW CarData -> HA : Autodiscovery (catalogue driven)
//  Input : { vin, payload: {name, value, unit, timestamp} }  (from "Prepare")
//  Output 1: discovery config  (retained)
//  Output 2: state / attributes (retained)
//
//  Titles & classification rules derived from kvanbiesen/bmw-cardata-ha
//  (BSD-2-Clause) which generated them from BMW's CarData catalogue.
// ============================================================

// ---------- USER CONFIG ----------
// One entry per car. Anything not listed falls back to "BMW <last 7 of VIN>".
const VEHICLES = {
    // "WBA12345678901234": { name: "BMW i4", model: "i4 eDrive40", manufacturer: "BMW" },
};
const DISCOVERY_PREFIX = "homeassistant";
const STATE_PREFIX     = "bmw/ha";          // where state topics live
const BRIDGE_STATUS    = "bmw/status";      // bmw-mqtt-bridge availability (LOCAL_PREFIX + "status")
const PUBLISH_ATTRIBUTES = true;            // extra topic per entity with timestamp/descriptor
const EXPIRE_AFTER_S   = 0;                 // >0 marks sensors unavailable after N s silence

// ---------- CATALOGUE (generated) ----------
const C = __CATALOGUE__;

// ---------- helpers ----------
const S = (arr) => new Set(arr);
const BATTERY = S(C.battery), LIFETIME = S(C.lifetimeTotal), ESTORE = S(C.energyStorage),
      FUELVOL = S(C.fuelVolume), DOOR = S(C.door), WINBOOL = S(C.windowBool),
      MOTION = S(C.motion), LOCK = S(C.lock), PLUG = S(C.plug);

function snake(raw) {
    return raw.replace(/^vehicle\./i, "")
        .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
        .replace(/[^a-zA-Z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .toLowerCase();
}

function fallbackTitle(raw) {
    return raw.replace(/^vehicle\./i, "")
        .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
        .replace(/[._-]+/g, " ")
        .replace(/\brow1\b/gi, "front").replace(/\brow2\b/gi, "rear").replace(/\brow3\b/gi, "third row")
        .replace(/\bis (\w+)/gi, "$1")
        .split(/\s+/).filter(Boolean)
        .map((t, i) => i === 0 ? t[0].toUpperCase() + t.slice(1) : t.toLowerCase())
        .join(" ");
}

function normUnit(raw, descriptor) {
    if (raw === null || raw === undefined || String(raw).trim() === "") {
        return { unit: C.forcedUnits[descriptor] || null, mult: 1 };
    }
    const s = String(raw).trim();
    const m = C.unitMap[s.toLowerCase()];
    return m ? { unit: m[0], mult: m[1] } : { unit: s, mult: 1 };
}

function sensorDeviceClass(descriptor, unit) {
    if (!unit) return null;
    if (FUELVOL.has(descriptor)) return "volume_storage";
    if (ESTORE.has(descriptor))  return "energy_storage";
    if (BATTERY.has(descriptor) && unit === "%") return "battery";
    if (unit === "m") {
        const d = descriptor.toLowerCase();
        if (/altitude|elevation|height|position|location|distance/.test(d)) return "distance";
        if (/time|duration|minute/.test(d)) return "duration";
        return null;
    }
    return C.unitDeviceClass[unit] || null;
}

function device(vin) {
    const v = VEHICLES[vin] || {};
    return {
        identifiers: [`bmw_${vin}`],
        name: v.name || `BMW ${vin.slice(-7)}`,
        manufacturer: v.manufacturer || "BMW",
        model: v.model || undefined,
        serial_number: vin,
    };
}

const ORIGIN = { name: "bmw-cardata-ha-mqtt", sw_version: "2.0", support_url: "https://github.com/sincze/bmw-cardata-ha-mqtt" };

function baseConfig(vin, objectId, name) {
    const cfg = {
        name,
        unique_id: `bmw_${vin}_${objectId}`,
        has_entity_name: true,
        device: device(vin),
        origin: ORIGIN,
        availability_topic: BRIDGE_STATUS,
        payload_available: "true",
        payload_not_available: "false",
    };
    if (EXPIRE_AFTER_S > 0) cfg.expire_after = EXPIRE_AFTER_S;
    return cfg;
}

function clean(o) { for (const k of Object.keys(o)) if (o[k] === undefined || o[k] === null) delete o[k]; return o; }

// ---------- input ----------
const vin = msg.vin;
const p = msg.payload;
if (!vin || !p || !p.name || p.value === undefined || p.value === null) return null;

const descriptor = p.name;
let value = p.value;
const ts = p.timestamp || null;
const configs = [];
const states  = [];

// ---------- device tracker ----------
if (descriptor === "vehicle.currentLocation" && typeof value === "object") {
    const oid = "location";
    const cfgTopic  = `${DISCOVERY_PREFIX}/device_tracker/bmw_${vin}/${oid}/config`;
    const attrTopic = `${STATE_PREFIX}/${vin}/${oid}/attributes`;
    const cfg = baseConfig(vin, oid, "Location");
    cfg.state_topic = `${STATE_PREFIX}/${vin}/${oid}/state`;   // required by HA; zone is derived from attributes
    cfg.json_attributes_topic = attrTopic;
    cfg.source_type = "gps";
    cfg.icon = "mdi:car";
    configs.push({ topic: cfgTopic, payload: cfg, retain: true, qos: 1 });
    states.push({
        topic: attrTopic,
        payload: clean({ latitude: value.latitude, longitude: value.longitude, altitude: value.altitude, course: value.heading, gps_accuracy: 10, timestamp: ts }),
        retain: true, qos: 1,
    });
    return [configs, states];
}

// ---------- value sanity ----------
const limits = C.valueLimits[descriptor];
if (limits && typeof value === "number" && (value < limits[0] || value > limits[1])) {
    node.debug(`Dropping out-of-range ${descriptor}=${value}`);
    return null;
}

const oid = snake(descriptor);
const title = C.titles[descriptor] || fallbackTitle(descriptor);
const isBool = typeof value === "boolean";
const isNum  = typeof value === "number" && Number.isFinite(value);

// ---------- binary sensor (native booleans) ----------
if (isBool) {
    const cfg = baseConfig(vin, oid, title);
    cfg.state_topic = `${STATE_PREFIX}/${vin}/${oid}/state`;
    cfg.payload_on = "ON"; cfg.payload_off = "OFF";
    let stateVal = value;
    if (DOOR.has(descriptor))         cfg.device_class = "door";
    else if (WINBOOL.has(descriptor)) cfg.device_class = "window";
    else if (MOTION.has(descriptor))  cfg.device_class = "moving";
    else if (PLUG.has(descriptor))    cfg.device_class = "plug";
    else if (LOCK.has(descriptor))  { cfg.device_class = "lock"; stateVal = !value; } // HA lock: ON = unlocked
    if (/isIgnitionOn|engine\.isActive|lights\.isRunningOn/.test(descriptor)) cfg.device_class = "running";
    if (/preConditioning\.isRemoteEngineRunning|isOn$/.test(descriptor) && !cfg.device_class) cfg.icon = "mdi:power";
    if (PUBLISH_ATTRIBUTES) cfg.json_attributes_topic = `${STATE_PREFIX}/${vin}/${oid}/attributes`;

    configs.push({ topic: `${DISCOVERY_PREFIX}/binary_sensor/bmw_${vin}/${oid}/config`, payload: clean(cfg), retain: true, qos: 1 });
    states.push({ topic: cfg.state_topic, payload: stateVal ? "ON" : "OFF", retain: true, qos: 1 });
    if (PUBLISH_ATTRIBUTES) states.push({ topic: cfg.json_attributes_topic, payload: { descriptor, timestamp: ts, raw: value }, retain: true, qos: 1 });
    return [configs, states];
}

// ---------- sensor ----------
const { unit: rawUnit, mult } = normUnit(p.unit, descriptor);
let unit = rawUnit;
if (isNum && mult !== 1) value = value * mult;

let deviceClass = isNum ? sensorDeviceClass(descriptor, unit) : null;
let stateClass  = isNum ? "measurement" : null;

if (LIFETIME.has(descriptor)) stateClass = "total_increasing";
// HA refuses device_class energy / volume with state_class measurement
if ((deviceClass === "energy" || deviceClass === "volume") && stateClass === "measurement") deviceClass = null;
if (/pressureTarget|\.target$|targetMin|acLimit\.(max|min)|batterySizeMax/.test(descriptor)) stateClass = null; // settings, not measurements

if (!isNum) { unit = null; deviceClass = null; stateClass = null; }

const cfg = baseConfig(vin, oid, title);
cfg.state_topic = `${STATE_PREFIX}/${vin}/${oid}/state`;
cfg.unit_of_measurement = unit;
cfg.device_class = deviceClass;
cfg.state_class = stateClass;
cfg.suggested_display_precision = deviceClass ? C.displayPrecision[deviceClass] : undefined;
cfg.icon = C.icons[descriptor];
if (!isNum && !cfg.icon) cfg.icon = "mdi:information-outline";
if (/time$|Time$|date/i.test(descriptor) && typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)) cfg.device_class = "timestamp";
if (PUBLISH_ATTRIBUTES) cfg.json_attributes_topic = `${STATE_PREFIX}/${vin}/${oid}/attributes`;

configs.push({ topic: `${DISCOVERY_PREFIX}/sensor/bmw_${vin}/${oid}/config`, payload: clean(cfg), retain: true, qos: 1 });
states.push({ topic: cfg.state_topic, payload: typeof value === "object" ? JSON.stringify(value) : String(value), retain: true, qos: 1 });
if (PUBLISH_ATTRIBUTES) states.push({ topic: cfg.json_attributes_topic, payload: { descriptor, timestamp: ts, raw_unit: p.unit ?? null }, retain: true, qos: 1 });

// ---------- derived window/sunroof binary sensor from enum ----------
const openTitle = C.openingStatus[descriptor];
if (openTitle && typeof value === "string") {
    const v = value.trim().toUpperCase();
    const isOpen = (v === "OPEN" || v === "INTERMEDIATE") ? true : (v === "CLOSED" ? false : null);
    const boid = `${oid}_open`;
    const bcfg = baseConfig(vin, boid, openTitle);
    bcfg.state_topic = `${STATE_PREFIX}/${vin}/${boid}/state`;
    bcfg.device_class = "window";
    bcfg.payload_on = "ON"; bcfg.payload_off = "OFF";
    configs.push({ topic: `${DISCOVERY_PREFIX}/binary_sensor/bmw_${vin}/${boid}/config`, payload: clean(bcfg), retain: true, qos: 1 });
    if (isOpen !== null) states.push({ topic: bcfg.state_topic, payload: isOpen ? "ON" : "OFF", retain: true, qos: 1 });
}

return [configs, states];
