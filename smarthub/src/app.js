const mqtt = require('mqtt')
const fs = require('fs');
var express = require('express');

const BambuSSDP = require('./bambu_ssdp_utils').BambuSSDP;
const bambuSSDP = new BambuSSDP();

const HubClient = require('./mqtt_utils').HubClient;
const hubClient = new HubClient();

const MultiPrinterClient = require('./mqtt_utils').MultiPrinterClient;
const printerClients = new MultiPrinterClient();

const HubConfig = require('./config_utils.js').HubConfig;
var config = new HubConfig();

var app = express();

const port = process.env.APP_PORT || 5000;


// messages from printer
function handleMessage(topic, message, originalHost, status) {
    // commented out for now but likely okay to leave uncommented once deployed.
    //console.log(`Received message from - Topic: ${topic}, Message: ${message.toString()}`);

    // adding the original printer host/ip to the message
    // only modification we will do to the messages, this way we can use this original ip if needed
    message = Buffer.from(message.toString().replace("{", "{\"original_host\":\"" + originalHost + "\", ", 'utf8'));
    if (status && (status == "online" || status == "offline")) {
        message = Buffer.from(message.toString().replace("{", "{\"status\":\"" + status + "\", ", 'utf8'));
    }
    
    hubClient.publish(topic, message);
}

// publish request message to printer
hubClient.on('publish-request', (sn, message) => {
    const client = printerClients.get("mqttjs_"+sn.toUpperCase());
    
    if(client) {
        client.publish("device/"+sn.toUpperCase()+"/request", message);
        console.log(`[MQTT] Message published to ${sn} on request topic`);
    } else {
      console.log(`[MQTT] No printer found with clientId '${sn}'. Failed to publish.`);
    }
});

printerClients.on('client-message', (sn, topic, message) => {
    hubClient.publish(topic, message);
});

printerClients.on('configure-client', (sn, ip) => {
    bambuSSDP.addConfiguredDevice(sn, ip);
});

printerClients.on('remove-client', (sn) => {
    bambuSSDP.removeDevice(sn);
});

printerClients.load(config);

// SSDP Setup
bambuSSDP.on('update-ip', (sn, ip) => {
    let serialNumber = sn.toUpperCase().trim();
    let ipAddr = ip.trim();
    var printerConf = config.getBySerial(serialNumber);
    
    if (printerConf && printerConf.length == 1 && printerConf[0]["host"].trim() != ipAddr) {
        // update and reload client;
        let access_code = printerConf[0]["password"];
        removePrinter(printerConf[0]["clientId"]);
        addPrinter(ipAddr, 8883, serialNumber.toUpperCase(), access_code);
    }
});

bambuSSDP.on('discovery', (sn, ip) => {
    //console.log(`${sn} at ${ip}`);
});

bambuSSDP.search();
//


// still test app, could loat in a frontend here for management
app.get('/', function (req, res) {
  res.send('Hello World!');
});

app.listen(port, function () {
  console.log(`[App] Example app listening on port ${port}!`);
});


