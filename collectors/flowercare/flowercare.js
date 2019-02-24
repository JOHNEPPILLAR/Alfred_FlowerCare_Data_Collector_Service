/**
 * Import helper libraries
 */
const miflora = require('./miflora.js');
const serviceHelper = require('../../lib/helper.js');

/**
 * Save data to data store
 */
async function saveDeviceData(DataValues) {
  const SQL = 'INSERT INTO garden_sensor("time", sender, address, identifier, battery, sunlight, moisture, fertiliser) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)';
  const SQLValues = [
    new Date(),
    process.env.Environment,
    DataValues.address,
    DataValues.type,
    DataValues.battery,
    DataValues.lux,
    DataValues.moisture,
    DataValues.fertility,
  ];

  try {
    serviceHelper.log('trace', 'FlowerCare - saveDeviceData', 'Connect to data store connection pool');
    const dbClient = await global.devicesDataClient.connect(); // Connect to data store
    serviceHelper.log('trace', 'FlowerCare - saveDeviceData', `Save sensor values for device: ${SQLValues[2]}`);
    const results = await dbClient.query(SQL, SQLValues);
    serviceHelper.log('trace', 'FlowerCare - saveDeviceData', 'Release the data store connection back to the pool');
    await dbClient.release(); // Return data store connection back to pool

    if (results.rowCount !== 1) {
      serviceHelper.log('error', 'FlowerCare - saveDeviceData', `Failed to insert data for device: ${SQLValues[2]}`);
    } else {
      serviceHelper.log('info', 'FlowerCare - saveDeviceData', `Saved data for device: ${SQLValues[2]}`);
    }
  } catch (err) {
    serviceHelper.log('error', 'FlowerCare - saveDeviceData', err.message);
  }
}

exports.getFlowerCareData = async function getFlowerCareData() {
  try {
    let devices = await miflora.discover();
    serviceHelper.log('trace', 'FlowerCare - getFlowerCareData', `Discovered: ${devices.length}`);

    const processItems = async function processItems(counter) {
      if (counter < devices.length) {
        const deviceData = {};
        serviceHelper.log('trace', 'FlowerCare - getFlowerCareData', `Getting sensor data for device: ${devices[counter].address}`);
        try {
          const baseData = await devices[counter].query();

          deviceData.address = baseData.address;
          deviceData.type = baseData.type;
          deviceData.battery = baseData.firmwareInfo.battery;
          deviceData.temperature = baseData.sensorValues.temperature;
          deviceData.lux = baseData.sensorValues.lux;
          deviceData.moisture = baseData.sensorValues.moisture;
          deviceData.fertility = baseData.sensorValues.fertility;

          serviceHelper.log('trace', 'FlowerCare - getFlowerCareData', `Disconnect device: ${devices[counter].address}`);
          devices[counter].disconnect();

          await saveDeviceData(deviceData); // Save the device data
        } catch (err) {
          serviceHelper.log('error', 'FlowerCare - getFlowerCareData', err.message);
        }
        processItems(counter + 1); // Call recursive function to process next device
      }
    };
    await processItems(0);
    devices = null; // De-allocate devices
  } catch (err) {
    serviceHelper.log('error', 'FlowerCare - getFlowerCareData', err.message);
  }
};
