/**
 * Import external libraries
 */
const noble = require('@abandonware/noble');
const debug = require('debug')('Flower:DataCollector');

const UUID_CHARACTERISTIC_FIRMWARE = '00001a0200001000800000805f9b34fb';
const UUID_CHARACTERISTIC_DATA = '00001a0100001000800000805f9b34fb';
const UUID_CHARACTERISTIC_MODE = '00001a0000001000800000805f9b34fb';
const MODE_BUFFER_REALTIME = {
  Enable: Buffer.from('a01f', 'hex'),
  Disable: Buffer.from('c01f', 'hex'),
};
const deviceScanIntival = 30 * 60 * 1000; // 30 minutes
const processPeripheralsIntival = 20 * 60 * 1000; // 20 minutes
const deviceTimeoutValue = 1 * 60 * 1000; // 1 minute

let scanRunning = false;
let scanCounter = 0;
let deviceTimeout;

/**
 * Save data to data store
 */
async function saveDeviceData(device) {
  let dbConnection;

  debug(`Saving data: ${device.location} - ${device.plant} (${device.device})`);

  try {
    debug('Connect to DB');
    dbConnection = await this._connectToDB();

    debug(`Insert data`);
    const results = await dbConnection
      .db(this.namespace)
      .collection(this.namespace)
      .insertOne(device);

    if (results.insertedCount === 1)
      this.logger.info(
        `Saved data: ${device.location} - ${device.plant} (${device.device})`,
      );
    else
      this.logger.error(
        `${this._traceStack()} - Failed to save data: ${device.location} - ${
          device.plant
        } (${device.device})`,
      );
  } catch (err) {
    this.logger.error(`${this._traceStack()} - ${err.message}`);
  } finally {
    debug(`Close DB connection`);
    await dbConnection.close();
  }
}

/**
 * Stop bluetooth device scan
 */
async function stopScanning(resetScanCounter) {
  debug(`Stopping scan`);
  await noble.stopScanningAsync();
  scanRunning = false;
  if (resetScanCounter) scanCounter = 0;
}

/**
 * Start bluetooth device scan
 */
async function startScanning() {
  debug(`Start peripheral discovery`);
  scanRunning = true;
  scanCounter += 1;
  await noble.startScanningAsync(['fe95'], false);

  setTimeout(async () => {
    if (!scanRunning) return;
    debug(`Peripheral discovery timeout, stopping discovery`);
    await stopScanning.call(this, false);

    const missingDevices = this.devicesInZone.filter(
      (d) => typeof d.peripheral === 'undefined',
    );

    let message = `Not able to find: `;
    // eslint-disable-next-line no-restricted-syntax
    for (const md of missingDevices) {
      message += `${md.location} - ${md.plant} (${md.device}) ${
        missingDevices.length === 0 ? ',' : ''
      }`;
    }
    this.logger.error(message);

    if (scanCounter === 3) {
      scanCounter = 0; // Reset counter
      this.logger.error(
        `${this._traceStack()} - Max discovery retry hit. Processing found peripheral(s)`,
      );

      // eslint-disable-next-line no-use-before-define
      await processPeripherals.call(this);
      return;
    }

    debug(`Re-scanning in 30 seconds`);
    setTimeout(async () => {
      startScanning.call(this);
    }, 30 * 1000); // 30 second wait before re-scan for missing devices
  }, deviceTimeoutValue);
}

/**
 * Timeout device
 */
function timeOutDevice(peripheral) {
  let errMessage;
  const promise = new Promise((resolve, reject) => {
    deviceTimeout = setTimeout(() => {
      errMessage = `Peripheral connection/processing timeout: ${peripheral.location} - ${peripheral.plant} (${peripheral.device})`;
      const objIndex = this.devicesInZone.findIndex(
        (d) => d.device === peripheral.device,
      );
      this.devicesInZone[objIndex].connectionErrors += 1;
      if (this.devicesInZone[objIndex].connectionErrors === 2) {
        errMessage = `Max connection/processing error retry hit. Device needs manual reset: ${peripheral.location} - ${peripheral.plant} (${peripheral.device})`;
        delete this.devicesInZone[objIndex].peripheral;
      }
      reject(new Error(errMessage));
    }, deviceTimeoutValue);
  });
  return promise;
}

/**
 * Process device
 */
async function processDevice(peripheral) {
  try {
    const deviceAddress = peripheral.device || '';

    // eslint-disable-next-line no-unused-expressions
    debug(
      `Connecting to peripheral: ${peripheral.location} - ${peripheral.plant} (${deviceAddress})`,
    );

    await peripheral.peripheral.connectAsync();

    debug(
      `Getting data from peripheral: ${peripheral.location} - ${peripheral.plant} (${deviceAddress})`,
    );

    // eslint-disable-next-line max-len
    const characteristics = await peripheral.peripheral.discoverAllServicesAndCharacteristicsAsync();
    const sensorJSON = {
      time: new Date(),
      device: deviceAddress,
      location: peripheral.location || '',
      plant: peripheral.plant || '',
      zone: peripheral.zone || 0,
      thresholdMoisture: peripheral.thresholdMoisture || 0,
      thresholdFertilizer: peripheral.thresholdFertilizer || 0,
    };

    // Current battery reading
    debug(
      `Getting firmware data from: ${peripheral.location} - ${peripheral.plant} (${deviceAddress})`,
    );
    const firmware = characteristics.characteristics.find(
      (entry) => entry.uuid === UUID_CHARACTERISTIC_FIRMWARE,
    );
    const firmwareData = await firmware.readAsync();
    sensorJSON.battery = firmwareData.readUInt8(0);

    // Put into realtime mode
    debug(`Put sensor in real time mode`);
    const mode = characteristics.characteristics.find(
      (entry) => entry.uuid === UUID_CHARACTERISTIC_MODE,
    );
    await mode.writeAsync(MODE_BUFFER_REALTIME.Enable, false);
    const deviceState = await mode.readAsync();
    if (deviceState.equals(MODE_BUFFER_REALTIME.Enable)) {
      debug(`${deviceAddress} now in realtime mode`);
    } else {
      const errMessage = `${this._traceStack()} - ${deviceAddress} failed to update to realtime mode`;
      this.logger.error(errMessage);
      return new Error(errMessage);
    }

    // Current sensor readings
    debug(
      `Getting sensor data from: ${peripheral.location} - ${peripheral.plant} (${deviceAddress})`,
    );
    const sensor = characteristics.characteristics.find(
      (entry) => entry.uuid === UUID_CHARACTERISTIC_DATA,
    );

    const sensorData = await sensor.readAsync();
    sensorJSON.temperature = sensorData.readUInt16LE(0) / 10;
    sensorJSON.lux = sensorData.readUInt32LE(3);
    sensorJSON.moisture = sensorData.readUInt8(7);
    sensorJSON.fertility = sensorData.readUInt16LE(8);
    debug(`Peripheral (${deviceAddress}) - ${JSON.stringify(sensorJSON)}`);

    debug(
      `Disconnect peripheral: ${peripheral.location} - ${peripheral.plant} (${deviceAddress})`,
    );
    await peripheral.peripheral.disconnectAsync();

    clearTimeout(deviceTimeout);
    await saveDeviceData.call(this, sensorJSON); // Save the device data
  } catch (err) {
    clearTimeout(deviceTimeout);
    this.logger.error(`${this._traceStack()} - ${err.message}`);
  }
  return true;
}

/**
 * Process peripherals array
 */
async function processPeripherals() {
  const devicesToProcess = this.devicesInZone.filter(
    (d) => typeof d.peripheral !== 'undefined',
  );

  // If no peripherals assigned to devices, exit
  if (devicesToProcess.length === 0) {
    debug(`No peripheral(s) to process`);
    return;
  }

  debug(`Geting data from peripheral(s)`);

  // eslint-disable-next-line no-restricted-syntax
  for await (const peripheral of devicesToProcess) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await Promise.race([
        processDevice.call(this, peripheral),
        timeOutDevice.call(this, peripheral),
      ]).catch((err) => {
        this.logger.error(`${this._traceStack()} - ${err.message}`);
      });
    } catch (err) {
      this.logger.error(`${this._traceStack()} - ${err.message}`);
    }
  }
}

/**
 * Discover devices in zone
 */
async function discoverDevices() {
  noble.on('stateChange', (state) => {
    if (state === 'poweredOn') {
      startScanning.call(this);
    } else {
      stopScanning.call(this, true);
    }
  });

  noble.on('discover', async (peripheral) => {
    const currentDevice = this.devicesInZone.filter(
      (d) => d.device === peripheral.id,
    );

    // Check if peripheral is in zone
    if (currentDevice.length === 0) {
      debug(`Device not listed in zone: ${peripheral.id}`);
      return;
    }

    // Check if peripheral already assigned
    if (typeof currentDevice[0].peripheral !== 'undefined') {
      debug(
        `Existing device found: ${currentDevice[0].location} - ${currentDevice[0].plant} (${peripheral.id})`,
      );
      return;
    }

    // Find index of device in memory
    const objIndex = this.devicesInZone.findIndex(
      (d) => d.device === peripheral.id,
    );

    // Assign peripheral to device
    this.logger.info(
      `Adding peripheral to device: ${this.devicesInZone[objIndex].location} - ${this.devicesInZone[objIndex].plant} (${peripheral.id})`,
    );
    this.devicesInZone[objIndex].peripheral = peripheral;

    // Check if found all peripherals
    const foundDevices = this.devicesInZone.filter(
      (d) => typeof d.peripheral !== 'undefined',
    );
    if (foundDevices.length === this.devicesInZone.length) {
      this.logger.info(`Found all devices`);
      stopScanning.call(this, true);
      processPeripherals.call(this);
    }
  });

  return true;
}

/**
 * Get devices assigned to the zone
 */
async function getDevicesForZone() {
  let zone = process.env.ZONE;
  zone = zone.split`,`.map((x) => +x);

  let dbConnection;
  this.devicesInZone = [];

  try {
    dbConnection = await this._connectToDB();
    debug(`Query DB`);
    const query = { active: true, zone: { $in: zone } };
    this.devicesInZone = await dbConnection
      .db(this.namespace)
      .collection('devices')
      .find(query)
      .toArray();

    if (this.devicesInZone.length === 0) {
      this.logger.error(
        `${this._traceStack()} - No devices assigned to zone ${zone}`,
      );
      return false;
    }

    debug(
      `Found ${this.devicesInZone.length} devices assigned to zone ${zone}`,
    );
  } catch (err) {
    this.logger.error(`${this._traceStack()} - ${err.message}`);
  } finally {
    debug(`Close DB connection`);
    await dbConnection.close();
  }
  return true;
}

/**
 * Get devices for the zone and process those devices
 */
async function _processDevices() {
  if (await getDevicesForZone.call(this)) {
    await discoverDevices.call(this);

    this.scanIntival = setTimeout(() => {
      startScanning.call(this);
    }, deviceScanIntival);

    this.processPeripheralsIntival = setInterval(() => {
      processPeripherals.call(this);
    }, processPeripheralsIntival);
  } else {
    debug('No devices to process');
  }
}

module.exports = {
  _processDevices,
};
