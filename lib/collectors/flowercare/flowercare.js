/**
 * Import external libraries
 */
const noble = require('@abandonware/noble');
const os = require('os');
const { spawn } = require('child_process');

const UUID_CHARACTERISTIC_FIRMWARE = '00001a0200001000800000805f9b34fb';
const UUID_CHARACTERISTIC_DATA = '00001a0100001000800000805f9b34fb';
const UUID_CHARACTERISTIC_MODE = '00001a0000001000800000805f9b34fb';
const MODE_BUFFER_REALTIME = {
  Enable: Buffer.from('a01f', 'hex'),
  Disable: Buffer.from('c01f', 'hex'),
};
const pollingIntival = 15 * 60 * 1000; // 15 minutes
const deviceTimeoutValue = 2 * 60 * 1000; // 2 minutes

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
 * Restart bluetooth
 */
function restartBluetooth() {
  if (os.type() === 'Linux') {
    const promise = new Promise((resolve, reject) => {
      this.logger.debug(`${this._traceStack()} - Restarting bluetooth service`);
      const child = spawn('service', ['bluetooth', 'restart']);
      child.once('exit', () => {
        this.logger.debug(
          `${this._traceStack()} - Restarted bluetooth service`,
        );
        resolve(true);
      });
      child.stderr.on('data', (data) => {
        const msg = `Restart bluetooth error: ${data}`;
        this.logger.error(`${this._traceStack()} - ${msg}`);
        reject(new Error(msg));
      });
    });
    return promise;
  }
  return true;
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
  this.logger.debug(`${this._traceStack()} - Start device discovery`);
  scanRunning = true;
  scanCounter += 1;
  await noble.startScanningAsync(['fe95'], false);

  setTimeout(async () => {
    try {
      if (!scanRunning) return;
      this.logger.trace(
        `${this._traceStack()} - Device discovery timeout, stopping discovery`,
      );
      await stopScanning.call(this, false);

      const missingDevices = [];
      Object.values(this.devices).map((dz) => {
        const found = Object.values(this.devicesFound).filter(
          (df) => normaliseAddress(df.address) === normaliseAddress(dz.device),
        );
        if (found.length === 0)
          missingDevices.push(
            `Device: ${dz.location} - ${dz.plant} (${dz.device})`,
          );
        return true;
      });
      const message = `Not able to find ${JSON.stringify(missingDevices)}`;
      this.logger.error(message);

      if (scanCounter === 3) {
        scanCounter = 0; // Reset counter
        this.logger.error(
          `${this._traceStack()} - Max discovery retry hit. Processing found devices`,
        );

        // eslint-disable-next-line no-use-before-define
        await processDevices.call(this);

        // Reset bleutooth
        await restartBluetooth.call(this);
        startScanning.call(this);
      } else {
        this.logger.trace(`${this._traceStack()} - Re-scanning in 30 seconds`);
        setTimeout(async () => {
          await restartBluetooth.call(this);
          startScanning.call(this);
        }, 30 * 1000); // 30 second wait before re-scan for missing devices
      }
    } catch (err) {
      this.logger.error(`${this._traceStack()} - ${err.message}`);
      await restartBluetooth.call(this);
      startScanning.call(this);
    }
  }, deviceTimeoutValue);
}

/**
 * Timeout device
 */
function timeOutDevice(deviceAddress) {
  let errMessage;
  const promise = new Promise((resolve, reject) => {
    deviceTimeout = setTimeout(() => {
      errMessage = `Peripheral connection/processing timeout: ${this.device[deviceAddress].location} - ${this.device[deviceAddress].plant} (${deviceAddress})`;
      this.device[deviceAddress].failed_connection += 1;
      if (this.device[deviceAddress].failed_connection === 5) {
        errMessage = `Max connection/processing error retry hit. Device needs manual reset: ${this.device[deviceAddress].location} - ${this.device[deviceAddress].plant} (${deviceAddress})`;
        delete this.devicesFound[deviceAddress];
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
  const deviceAddress = normaliseAddress(peripheral.address);
  // eslint-disable-next-line no-unused-expressions
  this.logger.debug(
    `${this._traceStack()} - Connecting to peripheral: ${deviceAddress}`,
  );
  await peripheral.connectAsync();

  this.logger.trace(
    `${this._traceStack()} - Getting data from peripheral: ${deviceAddress}`,
  );

  // eslint-disable-next-line max-len
  const characteristics = await peripheral.discoverAllServicesAndCharacteristicsAsync();
  const sensorJSON = {
    time: new Date(),
    device: deviceAddress,
    location: this.devices[deviceAddress].location,
    plant: this.devices[deviceAddress].plant,
    zone: this.devices[deviceAddress].zone,
    thresholdMoisture: this.devices[deviceAddress].thresholdMoisture,
    thresholdFertilizer: this.devices[deviceAddress].thresholdFertilizer,
  };

  // Current battery reading
  this.logger.trace(
    `${this._traceStack()} - Getting firmware data from: ${deviceAddress}`,
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
    `${this._traceStack()} - Getting sensor data from: ${deviceAddress}`,
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

  this.logger.debug(
    `${this._traceStack()} - Disconnect peripheral: ${deviceAddress}`,
  );
  await peripheral.disconnectAsync();
  clearTimeout(deviceTimeout);

  this.logger.trace(
    `${this._traceStack()} - Save data from device: ${deviceAddress}`,
  );
  await saveDeviceData.call(this, sensorJSON); // Save the device data
  return true;
}

/**
 * Process devices array
 */
async function processDevices() {
  if (Object.values(this.devicesFound).length === 0) return;

  this.logger.trace(`${this._traceStack()} - Geting data from devices`);

  // eslint-disable-next-line no-restricted-syntax
  for await (const peripheral of Object.values(this.devicesFound)) {
    try {
      const deviceAddress = normaliseAddress(peripheral.address);

      // eslint-disable-next-line no-await-in-loop
      await Promise.race([
        processDevice.call(this, peripheral),
        timeOutDevice.call(this, deviceAddress),
      ])
        .then(() => {
          this.logger.trace(
            `${this._traceStack()} - Processed device: ${deviceAddress}`,
          );
        })
        // eslint-disable-next-line no-loop-func
        .catch((err) => {
          this.logger.error(`${this._traceStack()} - ${err.message}`);
        });
    } catch (err) {
      this.logger.error(`${this._traceStack()} - ${err.message}`);
    }
  }

  // Reset bleutooth
  restartBluetooth.call(this);

  this.collectDataInterval = setInterval(async () => {
    processDevices.call(this);
  }, pollingIntival);
}

async function _getFlowerCareDevices() {
  let zone = process.env.ZONE;
  zone = zone.split`,`.map((x) => +x);

  let dbConnection;
  this.devices = {};
  this.devicesFound = {};

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
    for await (const peripheral of results) {
      this.devices[peripheral.device] = peripheral;
      this.devices[peripheral.device].failed_connection = 0;
    }
  } catch (err) {
    this.logger.error(`${this._traceStack()} - ${err.message}`);
  } finally {
    this.logger.trace(`${this._traceStack()} - Close DB connection`);
    await dbConnection.close();
  }

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

      const validDevice = this.devicesFound[deviceAddress];
      if (validDevice) {
        this.logger.debug(
          `${this._traceStack()} - Existing device found: ${deviceAddress}`,
        );
        return;
      }
      this.logger.debug(
        `${this._traceStack()} - Discovered new device: ${deviceAddress}`,
      );

      const deviceInfo = this.devices[deviceAddress];
      if (!deviceInfo) {
        this.logger.debug(
          `${this._traceStack()} - Device not in zone: ${deviceAddress}`,
        );
        return;
      }

      this.logger.info(
        `Add to device cache: ${deviceInfo.location} - ${deviceInfo.plant} (${deviceAddress})`,
      );
      this.devicesFound[deviceAddress] = peripheral;
      this.devicesFound[deviceAddress].connectionErrors = 0;

      if (
        Object.values(this.devices).length ===
        Object.values(this.devicesFound).length
      ) {
        this.logger.info(`Found all devices`);
        stopScanning.call(this, true);
        processDevices.call(this);
      }
    } catch (err) {
      this.logger.error(`${this._traceStack()} - ${err}`);
    }
  });
  return true;
}

module.exports = {
  _getFlowerCareDevices,
};
