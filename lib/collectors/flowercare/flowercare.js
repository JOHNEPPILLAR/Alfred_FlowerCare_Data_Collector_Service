/**
 * Import external libraries
 */
const noble = require('@abandonware/noble');

const UUID_CHARACTERISTIC_FIRMWARE = '00001a0200001000800000805f9b34fb';
const UUID_CHARACTERISTIC_DATA = '00001a0100001000800000805f9b34fb';
const UUID_CHARACTERISTIC_MODE = '00001a0000001000800000805f9b34fb';
const MODE_BUFFER_REALTIME = {
  Enable: Buffer.from('a01f', 'hex'),
  Disable: Buffer.from('c01f', 'hex'),
};
const pollingIntival = 15 * 60 * 1000; // 15 minutes
const deviceTimeoutValue = 1 * 60 * 1000; // 1 minute

let scanRunning = false;
let scanCounter = 0;
let deviceTimeout;

function normaliseAddress(address) {
  return address.replace(new RegExp('-', 'g'), ':');
}

/**
 * Save data to data store
 */
async function saveDeviceData(device) {
  let dbConnection;

  this.logger.trace(
    `${this._traceStack()} - Saving data: ${device.location} - ${
      device.plant
    } (${device.device})`,
  );

  try {
    dbConnection = await this._connectToDB();
    this.logger.trace(`${this._traceStack()} - Insert data`);
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
    this.logger.trace(`${this._traceStack()} - Close DB connection`);
    await dbConnection.close();
  }
}

/**
 * Stop bluetooth device scan
 */
async function stopScanning(resetScanCounter) {
  this.logger.trace(`${this._traceStack()} - Stopping scan`);
  await noble.stopScanningAsync();
  scanRunning = false;
  if (resetScanCounter) scanCounter = 0;
}

/**
 * Start bluetooth device scan
 */
async function startScanning() {
  this.logger.debug(`${this._traceStack()} - Start peripheral discovery`);
  scanRunning = true;
  scanCounter += 1;
  await noble.startScanningAsync(['fe95'], false);

  setTimeout(async () => {
    try {
      if (!scanRunning) return;
      this.logger.trace(
        `${this._traceStack()} - Peripheral discovery timeout, stopping discovery`,
      );
      await stopScanning.call(this, false);

      const missingDevices = this.devicesInZone.filter(
        (d) => typeof d.peripheral === 'undefined',
      );

      let message = `Not able to find: `;
      missingDevices.map((md) => {
        message += `${md.location} - ${md.plant} (${md.device}) ${
          missingDevices.length === 0 ? ',' : ''
        }`;
        return true;
      });
      this.logger.error(message);

      if (scanCounter === 3) {
        scanCounter = 0; // Reset counter
        this.logger.error(
          `${this._traceStack()} - Max discovery retry hit. Processing found peripheral(s)`,
        );

        // eslint-disable-next-line no-use-before-define
        await processDevices.call(this);
        return;
      }

      this.logger.trace(`${this._traceStack()} - Re-scanning in 30 seconds`);
      setTimeout(async () => {
        startScanning.call(this);
      }, 30 * 1000); // 30 second wait before re-scan for missing devices
    } catch (err) {
      this.logger.error(`${this._traceStack()} - ${err.message}`);
      startScanning.call(this);
    }
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
      if (this.devicesInZone[objIndex].connectionErrors === 4) {
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
    const deviceAddress = peripheral.device;

    // eslint-disable-next-line no-unused-expressions
    this.logger.debug(
      `${this._traceStack()} - Connecting to peripheral: ${
        peripheral.location
      } - ${peripheral.plant} (${deviceAddress})`,
    );
    await peripheral.peripheral.connectAsync();

    this.logger.trace(
      `${this._traceStack()} - Getting data from peripheral: ${
        peripheral.location
      } - ${peripheral.plant} (${deviceAddress})`,
    );

    // eslint-disable-next-line max-len
    const characteristics = await peripheral.peripheral.discoverAllServicesAndCharacteristicsAsync();
    const sensorJSON = {
      time: new Date(),
      device: deviceAddress,
      location: peripheral.location,
      plant: peripheral.plant,
      zone: peripheral.zone,
      thresholdMoisture: peripheral.thresholdMoisture,
      thresholdFertilizer: peripheral.thresholdFertilizer,
    };

    // Current battery reading
    this.logger.trace(
      `${this._traceStack()} - Getting firmware data from: ${
        peripheral.location
      } - ${peripheral.plant} (${deviceAddress})`,
    );
    const firmware = characteristics.characteristics.find(
      (entry) => entry.uuid === UUID_CHARACTERISTIC_FIRMWARE,
    );
    const firmwareData = await firmware.readAsync();
    sensorJSON.battery = firmwareData.readUInt8(0);

    // Put into realtime mode
    this.logger.trace(`${this._traceStack()} - Put sensor in real time mode`);
    const mode = characteristics.characteristics.find(
      (entry) => entry.uuid === UUID_CHARACTERISTIC_MODE,
    );
    await mode.writeAsync(MODE_BUFFER_REALTIME.Enable, false);
    const deviceState = await mode.readAsync();
    if (deviceState.equals(MODE_BUFFER_REALTIME.Enable)) {
      this.logger.trace(
        `${this._traceStack()} - ${deviceAddress} now in realtime mode`,
      );
    } else {
      const errMessage = `${this._traceStack()} - ${deviceAddress} failed to update to realtime mode`;
      this.logger.error(errMessage);
      return new Error(errMessage);
    }

    // Current sensor readings
    this.logger.trace(
      `${this._traceStack()} - Getting sensor data from: ${
        peripheral.location
      } - ${peripheral.plant} (${deviceAddress})`,
    );
    const sensor = characteristics.characteristics.find(
      (entry) => entry.uuid === UUID_CHARACTERISTIC_DATA,
    );

    const sensorData = await sensor.readAsync();
    sensorJSON.temperature = sensorData.readUInt16LE(0) / 10;
    sensorJSON.lux = sensorData.readUInt32LE(3);
    sensorJSON.moisture = sensorData.readUInt8(7);
    sensorJSON.fertility = sensorData.readUInt16LE(8);
    this.logger.trace(
      `${this._traceStack()} - Peripheral (${deviceAddress}) - ${JSON.stringify(
        sensorJSON,
      )}`,
    );

    this.logger.trace(
      `${this._traceStack()} - Disconnect peripheral: ${
        peripheral.location
      } - ${peripheral.plant} (${deviceAddress})`,
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
 * Process devices array
 */
async function processDevices() {
  // Clear existing data collection intival pooling
  clearInterval(this.collectDataInterval);

  const devicesToProcess = this.devicesInZone.filter(
    (d) => typeof d.peripheral !== 'undefined',
  );

  // If no peripherals assigned to devices, exit
  if (devicesToProcess.length === 0) {
    this.logger.trace(`${this._traceStack()} - No peripheral(s) to process`);
    return;
  }

  this.logger.trace(`${this._traceStack()} - Geting data from peripheral(s)`);

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

  this.collectDataInterval = setInterval(async () => {
    processDevices.call(this);
  }, pollingIntival);
}

async function _getFlowerCareDevices(nobleSetup) {
  let zone = process.env.ZONE;
  zone = zone.split`,`.map((x) => +x);

  let dbConnection;
  this.devicesInZone = [];

  try {
    dbConnection = await this._connectToDB();
    this.logger.trace(`${this._traceStack()} - Execute query`);
    const query = { active: true, zone: { $in: zone } };
    const results = await dbConnection
      .db(this.namespace)
      .collection('devices')
      .find(query)
      .toArray();

    if (results.count === 0) {
      // Exit function as no data to process
      this.logger.error(
        `${this._traceStack()} - No devices registered for zone ${zone}`,
      );
      return false;
    }

    // Store devices
    // eslint-disable-next-line no-restricted-syntax
    for await (const device of results) {
      device.connectionErrors = 0;
      device.device = normaliseAddress(device.device);
      this.devicesInZone.push(device);
    }
    this.logger.debug(
      `${this._traceStack()} - ${
        this.devicesInZone.length
      } devices in zone ${zone}`,
    );
  } catch (err) {
    this.logger.error(`${this._traceStack()} - ${err.message}`);
  } finally {
    this.logger.trace(`${this._traceStack()} - Close DB connection`);
    await dbConnection.close();
  }

  if (nobleSetup) {
    noble.on('stateChange', (state) => {
      if (state === 'poweredOn') {
        startScanning.call(this);
      } else {
        stopScanning.call(this, true);
      }
    });

    noble.on('discover', (peripheral) => {
      try {
        const deviceAddress = normaliseAddress(peripheral.address);

        if (deviceAddress === '') {
          this.logger.debug(
            `${this._traceStack()} - Device does not have a vaild address`,
          );
          return;
        }

        // Check if peripheral is in zone
        const newDevice = this.devicesInZone.filter(
          (d) => d.device === deviceAddress,
        );
        if (newDevice.length === 0) {
          this.logger.trace(
            `${this._traceStack()} - Device not listed in zone: ${deviceAddress}`,
          );
          return;
        }

        // Check if peripheral already assigned
        if (typeof newDevice[0].peripheral !== 'undefined') {
          this.logger.trace(
            `${this._traceStack()} - Existing device found: ${
              newDevice[0].location
            } - ${newDevice[0].plant} (${deviceAddress})`,
          );
          return;
        }

        // Find index of device in memory
        const objIndex = this.devicesInZone.findIndex(
          (d) => d.device === deviceAddress,
        );
        // Assign peripheral to device
        this.logger.info(
          `Adding peripheral to device: ${this.devicesInZone[objIndex].location} - ${this.devicesInZone[objIndex].plant} (${deviceAddress})`,
        );
        this.devicesInZone[objIndex].peripheral = peripheral;

        // Check if found all peripherals
        const foundDevices = this.devicesInZone.filter(
          (d) => typeof d.peripheral !== 'undefined',
        );
        if (foundDevices.length === this.devicesInZone.length) {
          this.logger.info(`Found all devices`);
          stopScanning.call(this, true);
          processDevices.call(this);
        }
      } catch (err) {
        this.logger.error(`${this._traceStack()} - ${err}`);
      }
    });
  } else {
    startScanning.call(this);
  }
  return true;
}

module.exports = {
  _getFlowerCareDevices,
};
