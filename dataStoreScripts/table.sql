CREATE TABLE garden_sensor (
  time                      TIMESTAMP WITHOUT TIME ZONE NOT NULL,
  sender                    TEXT              NOT NULL,
  address                   TEXT              NOT NULL,
  identifier                TEXT              NOT NULL,
  battery                   INT               NULL,
  sunlight                  DOUBLE PRECISION  NULL,
  moisture                  DOUBLE PRECISION  NULL,
  fertiliser                DOUBLE PRECISION  NULL
)

SELECT create_hypertable('garden_sensor', 'time', 'address');

CREATE TABLE garden_sensor_plant (
  id                        SERIAL            PRIMARY KEY,
  address                   TEXT              NOT NULL,
  sensor_label              TEXT              NOT NULL,
  plant_name                TEXT              NOT NULL,
  threshold_moisture        DOUBLE PRECISION  NOT NULL,
  threshold_fertilizer      DOUBLE PRECISION  NOT NULL
)

CREATE TABLE netatmo (
  time            TIMESTAMP WITHOUT TIME ZONE NOT NULL,
  sender          TEXT              NOT NULL,
  address         TEXT              NOT NULL,
  location        TEXT              NULL,
  battery         INT               NULL,
  temperature     DOUBLE PRECISION  NULL,
  humidity        DOUBLE PRECISION  NULL,
  pressure        DOUBLE PRECISION  NULL,
  co2             DOUBLE PRECISION  NULL
)

SELECT create_hypertable('netatmo', 'time', 'address');

CREATE TABLE dyson_purecool (
  time            TIMESTAMP WITHOUT TIME ZONE NOT NULL,
  sender          TEXT              NOT NULL,
  location        TEXT              NOT NULL,
  air             DOUBLE PRECISION  NULL,
  temperature     DOUBLE PRECISION  NULL,
  humidity        DOUBLE PRECISION  NULL,
  nitrogen        DOUBLE PRECISION  NULL
)

SELECT create_hypertable('dyson_purecool', 'time', 'location');

CREATE TABLE ios_devices
(
    time         timestamp   without time zone  NOT NULL,
    token        TEXT                           NOT NULL,
    user         TEXT
)

SELECT create_hypertable('ios_devices', 'time', 'device_token');
