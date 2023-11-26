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

app.use(express.json());
app.use(express.urlencoded({ extended: true }));


//  MQTT setup
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
    config.removeBySerial(sn);
});

printerClients.load(config);
// End MQTT

// SSDP Setup
bambuSSDP.on('update-ip', (sn, ip) => {
    let serialNumber = sn.toUpperCase().trim();
    let ipAddr = ip.trim();
    var printerConf = config.getBySerial(serialNumber);
    
    if (printerConf && printerConf.length == 1 && printerConf[0]["host"].trim() != ipAddr) {
        // update and reload client;
        let access_code = printerConf[0]["password"];
        
        printerClients.remove(printerConf[0]["clientId"]);
        let newConfig = config.add(ipAddr, 8883, serialNumber.toUpperCase(), access_code);
        printerClients.add(newConfig);
    }
});

bambuSSDP.on('discovery', (sn, ip) => {
    //console.log(`${sn} at ${ip}`);
});

bambuSSDP.on('update-model', (sn, model) => {
    if (model == undefined) {
        return;
    }
    if (model == "3DPrinter-X1-Carbon" || model == "BL-P001") {
        config.updateModel(sn, "X1C");
    }
    else if (model == "3DPrinter-X1" || model == "BL-P001") {
        config.updateModel(sn, "X1");
    }
    else if (model == "C11") {
        config.updateModel(sn, "P1P");
    }
    else if (model == "C12") {
        config.updateModel(sn, "P1S");
    }
    else if (model == "C13") {
        config.updateModel(sn, "X1E");
    }
    else if (model == "N1") {
        config.updateModel(sn, "A1 Mini");
    }
});

bambuSSDP.search();
// End SSDP


// still test app, could loat in a frontend here for management
app.get('/', function (req, res) {
  res.send('Hello World!');
});

app.get('/printers', function(req, res) {
    let printer_list = [];
    config.printerConfigs.forEach((conf) => {
        let printer = {
            "ip": conf.host,
            "serialNumber": conf.clientId.replace("mqttjs_", ""),
            "status": printerClients.getStatus(conf.clientId)
        };
        printer_list.push(printer);
    })
    console.log("[APP] [GET] /printers - fetching all configured printers");
    res.send(printer_list);
});

app.get('/printers/query', function(req, res) {
    let serialNumber = req.query.serialNumber;
    let ip = req.query.ip;
    let status = req.query.status;
    let printer_list = [];
    
    config.printerConfigs.forEach((conf) => {
        if( (!serialNumber || serialNumber == conf.clientId.replace("mqttjs_", "")) 
            && (!ip || ip == conf.host)) {
            if(!status || printerClients.getStatus(conf.clientId) == status) {
                printer_list.push({
                    "ip": conf.host,
                    "serialNumber": conf.clientId.replace("mqttjs_", ""),
                    "status": printerClients.getStatus(conf.clientId)
                });
            }
        }
    })
    console.log(`[APP] [GET] /printers/query - querying printers with (serialNumber=${serialNumber}, ip=${ip}, status=${status})`);
    res.send(printer_list);
});

app.get('/printers/:serialNumber', function(req, res) {
    let serialNumber = req.params.serialNumber;
    let printer = null;
    
    config.printerConfigs.forEach((conf) => {
        if( !serialNumber || serialNumber == conf.clientId.replace("mqttjs_", "")) {
            printer = {
                "ip": conf.host,
                "serialNumber": conf.clientId.replace("mqttjs_", ""),
                "status": printerClients.getStatus(conf.clientId)
            };
            return;
        }
    })
    if (printer) {
        console.log(`[APP] [GET] /printers - fetching ${serialNumber}`);
        res.send(printer);
    } else {
        console.log(`[APP] [GET] /printers - ${serialNumber} not found`);
        res.status(404).send({});
    }
});

app.post('/printers', function(req, res) {
    let data = req.body;
    
    let validData = data.ip && data.serialNumber && data.accessCode;
    if (validData) {
        let configEntry = config.add(data.ip, 8883, data.serialNumber, data.accessCode);
        printerClients.add(configEntry);
        console.log(`[APP] [POST] /printers - Adding printer ${data.serialNumber}`);
        res.status(204).send("Success");
    }
    else {
        console.log(`[APP] [POST] /printers - Could not add printer ${data.serialNumber} at ${data.ip}`);
        res.status(400).send("Could not process add request. Invalid data");
    }
});

app.delete('/printers/:serialNumber', function(req, res) {
    let sn = req.params.serialNumber;

    if (sn && config.getBySerial(sn)) {
         printerClients.remove("mqttjs_"+sn);
         console.log(`[APP] [DELETE] /printers - Deleted printer ${sn}`);
         res.status(200).send("OK");
    }
    else {
        console.log(`[APP] [DELETE] /printers - Could not delete printer ${sn}`);
        res.status(404).send(`Could not find discovery device with SN ${sn}`);
    }
});

app.get('/discovery/list', function(req, res) {
    let printer_list = [];
    Object.keys(bambuSSDP.discoveredDevices).forEach( (sn) => {
        printer_list.push({"serialNumber": sn, "ip": bambuSSDP.discoveredDevices[sn]});
    });
    console.log(`[APP] [GET] /discovery/list - Returning all discovered and unconfigured printers`);
    res.send(printer_list);
});

app.post('/discovery/add/:serialNumber', function(req, res) {
    let sn = req.params.serialNumber;
    let accessCode = req.body.accessCode;
    
    if(!accessCode) {
        console.log(`[APP] [POST] /discovery/add - Could not add discovered device ${sn}. Access Code invalid.`);
        res.status(400).send("Could not process add discovery resquest. No access code supplied in request body.");
    }
    else if(!bambuSSDP.discoveredDevices[sn]) {
        console.log(`[APP] [POST] /discovery/add - Could not add discovered device ${sn}. Discovered device not found.`);
        res.status(404).send(`Could not find discovery device with SN ${sn}`);
    }
    else {
        let configEntry = config.add(bambuSSDP.discoveredDevices[sn], 8883, sn, accessCode);
        printerClients.add(configEntry);
        console.log(`[APP] [POST] /discovery/add - Added discovered device ${sn}`);
        res.status(204).send("Success");
    }
});



app.listen(port, function () {
  console.log(`[App] Example app listening on port ${port}!`);
});


