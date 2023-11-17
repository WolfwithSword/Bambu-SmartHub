const fs = require('fs');
let EventEmitter = require('events').EventEmitter;

class HubConfig extends EventEmitter {
    constructor() {
        super();
        let configFile = process.env.PRINTER_CONFIG_FILE || '/app/smarthub/config/printers-config.json';
        
        if (!fs.existsSync(configFile)) {
          // Create a default config file with no entries
          const defaultConfig = [];
          fs.writeFileSync(configFile, JSON.stringify(defaultConfig, null, 2));
          console.log(`[Config] Default config file created: ${configFile}`);
        }
        
        this.printerConfigs = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
        
        console.log('[Config] Loaded');
    }
    
    add(host, port, serialNumber, accessCode) {
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
        this.printerConfigs.push(newEntry);
        this.updateFile();
        console.log(`[Config] Entry for ${serialNumber} added successfully!`);
        return newEntry;
    }
    
    #updateFile(){
          fs.writeFileSync(this.configFile, JSON.stringify(this.printerConfigs, null, 2));
    }
    
    remove(clientId) {
        this.printerConfigs = this.printerConfigs.filter(config => config.clientId !== clientId);
        this.updateFile();
        console.log(`[Config] Entry '${clientId}' removed successfully.`);
    }
    
    removeBySerial(serialNumber) {
        this.remove("mqttjs_"+serialNumber);
    }
    
    getBySerial(serialNumber) {
        return this.printerConfigs.filter(conf => {
            conf.clientId == "mqttjs_"+serialNumber;
        });
    }
    
    getByAccessCode(accessCode) {
        return this.printerConfigs.filter(conf => {
            conf.password == accessCode;
        });
    }

    getByIp(ip) {
        return this.printerConfigs.filter(conf => {
            conf.host == ip;
        });
    }

}


module.exports = {
    HubConfig
};