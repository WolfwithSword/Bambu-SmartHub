# MQTT-Broker
We are using a modified eclipse-mosquitto broker as the primary MQTT broker for SmartHub.

Modifications include an entrypoint script that generates a user/password based on environment variables and generating self-signed certs to enable TLS. 

Configuration of mosquitto can be done in the `mosquitto.conf` file.