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

let scanRunning = false;
let scanCounter = 0;
let deviceTimeout;

function normaliseAddress(address) {
  return address.replace(new RegExp('-', 'g'), ':');
}

/**
 * Save data to data store
 */
async function saveDeviceData(DataValues) {
  const sql =
    'INSERT INTO garden_sensor("time", sender, address, identifier, battery, sunlight, moisture, fertiliser) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)';
  const sqlValues = [
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
    this.logger.trace(
      `${this._traceStack()} - Connect to data store connection pool`,
    );
    const dbConnection = await this._connectToDB.call(this, 'flowercare');
    this.logger.trace(
      `${this._traceStack()} - Save sensor values for device: ${sqlValues[2]}`,
    );
    const results = await dbConnection.query(sql, sqlValues);
    this.logger.trace(
      `${this._traceStack()} - Release the data store connection back to the pool`,
    );
    await dbConnection.end(); // Close data store connection

    if (results.rowCount !== 1) {
      this.logger.error(
        `${this._traceStack()} - Failed to insert data for device: ${
          sqlValues[2]
        }`,
      );
    } else {
      this.logger.info(`Saved data for device: ${sqlValues[2]}`);
    }
  } catch (err) {
    this.logger.error(`${this._traceStack()} - ${err.message}`);
  }
}

/**
 * Restart bluetooth
 */
function restartBluetooth() {
  if (os.type() === 'Linux') {
    this.logger.debug(`${this._traceStack()} - Restarting bluetooth service`);
    const child = spawn('service', ['bluetooth', 'restart']);
    child.once('exit', () => {
      this.logger.debug(`${this._traceStack()} - Restarted bluetooth service`);
    });
    child.stderr.on('data', (data) => {
      this.logger.error(
        `${this._traceStack()} - Restart bluetooth error: ${data}`,
      );
    });
  }
  // eslint-disable-next-line no-use-before-define
  startScanning.call(this);
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
  await noble.startScanningAsync(['fe95'], false);
  scanRunning = true;
  scanCounter += 1;

  setTimeout(async () => {
    if (!scanRunning) return;
    this.logger.trace(
      `${this._traceStack()} - Device discovery timeout, stopping discovery`,
    );
    await stopScanning.call(this, false);

    this.logger.trace(
      `${this._traceStack()} - Only found: ${JSON.stringify(
        this.foundDeviceAddress,
      )}`,
    );

    if (scanCounter === 3) {
      scanCounter = 0; // Reset counter
      const missingDeivies = [];
      this.devicesInZone.map((addr) => {
        if (!this.foundDeviceAddress.includes(addr)) missingDeivies.push(addr);
        return true;
      });
      const message = `Not able to find device(s) ${JSON.stringify(
        missingDeivies,
      )}`;
      this.logger.error(message);

      // eslint-disable-next-line no-use-before-define
      await processDevices.call(this, true);

      restartBluetooth.call(this);
      return;
    }

    this.logger.trace(`${this._traceStack()} - Re-scanning in 30 seconds`);
    setTimeout(() => {
      startScanning.call(this);
    }, 30 * 1000); // 30 second wait before re-scan for missing devices
  }, 2 * 60 * 1000); // 2 minute device scan timeout
}

/**
 * Timeout device
 */
function timeOutDevice(deviceAddress) {
  const promise = new Promise((resolve, reject) => {
    deviceTimeout = setTimeout(() => {
      const errMessage = `Peripheral connection/processing timeout: ${deviceAddress}`;
      reject(new Error(errMessage));
    }, 2 * 60 * 1000); // 2 minute timeout;
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
    address: deviceAddress,
    type: 'MiFloraMonitor',
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
async function processDevices(onlyOnce) {
  this.logger.trace(`${this._traceStack()} - Geting data from devices`);
  let unableToProcessCounter = 0;
  // eslint-disable-next-line no-restricted-syntax
  for (const peripheral of this.foundDevices) {
    const deviceAddress = normaliseAddress(peripheral.address);
    try {
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
          unableToProcessCounter += 1;
        });
    } catch (err) {
      this.logger.error(`${this._traceStack()} - ${err.message}`);
    }
  }

  if (unableToProcessCounter === this.foundDevices.length)
    restartBluetooth.call(this);

  if (!onlyOnce) {
    setTimeout(() => {
      processDevices.call(this, false);
    }, pollingIntival);
  }
}

async function _getFlowerCareDevices() {
  const zone = process.env.ZONE;

  try {
    const sql = `SELECT address FROM garden_sensor_plant WHERE zone in (${zone})`;
    this.logger.trace(
      `${this._traceStack()} - Connect to data store connection pool`,
    );
    const dbConnection = await this._connectToDB.call(this, 'flowercare');
    this.logger.trace(`${this._traceStack()} - Get devices for zone ${zone}`);
    const results = await dbConnection.query(sql);
    this.logger.trace(
      `${this._traceStack()} - Release the data store connection back to the pool`,
    );
    await dbConnection.end(); // Close data store connection

    if (results.rowCount === 0) {
      this.logger.error(
        `${this._traceStack()} - No devices registered for zone ${zone}`,
      );
      return;
    }

    results.rows.map((deviceID) => {
      this.devicesInZone.push(`${deviceID.address}`);
      return true;
    });

    noble.on('stateChange', (state) => {
      if (state === 'poweredOn') {
        startScanning.call(this);
      } else {
        stopScanning.call(this, true);
      }
    });

    noble.on('discover', (peripheral) => {
      const deviceAddress = normaliseAddress(peripheral.address);
      const validDevice = this.devicesInZone.find(
        (entry) => entry === deviceAddress,
      );
      if (!validDevice) {
        this.logger.debug(
          `${this._traceStack()} - Unknown device: ${deviceAddress}`,
        );
        return;
      }

      this.logger.debug(
        `${this._traceStack()} - Found device: ${deviceAddress}`,
      );

      if (!this.foundDeviceAddress.includes(deviceAddress)) {
        this.foundDeviceAddress.push(deviceAddress);
        this.foundDevices.push(peripheral);
      }

      if (
        this.foundDeviceAddress.length === this.devicesInZone.length &&
        this.foundDeviceAddress.sort().every((value, index) => {
          return value === this.devicesInZone.sort()[index];
        })
      ) {
        this.logger.info(`${this._traceStack()} - Found all devices`);
        stopScanning.call(this, true);
        processDevices.call(this, false);
      }
    });
  } catch (err) {
    this.logger.error(`${this._traceStack()} - ${err.message}`);
  }
}

module.exports = {
  _getFlowerCareDevices,
};
