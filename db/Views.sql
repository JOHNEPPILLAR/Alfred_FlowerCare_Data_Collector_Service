
-- DROP VIEW vw_plat_data 
CREATE OR REPLACE VIEW vw_plant_data AS
SELECT last(garden_sensor."time", garden_sensor."time") AS "time",
	last(garden_sensor.sender, garden_sensor."time") AS sender,
	last(garden_sensor.address, garden_sensor."time") AS address,
	last(garden_sensor.identifier, garden_sensor."time") AS identifier,
	last(garden_sensor.battery, garden_sensor."time") AS battery,
	max(garden_sensor_plant.sensor_label) AS sensor_label,
	max(garden_sensor_plant.plant_name) AS plant_name,
	last(garden_sensor.moisture, garden_sensor."time") AS moisture,
	max(garden_sensor_plant.threshold_moisture) AS threshold_moisture,
	last(garden_sensor.fertiliser, garden_sensor."time") AS fertiliser,
	max(garden_sensor_plant.threshold_fertilizer) AS threshold_fertilizer,
	last(garden_sensor_plant.zone, garden_sensor."time") AS zone
FROM garden_sensor
INNER JOIN garden_sensor_plant ON garden_sensor.address = garden_sensor_plant.address 
GROUP BY garden_sensor.address

-- DROP VIEW vw_water_plants 
CREATE OR REPLACE VIEW public.vw_water_plants AS
SELECT time,
	sender,
	address,
	identifier,
	battery,
	sensor_label,
	plant_name,
	moisture,
	threshold_moisture,
	zone
FROM vw_plant_data
WHERE moisture <= threshold_moisture AND time > NOW() - interval '1 hour'

--DROP VIEW vw_fertiliser_plants;
CREATE OR REPLACE VIEW vw_fertiliser_plants AS
SELECT time,
	sender,
	address,
	identifier,
	battery,
	sensor_label,
	plant_name,
	fertiliser,
	threshold_fertilizer
FROM vw_plant_data
WHERE fertiliser <= threshold_fertilizer

CREATE OR REPLACE VIEW vw_battery_data AS
SELECT last("time", "time") AS "time", last(battery, "time") AS battery, garden_sensor_plant.sensor_label as location, 'garden' AS device
FROM garden_sensor
INNER JOIN garden_sensor_plant ON garden_sensor.address = garden_sensor_plant.address 
WHERE time > NOW() - interval '1 hour' 
GROUP BY garden_sensor_plant.sensor_label
