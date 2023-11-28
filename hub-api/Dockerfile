FROM python:3.10-slim-bullseye
LABEL authors="WolfwithSword"


WORKDIR /app

RUN apt-get update

COPY ./requirements.txt /app/requirements.txt

RUN pip install -r requirements.txt --no-cache-dir

COPY ./api /app/api
COPY ./migrations /app/migrations
COPY ./resources /app/resources
COPY ./utils /app/utils
COPY ./*.py /app
COPY ./swagger.yaml /app/swagger.yaml
COPY ./.flaskenv /app/.flaskenv

CMD flask db upgrade
CMD echo "Finished updating db"
CMD python -u main.py