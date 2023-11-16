# Bambu-SmartHub
A smart-hub for connecting and repeating multiple Bambulabs printer's MQTT payloads

## Requirements
- Docker
- Docker Compose

## To Run
Clone the repository and in the directory with `docker-compose.yaml` run `docker-compose up`.

To run it without locking the terminal, `docker-compose up -d`

For deployment to a device, one can setup the docker service and docker-compose up command to both auto-start on a device. This will depend on the architecture/os.

Images may need to be rebuilt during development unless nodemon is setup, in that case, run
`docker-compose up --build <name>` ex `docker-compose up --build smarthub` will force rebuild the smarthub service.

## Configuration
### Environment Variables and Volumes
Each service has some environment variables set up in the docker-compose.yaml.

TODO: Descriptions for stuff such as mqtt_password


Each service has certain directories mounted for convenience.

Ex, For `smarthub`, the config directory will (likely) for a config json fil for printer connection information.

