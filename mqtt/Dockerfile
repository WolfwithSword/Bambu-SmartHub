FROM eclipse-mosquitto:2.0.18

RUN apk upgrade --update-cache --available && \
    apk add openssl && \
    rm -rf /var/cache/apk/*
    
RUN mkdir -p /mosquitto/certs

COPY entrypoint.sh /entrypoint.sh
ENTRYPOINT ["sh", "/entrypoint.sh"]

CMD ["/usr/sbin/mosquitto","-c","/mosquitto/config/mosquitto.conf"]