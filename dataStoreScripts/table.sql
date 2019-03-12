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
