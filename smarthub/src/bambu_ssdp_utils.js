const dgram = require('dgram');
let EventEmitter = require('events').EventEmitter;

class BambuSSDP extends EventEmitter {
    constructor() {
        super();
        this.ssdpUrn = "urn:bambulab-com:device:3dprinter:1";
        this.discoveredDevices = {};
        this.configuredDevices = {};
        this.multicastAddress = '239.255.255.250';
        this.ssdpPorts = [1990, 2021];
        
        this.on('discovery', (sn, ip) => {
            console.log(`[SSDP] Discovered new device ${sn} at ${ip}`);
        });        
        this.on('update-ip', (sn, ip) => {
            console.log(`[SSDP] Configured device ${sn} has new IP ${ip}. Removing from configured SSDP devices.`);
        });
    }
    
    search() {
        var self = this;
        this.ssdpPorts.forEach((port) => {
            const udpSocket = dgram.createSocket('udp4');
            udpSocket.on('listening', () => {
                const address = udpSocket.address();
                console.log(`[SSDP] Listening on ${address.address}:${address.port}`);
                udpSocket.addMembership(self.multicastAddress);
            });

            udpSocket.on('message', (message, remote) => {
                let msg = message.toString();
                if (msg.includes(self.ssdpUrn)) {
                    let sn_re = new RegExp(/USN: (.*)/);
                    let ip = "";
                    let r = msg.match(sn_re);
                    if(r) {
                        let ip_re = new RegExp(/Location: (.*)/);
                        ip = msg.match(ip_re)[1];
                        let sn = r[1];
                        
                        if (self.checkIfNewDevice(sn)) {
                            self.discoveredDevices[sn] = ip;
                            self.emit("discovery", sn, ip);
                        }
                        if (self.checkIfNewIp(sn, ip)){
                            self.emit("update-ip", sn, ip);
                            if (self.configuredDevices[sn]) {
                                delete self.configuredDevices[sn];
                            }
                        }
                    }
                    
                }
            });

            udpSocket.bind(port);
        });
    }
    
    checkIfNewIp(serialNumber, ip) {
        if (!this.checkIfNewDevice(serialNumber)){
            return this.configuredDevices[serialNumber] != undefined  && this.configuredDevices[serialNumber] != ip;
        }
        return false;
    }
    
    checkIfNewDevice(serialNumber) {
        return this.discoveredDevices[serialNumber] == undefined
        && this.configuredDevices[serialNumber] == undefined;
    }
    
    removeDiscoveredDevice(serialNumber) {
        if(this.discoveredDevices[serialNumber]) {
            delete this.discoveredDevices[serialNumber];
            console.log(`[SSDP] Removed discovered device ${serialNumber}`);
        }
    }
    
    addConfiguredDevice(serialNumber, ip) {
        if (this.discoveredDevices[serialNumber] == undefined) {
            this.removeDiscoveredDevice(serialNumber);
        }
        this.configuredDevices[serialNumber] = ip;
        console.log(`[SSDP] added or updated configured device ${serialNumber}`);
    }
    
    removeDevice(serialNumber) {
        if (this.configuredDevices[serialNumber]) {
            delete this.configuredDevices[serialNumber];
            console.log(`[SSDP] Removed configured device ${serialNumber}`);
        }
    }
    
}

module.exports = {
    BambuSSDP
};