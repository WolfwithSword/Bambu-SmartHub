#!/bin/sh

set -e

if [ ! -f "/mosquitto/certs/ca.key" ];  then
    echo "setting up self-signed certs"
    openssl req -nodes -new -x509 -newkey rsa:2048 -days 3650 -subj \
        "/C=CA/ST=NB/L=../O=../OU=../CN=www.wolfwithsword.com/emailAddress=.." \
        -keyout /mosquitto/certs/ca.key -out /mosquitto/certs/ca.crt

    openssl req -nodes -new -x509 -newkey rsa:2048 -days 3650 -subj \
        "/C=CA/ST=NB/L=../O=../OU=../CN=www.wolfwithsword.com/emailAddress=.." \
        -out /mosquitto/certs/server.crt -keyout /mosquitto/certs/server.key -CA /mosquitto/certs/ca.crt -CAkey /mosquitto/certs/ca.key 
fi

PASSWDFILE=/mosquitto/config/pwfile

echo "setting up password file"
mosquitto_passwd -c -b $PASSWDFILE ${MQTT_USER} ${MQTT_PASSWORD}


exec "$@"