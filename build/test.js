// Runs both function nodes outside Node-RED against sample bridge payloads.
const fs = require("fs");
const path = require("path");

function makeNode(name) {
    const ctx = new Map();
    return {
        node: { warn: (m) => console.log(`[${name} warn]`, m), debug: (m) => console.log(`[${name} debug]`, m), error: console.error },
        context: { get: (k) => ctx.get(k), set: (k, v) => ctx.set(k, v) },
    };
}
function load(file, env) {
    const src = fs.readFileSync(path.join(__dirname, file), "utf8");
    return new Function("msg", "node", "context", src).bind(null);
}
const prep = load("prepare.js");
const disc = load("discovery.built.js");
const P = makeNode("prepare"), D = makeNode("discovery");

const VIN = "WBA7Y810X0CS12345";
const samples = [
    { topic: `bmw/raw/${VIN}/vehicleStatus`, payload: { vin: VIN, data: {
        "vehicle.cabin.door.row1.driver.isOpen": { value: false, unit: null, timestamp: "2026-10-04T10:00:00Z" },
        "vehicle.body.flap.isLocked": { value: true, unit: null, timestamp: "2026-10-04T10:00:00Z" },
        "vehicle.cabin.window.row1.driver.status": { value: "INTERMEDIATE", unit: null, timestamp: "2026-10-04T10:00:00Z" },
        "vehicle.drivetrain.batteryManagement.header": { value: 72, unit: "percent", timestamp: "2026-10-04T10:00:00Z" },
        "vehicle.powertrain.electric.battery.stateOfHealth.displayed": { value: 98, unit: null, timestamp: "2026-10-04T10:00:00Z" },
        "vehicle.chassis.axle.row1.wheel.left.tire.pressure": { value: 260, unit: "kpa", timestamp: "2026-10-04T10:00:00Z" },
        "vehicle.drivetrain.electricEngine.charging.consumptionOverLifeTime.overall.gridEnergy": { value: 4321.5, unit: "kWh", timestamp: "2026-10-04T10:00:00Z" },
        "vehicle.drivetrain.batteryManagement.maxEnergy": { value: 76, unit: "kWh", timestamp: "2026-10-04T10:00:00Z" },
        "vehicle.trip.segment.accumulated.drivetrain.electricEngine.energyConsumptionComfort": { value: 5.2, unit: "kWh", timestamp: "2026-10-04T10:00:00Z" },
        "vehicle.vehicle.travelledDistance": { value: 20100, unit: "km", timestamp: "2026-10-04T10:00:00Z" },
        "vehicle.drivetrain.avgElectricRangeConsumption": { value: 2777774, unit: "kWh/100km", timestamp: "2026-10-04T10:00:00Z" },
        "vehicle.cabin.infotainment.navigation.currentLocation.altitude": { value: 12, unit: "m", timestamp: "2026-10-04T10:00:00Z" },
        "vehicle.vehicle.averageWeeklyDistanceShortTerm": { value: 2, unit: "weeks", timestamp: "2026-10-04T10:00:00Z" },
        "vehicle.drivetrain.electricEngine.charging.status": { value: "NOCHARGING", unit: null, timestamp: "2026-10-04T10:00:00Z" },
        "vehicle.trip.segment.end.time": { value: "2026-10-04T09:30:00Z", unit: null, timestamp: "2026-10-04T10:00:00Z" },
        "vehicle.some.unknown.newDescriptorXyz": { value: 3, unit: "A", timestamp: "2026-10-04T10:00:00Z" },
    }}},
    { topic: `bmw/raw/${VIN}/location`, payload: { vin: VIN, data: {
        "vehicle.cabin.infotainment.navigation.currentLocation.latitude": { value: 51.59, unit: null, timestamp: "2026-10-04T10:00:01Z" },
    }}},
    { topic: `bmw/raw/${VIN}/location`, payload: { vin: VIN, data: {
        "vehicle.cabin.infotainment.navigation.currentLocation.longitude": { value: 4.78, unit: null, timestamp: "2026-10-04T10:00:02Z" },
        "vehicle.cabin.infotainment.navigation.currentLocation.heading": { value: 180, unit: null, timestamp: "2026-10-04T10:00:02Z" },
    }}},
    { topic: "bmw/status", payload: { connected: true } },
    { topic: `bmw/raw/WBAOTHERVIN0000001/x`, payload: { data: { "vehicle.isMoving": { value: true } } } },
];

let cfgCount = 0, stateCount = 0;
const seen = {};
for (const s of samples) {
    const r = prep(s, P.node, P.context);
    if (!r) { console.log(`-- ${s.topic}: prepare -> null`); continue; }
    for (const m of r[0]) {
        const out = disc(m, D.node, D.context);
        if (!out) { console.log(`   DROP ${m.payload.name}`); continue; }
        const [cfgs, states] = out;
        cfgCount += cfgs.length; stateCount += states.length;
        for (const c of cfgs) {
            const p = c.payload;
            const dom = c.topic.split("/")[1];
            seen[p.unique_id] = `${dom.padEnd(14)} ${String(p.name).padEnd(44)} unit=${p.unit_of_measurement ?? "-"} dc=${p.device_class ?? "-"} sc=${p.state_class ?? "-"}`;
        }
        for (const st of states) if (!st.topic.endsWith("/attributes")) console.log(`   STATE ${st.topic} = ${typeof st.payload === "object" ? JSON.stringify(st.payload) : st.payload}`);
    }
}
console.log("\nDiscovered entities:");
for (const [k, v] of Object.entries(seen)) console.log("  " + v);
console.log(`\nconfigs=${cfgCount} states=${stateCount}`);

// assertions
const assert = require("assert");
assert(seen[`bmw_${VIN}_body_flap_is_locked`].includes("dc=lock"), "lock class");
assert(seen[`bmw_${VIN}_cabin_window_row1_driver_status_open`].includes("binary_sensor"), "derived window binary");
assert(seen[`bmw_${VIN}_drivetrain_battery_management_header`].includes("dc=battery"), "battery class");
assert(seen[`bmw_${VIN}_powertrain_electric_battery_state_of_health_displayed`].includes("unit=%"), "forced unit");
assert(seen[`bmw_${VIN}_chassis_axle_row1_wheel_left_tire_pressure`].includes("unit=kPa dc=pressure"), "kpa normalised");
assert(seen[`bmw_${VIN}_drivetrain_electric_engine_charging_consumption_over_life_time_overall_grid_energy`].includes("sc=total_increasing"), "lifetime energy");
assert(seen[`bmw_${VIN}_drivetrain_battery_management_max_energy`].includes("dc=energy_storage"), "energy storage");
assert(seen[`bmw_${VIN}_trip_segment_accumulated_drivetrain_electric_engine_energy_consumption_comfort`].includes("dc=- sc=measurement"), "trip kWh must not be energy+measurement");
assert(!seen[`bmw_${VIN}_drivetrain_avg_electric_range_consumption`], "out-of-range dropped");
assert(seen[`bmw_${VIN}_location`].includes("device_tracker"), "tracker");
assert(seen[`bmw_${VIN}_trip_segment_end_time`].includes("dc=timestamp"), "timestamp class");
assert(seen["bmw_WBAOTHERVIN0000001_is_moving"].includes("dc=moving"), "VIN from topic + moving");
console.log("\nALL ASSERTIONS PASSED");
