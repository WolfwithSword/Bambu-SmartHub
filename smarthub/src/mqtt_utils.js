const mqtt = require('mqtt')
let EventEmitter = require('events').EventEmitter;

class HubClient extends EventEmitter {
    constructor() {
        super();
        this.connected = false;
        this.client = mqtt.connect(
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
        
        this.client.on('connect', () => {
            console.log(`[MQTT] Connected to HubClient`);
            this.client.subscribe(["device/+/request"], function (err) {
                    if(!err) {
                        console.log(`[MQTT] Subscribed HubClient to request topics`);
                    }
                });
            this.connected = true;
        });
        
        this.client.on('message', (topic, message) => {
            if (!topic.includes("/request")) {
                return;
            }
            let serialNum = topic.replace("device/", "").replace("/request", "");
            console.log(`[MQTT] Received message from HubClient - Topic: ${topic}, Message: ${message.toString()}, Printer Request for: ${serialNum}`);
            this.emit('publish-request', serialNum, message);
            //publishPrinterMessage(serialNum, message);
        });
        
        this.client.on('close', () => {
            this.#handleDisconnect();
        });
        
        this.client.on('disconnect', (packet) => {
            this.#handleDisconnect();
        });
    }
    
    publish(topic, message) {
        if(this.client && this.connected) {
            this.client.publish(topic, message);
        }
    }
    
    #handleDisconnect() {
        if (this.connected) {
            console.log('[MQTT] Connection closed for HubClient');
            this.connected = false;
        }
    } 
    
}

class MultiPrinterClient extends EventEmitter {
    constructor() {
        super();
        this.clients = new Map();
    }
    
    getSNFromClientId(clientId) {
        return clientId.replace("mqttjs_", "");
    }
    
    get(clientId) {
        return this.clients.get(clientId);
    }
    
    load(hubConfig){
        let self = this;
        hubConfig.printerConfigs.forEach(config => {
          const client = mqtt.connect(config);

          client.on('connect', () => {

            self.#handleConnect(config.clientId, config.host);
            if(config.topics && config.topics.length > 0) {
                client.subscribe(config.topics, function (err) {
                    if(!err) {
                        console.log(`[MQTT] Subscribed ${config.clientId} to topics: |${config.topics}|`)
                    }
                });
            }
          });

          client.on('message', (topic, message) => {
            let serialNum = topic.replace("device/", "").replace("/report","");
            self.#handleMessage(topic, message, config.host, serialNum, "online");
          });
          
          client.on('error', (error) => {
            self.#handleError(error);
          });

          client.on('close', () => {
            self.#handleClose(config.clientId)
            let serialNum = self.getSNFromClientId(config.clientId);
            self.#handleMessage(`device/${serialNum}/report`, "{\"status\":\"offline\"}", config.host, serialNum, null);
          });

          client.on('disconnect', (packet) => {
            self.#handleDisconnect(config.clientId, packet)
            let serialNum = self.getSNFromClientId(config.clientId);
            self.#handleMessage(`device/${serialNum}/report`, "{\"status\":\"offline\"}", config.host, serialNum, null);
          });
          
          this.clients.set(config.clientId, client);
          this.emit('configure-client', this.getSNFromClientId(config.clientId), config.host.trim());
      });
    }
    
    getStatus(clientId) {
        let client = this.get(clientId);
        if (client) {
            return client.connected ? "online" : "offline";
        }
        else {
            return "invalid";
        }
    }
    
    add(config){
        const newClient = mqtt.connect(config);
        let self = this;
        newClient.on('connect', () => {
            self.#handleConnect(config.clientId, config.host);
            if(config.topics && config.topics.length > 0) {
                    newClient.subscribe(config.topics, function (err) {
                        if(!err) {
                            console.log(`[MQTT] Subscribed ${config.clientId} to topics: |${config.topics}|`)
                        }
                    });
                }
          });

          newClient.on('message', (topic, message) => {
            let serialNum = topic.replace("device/", "").replace("/report","");
            self.#handleMessage(topic, message, config.host, serialNum, "online");
          });
          
          newClient.on('error', (error) => {
            self.#handleError(error);
          });

          newClient.on('close', () => {
            self.#handleClose(config.clientId)  
            let serialNum = getSNFromClientId(config.clientId);
            self.#handleMessage(`device/${serialNum}/report`, "{\"status\":\"offline\"}", config.host, serialNum, null);
          });
          
          newClient.on('disconnect', (packet) => {
            self.handleDisconnect(config.clientId)
            let serialNum = getSNFromClientId(config.clientId);
            self.#handleMessage(`device/${serialNum}/report`, "{\"status\":\"offline\"}", config.host, serialNum, null);
          });

          this.clients.set(config.clientId, newClient);
          this.emit('configure-client', this.getSNFromClientId(config.clientId), config.host.trim());
    }
    
    remove(clientId) {
        const removedClient = this.clients.get(clientId);
        if (removedClient) {
            removedClient.end();
            this.clients.delete(clientId);
            console.log(`[MQTT] Printer MQTT client with clientId '${clientId}' stopped.`);
        }
        this.emit('remove-client', this.getSNFromClientId(clientId));
    }
    
    #handleDisconnect(clientId) {
        console.log(`[MQTT] Disconnected client ${clientId}`);
    } 
    
    #handleClose(clientId) {
        console.log(`[MQTT] Connection closed for client ${clientId}`);
    } 
    
    #handleError(error) {
        console.log(`[MQTT] Error with client: ${error.message}`);
    }
    
    #handleConnect(clientId, ip) {
        console.log(`[MQTT] Connected to ${ip} - Client ID: ${clientId}`);
    }
    
    #handleMessage(topic, message, originalHost, serialNum, status) {
        message = Buffer.from(message.toString().replace("{", "{\"original_host\":\"" + originalHost + "\", ", 'utf8'));
        if (status && (status == "online" || status == "offline")) {
            message = Buffer.from(message.toString().replace("{", "{\"status\":\"" + status + "\", ", 'utf8'));
        }
        
        this.emit('client-message', serialNum, topic, message);
    }
}

module.exports = {
    HubClient,
    MultiPrinterClient
};