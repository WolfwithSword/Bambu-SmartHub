const fs = require('fs');
let EventEmitter = require('events').EventEmitter;

class HubConfig extends EventEmitter {
    constructor() {
        super();
        let configFile = process.env.PRINTER_CONFIG_FILE || '/app/smarthub/config/printers-config.json';
        let accessFile = process.env.ACCESS_FILE || '/app/smarthub/config/access.json';
        
        if (!fs.existsSync(configFile)) {
          // Create a default config file with no entries
          const defaultConfig = [];
          fs.writeFileSync(configFile, JSON.stringify(defaultConfig, null, 2));
          console.log(`[Config] Default config file created: ${configFile}`);
        }
        if (!fs.existsSync(accessFile)) {
          // Create a default config file with no entries
          const defaultConfig2 = {};
          fs.writeFileSync(accessFile, JSON.stringify(defaultConfig2, null, 2));
          console.log(`[Config] Default access file created: ${accessFile}`);
        }
        
        this.printerConfigs = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
        this.accessConfigs = JSON.parse(fs.readFileSync(accessFile, 'utf-8'));
        this.printerConfigs.forEach( c => {
            let sn = c.clientId.replace("mqttjs_", "");
            if (this.accessConfigs[sn] == undefined) {
                this.accessConfigs[sn] = {
                    "access_code": c.password,
                    "ip": c.host,
                    "model": ""
                };
            }
            else {
                this.accessConfigs[sn]["access_code"] = c.password;
                this.accessConfigs[sn]["ip"] = c.host;
            }
        })
        
        fs.writeFileSync(accessFile, JSON.stringify(this.accessConfigs, null, 2));
        console.log('[Config] Loaded');
    }
    
    updateModel(sn, model) {
        model = model.toUpperCase();
        if (!["X1","X1C", "X1E", "P1P","P1S","A1","A1 Mini"].includes(model)) {
            return;
        }
        if (this.accessConfigs[sn] != undefined && this.accessConfigs[sn]['model'] != model) {
            console.log(`[Config] Updated Model for ${sn} to ${model}`);
            this.accessConfigs[sn]["model"] = model;                
            let accessFile = process.env.ACCESS_FILE || '/app/smarthub/config/access.json';
            fs.writeFileSync(accessFile, JSON.stringify(this.accessConfigs, null, 2));
        }
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

        this.accessConfigs[serialNumber.toUpperCase()] = {
            "access_code": accessCode,
            "ip": host,
            "model": ""
        };
        this.#updateFile();
        console.log(`[Config] Entry for ${serialNumber} added successfully!`);
        return newEntry;
    }
    
    #updateFile(){
        let configFile = process.env.PRINTER_CONFIG_FILE || '/app/smarthub/config/printers-config.json';
        fs.writeFileSync(configFile, JSON.stringify(this.printerConfigs, null, 2));
        
        let accessFile = process.env.ACCESS_FILE || '/app/smarthub/config/access.json';
        fs.writeFileSync(accessFile, JSON.stringify(this.accessConfigs, null, 2));
    }
    
    remove(clientId) {
        this.printerConfigs = this.printerConfigs.filter(config => config.clientId !== clientId);
        if (this.accessConfigs[clientId.replace("mqttjs_", "")] != undefined) {
            delete this.accessConfigs[clientId.replace("mqttjs_", "")];
        }
        this.#updateFile();
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