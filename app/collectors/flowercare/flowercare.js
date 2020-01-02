/**
 * Import external libraries
 */
const serviceHelper = require('alfred-helper');
const noble = require('@abandonware/noble');

/**
 * Import helper libraries
 */
// const miflora = require('./miflora.js');
const MiFloraDevice = require('./miflora-device.js');

const UUID_SERVICE_XIAOMI = 'fe95';
const duration = 60000; // 60 seconds

/**
 * BLE events
 */
noble.on('stateChange', (state) => {
  serviceHelper.log('trace', `BLE adapter changed to ${state}`);
  if (state !== 'poweredOn') {
    noble.stopScanning();
  }
});
noble.once('scanStart', () => {
  serviceHelper.log('trace', 'Discovery started');
});
noble.once('scanStop', () => {
  serviceHelper.log('trace', 'Discovery finished');
});

/**
 * Save data to data store
 */
async function saveDeviceData(DataValues) {
  const SQL = 'INSERT INTO garden_sensor("time", sender, address, identifier, battery, sunlight, moisture, fertiliser) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)';
  const SQLValues = [
    new Date(),
    process.env.ENVIRONMENT,
    DataValues.address,
    DataValues.type,
    DataValues.battery,
    DataValues.lux,
    DataValues.moisture,
    DataValues.fertility,
  ];

  try {
    serviceHelper.log('trace', 'Connect to data store connection pool');
    const dbConnection = await serviceHelper.connectToDB('devices');
    const dbClient = await dbConnection.connect(); // Connect to data store
    serviceHelper.log('trace', `Save sensor values for device: ${SQLValues[2]}`);
    const results = await dbClient.query(SQL, SQLValues);
    serviceHelper.log(
      'trace',
      'Release the data store connection back to the pool',
    );
    await dbClient.release(); // Return data store connection back to pool
    await dbClient.end(); // Close data store connection

    if (results.rowCount !== 1) {
      serviceHelper.log('error', `Failed to insert data for device: ${SQLValues[2]}`);
    } else {
      serviceHelper.log('info', `Saved data for device: ${SQLValues[2]}`);
    }
  } catch (err) {
    serviceHelper.log('error', err.message);
  }
}

async function getFlowerCareData(device) {
  try {
    const deviceData = {};
    serviceHelper.log('trace', `Getting sensor data for device: ${device.address}`);
    try {
      serviceHelper.log('trace', `Connect to device: ${device.address}`);
      const connected = await device.connect();
      if (connected instanceof Error) {
        serviceHelper.log('error', `Not able to connect to device: ${device.address}`);
        return;
      }
      serviceHelper.log('trace', `Get sensor data from: ${device.address}`);
      const baseData = await device.query();
      if (baseData instanceof Error) {
        serviceHelper.log('error', `Not able to query device: ${device.address}`);
        return;
      }

      deviceData.address = baseData.address;
      deviceData.type = baseData.type;
      deviceData.battery = baseData.firmwareInfo.battery;
      deviceData.temperature = baseData.sensorValues.temperature;
      deviceData.lux = baseData.sensorValues.lux;
      deviceData.moisture = baseData.sensorValues.moisture;
      deviceData.fertility = baseData.sensorValues.fertility;

      serviceHelper.log('trace', `Disconnect device: ${baseData.address}`);
      await device.disconnect();
      await saveDeviceData(deviceData); // Save the device data
    } catch (err) {
      serviceHelper.log('error', err.message);
    }
  } catch (err) {
    serviceHelper.log('error', err.message);
  }
}

function discoverDevices() {
  const devices = {};

  serviceHelper.log(
    'trace',
    `Starting discovery with ${duration}ms duration`,
  );

  return new Promise((resolve, reject) => {
    noble.startScanning([UUID_SERVICE_XIAOMI], true, (err) => {
      if (err) {
        serviceHelper.log('error', err.message);
        reject(err);
      }
    });

    noble.on('discover', (peripheral) => {
      const exisitingDevice = devices[peripheral.address];
      if (!exisitingDevice) {
        const newDevice = new MiFloraDevice(peripheral);
        if (newDevice) {
          devices[peripheral.address] = newDevice;
          serviceHelper.log(
            'trace',
            `Discovered ${newDevice.type} @ ${newDevice.address}`,
          );
        }
      }
    });

    setTimeout(() => {
      serviceHelper.log('trace', 'Duration reached, stopping discovery');
      noble.removeAllListeners('discover'); // Remove listner
      resolve(Object.values(devices));
    }, duration);
  });
}

function ensurePowerOnState() {
  return new Promise((resolve) => {
    if (noble.state === 'poweredOn') resolve();
    serviceHelper.log('trace', 'Waiting for adapter state change');
    noble.on('stateChange', (state) => {
      if (state === 'poweredOn') resolve();
    });
  });
}

exports.getFlowerCareDevices = async () => {
  serviceHelper.log('info', 'Starting device discovery');
  try {
    await ensurePowerOnState();
    const devices = await discoverDevices();
    await noble.stopScanning(); // Stop scanning
    serviceHelper.log('info', `Discovered: ${devices.length}`);
    devices.map(async (device) => {
      await getFlowerCareData(device);
    });
  } catch (err) {
    serviceHelper.log('error', err.message);
  }
};
