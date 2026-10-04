"""Assemble flows.json + bmw_catalogue.json from catalogue.py, prepare.js, discovery.js."""
import json, pathlib, sys
sys.path.insert(0, str(pathlib.Path(__file__).parent))
import catalogue

HERE = pathlib.Path(__file__).parent
OUT = HERE.parent

cat = catalogue.as_json()
(OUT / "bmw_catalogue.json").write_text(json.dumps(cat, indent=2, ensure_ascii=False), encoding="utf-8")

prepare_js = (HERE / "prepare.js").read_text(encoding="utf-8")
discovery_js = (HERE / "discovery.js").read_text(encoding="utf-8").replace(
    "__CATALOGUE__", json.dumps(cat, ensure_ascii=False, separators=(",", ":"))
)
(HERE / "discovery.built.js").write_text(discovery_js, encoding="utf-8")

TAB = "54ba14f7a688b268"
BROKER = "df52700c.0c65c"

flows = [
    {"id": TAB, "type": "tab", "label": "BMW CarData → HA", "disabled": False, "info": ""},
    {"id": BROKER, "type": "mqtt-broker", "name": "Local Mosquitto", "broker": "mqtt.home.lan", "port": "1883",
     "clientid": "", "autoConnect": True, "usetls": False, "protocolVersion": "5", "keepalive": "60",
     "cleansession": True, "autoUnsubscribe": True, "birthTopic": "", "birthQos": "0", "birthPayload": "",
     "birthMsg": {}, "closeTopic": "", "closeQos": "0", "closePayload": "", "closeMsg": {},
     "willTopic": "", "willQos": "0", "willPayload": "", "willMsg": {}, "userProps": "", "sessionExpiry": ""},
    {"id": "bmw_in", "type": "mqtt in", "z": TAB, "name": "bmw/raw/#  (bmw-mqtt-bridge)", "topic": "bmw/raw/#",
     "qos": "1", "datatype": "json", "broker": BROKER, "nl": False, "rap": True, "rh": 0, "inputs": 0,
     "x": 180, "y": 120, "wires": [["bmw_prepare"]]},
    {"id": "bmw_prepare", "type": "function", "z": TAB, "name": "Prepare (flatten + VIN + GPS merge)",
     "func": prepare_js, "outputs": 1, "timeout": 0, "noerr": 0, "initialize": "", "finalize": "", "libs": [],
     "x": 460, "y": 120, "wires": [["bmw_discovery"]]},
    {"id": "bmw_discovery", "type": "function", "z": TAB, "name": "HA Autodiscovery (catalogue)",
     "func": discovery_js, "outputs": 2, "timeout": 0, "noerr": 0, "initialize": "", "finalize": "", "libs": [],
     "x": 760, "y": 120, "wires": [["bmw_out_cfg"], ["bmw_out_state"]]},
    {"id": "bmw_out_cfg", "type": "mqtt out", "z": TAB, "name": "homeassistant/.../config", "topic": "", "qos": "",
     "retain": "", "respTopic": "", "contentType": "", "userProps": "", "correl": "", "expiry": "",
     "broker": BROKER, "x": 1040, "y": 80, "wires": []},
    {"id": "bmw_out_state", "type": "mqtt out", "z": TAB, "name": "bmw/ha/<VIN>/.../state", "topic": "", "qos": "",
     "retain": "", "respTopic": "", "contentType": "", "userProps": "", "correl": "", "expiry": "",
     "broker": BROKER, "x": 1040, "y": 160, "wires": []},
    {"id": "bmw_debug", "type": "debug", "z": TAB, "name": "state debug", "active": False, "tosidebar": True,
     "console": False, "tostatus": False, "complete": "true", "targetType": "full", "statusVal": "", "statusType": "auto",
     "x": 1040, "y": 220, "wires": []},
]
# wire debug to state output too
flows[4]["wires"][1].append("bmw_debug")

(OUT / "flows.json").write_text(json.dumps(flows, indent=2, ensure_ascii=False), encoding="utf-8")
print("titles:", len(cat["titles"]), "| discovery.js:", len(discovery_js), "bytes | flows.json written")
