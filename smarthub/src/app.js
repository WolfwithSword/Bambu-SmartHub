const mqtt = require('mqtt')
const fs = require('fs');
const dgram = require('dgram');
var express = require('express');

var app = express();

const port = process.env.APP_PORT || 5000;
const configFile = process.env.PRINTER_CONFIG_FILE || '/app/smarthub/config/printers-config.json';

// TODO: Plan to have some UI show these devices if any are found. This is only ever populated by devices not already added.
var discovered_devices = {};

if (!fs.existsSync(configFile)) {
  // Create a default config file with no entries
  const defaultConfig = [];
  fs.writeFileSync(configFile, JSON.stringify(defaultConfig, null, 2));
  console.log(`[Config] Default config file created: ${configFile}`);
}

const hubClient = mqtt.connect(
    {
        "host": process.env.MQTT_HOST || "mqtt-broker",
        "port": process.env.MQTT_PORT || 8883,
        "clientId": "smarthub_"+Math.random().toString(16).substring(2, 8),
        "username": process.env.MQTT_USER || "bblp",
        "password": process.env.MQTT_PASSWORD || "bambu-smarthub",
        "topics": ["device/+/request"],
        "rejectUnauthorized": false,
        "reconnectPeriod": 5000,
        "connectTimeout": 10000,
        "protocol": "mqtts",
        "clean": false,
        "protocolVersion": 4,
        "resubscribe": true
 });


let printerConfigs = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
let printerClients = new Map();


function getSNFromClientId(clientId) {
    return clientId.replace("mqttjs_", "");
}

// Call this function to add a new printer to the mqtt connection config.
// ClientID will be mqttjs_ + the serial number, use function getSNFromClientId
// if you need to extract the SN from a client in printerClients/printerConfigs 
function addPrinter(host, port, serialNumber, accessCode) {
  const newEntry = {
    "host": host,
    "port": port,
    "clientId": "mqttjs_"+serialNumber.toUpperCase(),
    "username": "bblp",
    "password": accessCode,
    "topics": ["device/" + serialNumber.toUpperCase() + "/report"],
    "rejectUnauthorized": false,
    "reconnectPeriod": 5000, // reconnect every 5s attempt
    "connectTimeout": 10000, // timeout attempt after 10s,
    "clean": false,
    "protocol": "mqtts",
    "protocolVersion": 4,
    "resubscribe": true
    
  };

  printerConfigs.push(newEntry);
  fs.writeFileSync(configFile, JSON.stringify(printerConfigs, null, 2));
  console.log(`[Config] Entry for ${serialNumber} added successfully!`);
  
  const newClient = mqtt.connect(newEntry);
  
  newClient.on('connect', () => {
    console.log(`[MQTT] Connected to ${newEntry.host} - Client ID: ${newEntry.clientId}`);
    handleConnect(newEntry.clientId);
    if(newEntry.topics && newEntry.topics.length > 0) {
            newClient.subscribe(newEntry.topics, function (err) {
                if(!err) {
                    console.log(`[MQTT] Subscribed ${newEntry.clientId} to topics: |${newEntry.topics}|`)
                }
            });
        }
  });

  newClient.on('message', (topic, message) => {
    handleMessage(topic, message);
  });
  
  newClient.on('error', (error) => {
    handleError(error);
  });

  newClient.on('close', () => {
    console.log(`[MQTT] Connection closed for client ${newEntry.clientId}`);
    handleClose(newEntry.clientId)
  });
  
  newClient.on('disconnect', (packet) => {
    console.log(`[MQTT] Disconnected from client ${newEntry.clientId}`);
    handleDisconnect(newEntry.clientId, packet)
  });

  printerClients.set(newEntry.clientId, newClient);
  
  if(discovered_devices[serialNumber.toUpperCase()] != undefined) {
      delete discovered_devices[serialNumber.toUpperCase()];
  }
}

// Call this function to remove a printer from the config file.
// It expects client id, so mqttjs_+ serial number.
function removePrinter(clientId) {
  printerConfigs = printerConfigs.filter(config => config.clientId !== clientId);
  fs.writeFileSync(configFile, JSON.stringify(printerConfigs, null, 2));
  console.log(`[Config] Entry '${clientId}' removed successfully.`);
  
  const removedClient = printerClients.get(clientId);
  if (removedClient) {
    removedClient.end();
    printerClients.delete(clientId);
    console.log(`[MQTT] Printer MQTT client with clientId '${clientId}' stopped.`);
  }
}


// messages from printer
function handleMessage(topic, message) {
    // commented out for now but likely okay to leave uncommented once deployed.
    //console.log(`Received message from - Topic: ${topic}, Message: ${message.toString()}`);
    publishHubMessage(topic, message);
}

function handleConnect(clientId) {
    console.log(`[MQTT] Connected ${clientId}`);
}

function handleError(error) {
    console.log(error);
}

function handleClose(clientId) {
    console.log(`[MQTT] Closed connection to ${clientId}`)
}

function handleDisconnect(clientId, packet) {
    console.log(`[MQTT] Disconnected from ${clientId} with packet: ${packet}`)
}

function loadPrinters() {
  printerConfigs.forEach(config => {
      const client = mqtt.connect(config);

      client.on('connect', () => {
        console.log(`[MQTT] Connected to ${config.host} - Client ID: ${config.clientId}`);
   
        handleConnect(config.clientId);
        if(config.topics && config.topics.length > 0) {
            client.subscribe(config.topics, function (err) {
                if(!err) {
                    console.log(`[MQTT] Subscribed ${config.clientId} to topics: |${config.topics}|`)
                }
            });
        }
      });

      client.on('message', (topic, message) => {
        handleMessage(topic, message);
      });
      
      client.on('error', (error) => {
        handleError(error);
      });

      client.on('close', () => {
        console.log(`[MQTT] Connection closed for client ${config.clientId}`);
        handleClose(config.clientId)
      });

      client.on('disconnect', (packet) => {
        console.log(`[MQTT] Disconnected from client ${config.clientId}`);
        handleDisconnect(config.clientId, packet)
      });
      
      printerClients.set(config.clientId, client);
  });
}

// publish request message to printer
function publishPrinterMessage(serialNumber, message) {
    const client = printerClients.get("mqttjs_"+serialNumber.toUpperCase());
    
    if(client) {
        client.publish("device/"+serialNumber.toUpperCase()+"/request", message);
        console.log(`[MQTT] Message published to ${serialNumber} on request topic`);
    } else {
      console.log(`[MQTT] No printer found with clientId '${serialNumber}'. Failed to publish.`);
    }
}

var isHubConnected = false;

// publish message to smarthub mqtt
function publishHubMessage(topic, message) {
    if(hubClient && isHubConnected) {
        hubClient.publish(topic, message);
    }
}

hubClient.on('connect', () => {
    console.log(`[MQTT] Connected to HubClient`);
    hubClient.subscribe(["device/+/request"], function (err) {
            if(!err) {
                console.log(`[MQTT] Subscribed hubClient to request topics`);
            }
        });
    isHubConnected = true;
});


hubClient.on('message', (topic, message) => {
    serialNum = topic.replace("device/", "").replace("/request", "");
    console.log(`[MQTT] Received message from hubClient - Topic: ${topic}, Message: ${message.toString()}, Printer Request for: ${serialNum}`);
    publishPrinterMessage(serialNum, message);
});

hubClient.on('error', (error) => {
    handleError(error);
});

hubClient.on('close', () => {
    console.log(`[MQTT] Connection closed for hubClient`);
    handleClose("hubClient");
    isHubConnected = false;
});

hubClient.on('disconnect', (packet) => {
    console.log(`[MQTT] Disconnected from hubClient`);
    handleDisconnect("hubClient", packet);
    isHubConnected = false;
});
      
  
loadPrinters();

function lookupPrinter(serialNumber, ipAddr) {
    serialNumber = serialNumber.trim();
    ipAddr = ipAddr.trim();
    var printerConf = printerConfigs.filter(printer => printer.clientId == "mqttjs_"+serialNumber.toUpperCase());
    
    if (!printerConf || printerConf.length == 0) {
        // add to prompt-quick-add list?
        if (discovered_devices[serialNumber.toUpperCase()] == undefined) {
            discovered_devices[serialNumber.toUpperCase()] = ipAddr;
            console.log(`[SSDP] Discovered device ${serialNumber} at ${ipAddr}`);
        }
    }
    else if (printerConf[0]["host"].trim() != ipAddr.trim()) {
        // update and reload client;
        let access_code = printerConf[0]["password"];
        removePrinter(printerConf[0]["clientId"]);
        addPrinter(ipAddr, 8883, serialNumber.toUpperCase(), access_code);
    }
}

const ssdpUrn = "urn:bambulab-com:device:3dprinter:1";
function ssdpSearch() {

    const multicastAddress = '239.255.255.250'; 
    const ssdpPorts = [1990, 2021];
    ssdpPorts.forEach(function(port) {
        const udpSocket = dgram.createSocket('udp4');
        udpSocket.on('listening', () => {
            const address = udpSocket.address();
            console.log(`[SSDP] Listening on ${address.address}:${address.port}`);
            udpSocket.addMembership(multicastAddress);
        });

        udpSocket.on('message', (message, remote) => {
            let msg = message.toString();
            if (msg.includes(ssdpUrn)) {
                let sn_re = new RegExp(/USN: (.*)/);
                let ip = "";
                let r = msg.match(sn_re);
                if(r) {
                    let ip_re = new RegExp(/Location: (.*)/);
                    ip = msg.match(ip_re)[1];
                    lookupPrinter(r[1], ip);
                }
                
            }
        });

        udpSocket.bind(port);
    });
    
    console.log('[SSDP] Client is running...');
}
ssdpSearch();


// still test app, could loat in a frontend here for management
app.get('/', function (req, res) {
  res.send('Hello World!');
});

app.listen(port, function () {
  console.log(`[App] Example app listening on port ${port}!`);
});


