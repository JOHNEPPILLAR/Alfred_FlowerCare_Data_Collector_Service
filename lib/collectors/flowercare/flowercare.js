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
 * Process device
 */
async function processDevice(peripheral) {
  try {
    const deviceAddress = normaliseAddress(peripheral.address);
    let deviceConnected = false;

    setTimeout(() => {
      if (!deviceConnected) {
        throw new Error(
          `Peripheral connection/processing timeout: ${deviceAddress}`,
        );
      }
    }, 3 * 60 * 1000); // 3 minute connection timeout;

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
      this.logger.trace(
        `${this._traceStack()} - ${deviceAddress} failed to update`,
      );
      return;
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

    this.logger.trace(
      `${this._traceStack()} - Save data from device: ${deviceAddress}`,
    );
    deviceConnected = true;
    await saveDeviceData.call(this, sensorJSON); // Save the device data
  } catch (err) {
    this.logger.error(`${this._traceStack()} - ${err.message}`);
  }
}

/**
 * Process devices array
 */
async function processDevices() {
  this.logger.trace(`${this._traceStack()} - Geting data from devices`);
  // eslint-disable-next-line no-restricted-syntax
  for (const peripheral of this.foundDevices) {
    // eslint-disable-next-line no-await-in-loop
    await processDevice.call(this, peripheral);
  }

  setTimeout(() => {
    processDevices.call(this);
  }, pollingIntival);
}

async function _getFlowerCareDevices() {
  const zone = process.env.ZONE;

  let scanCounter = 0;

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

    noble.on('stateChange', async (state) => {
      if (state === 'poweredOn') {
        this.logger.debug(`${this._traceStack()} - Start device discovery`);
        await noble.startScanningAsync(['fe95'], false);
        scanRunning = true;
        scanCounter += 1;
      } else {
        this.logger.trace(`${this._traceStack()} - Stopping scan`);
        await noble.stopScanningAsync();
        scanRunning = false;
      }
    });

    noble.on('discover', async (peripheral) => {
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

        this.logger.trace(`${this._traceStack()} - Stop scaning`);
        await noble.stopScanningAsync();
        scanRunning = false;
        scanCounter = 0;

        processDevices.call(this);
      }

      setTimeout(async () => {
        if (!scanRunning) return;
        this.logger.trace(
          `${this._traceStack()} - Device discovery timeout, stopping discovery`,
        );
        await noble.stopScanningAsync();
        scanRunning = false;
        scanCounter += 1;

        this.logger.trace(
          `${this._traceStack()} - Only found: ${JSON.stringify(
            this.foundDeviceAddress,
          )}`,
        );

        if (scanCounter > 5) {
          scanCounter = 0; // Reset counter
          const missingDeivies = [];
          this.devicesInZone.map((addr) => {
            if (!this.foundDeviceAddress.includes(addr))
              missingDeivies.push(addr);
            return true;
          });
          const message = `Not able to find device(s) ${JSON.stringify(
            missingDeivies,
          )}`;
          this.logger.error(message);

          if (os.type() === 'Linux') {
            this.logger.debug(
              `${this._traceStack()} - Restarting bluetooth service`,
            );
            const restartBluetooth = spawn('service', 'bluetooth restart');
            restartBluetooth.once('exit', () => {
              this.logger.debug(
                `${this._traceStack()} - Restarted bluetooth service`,
              );
            });
            restartBluetooth.stderr.on('data', (data) => {
              this.logger.error(
                `${this._traceStack()} - Restart bluetooth error: ${data}`,
              );
            });
          }
        }

        this.logger.trace(`${this._traceStack()} - Re-scanning in 30 seconds`);
        setTimeout(async () => {
          this.logger.debug(`${this._traceStack()} - Start device discovery`);
          await noble.startScanningAsync(['fe95'], false);
          scanRunning = true;
        }, 30 * 1000); // 30 re-scan for missing devices
      }, 2 * 60 * 1000); // 2 minute device scan timeout
    });
  } catch (err) {
    this.logger.error(`${this._traceStack()} - ${err.message}`);
  }
}

module.exports = {
  _getFlowerCareDevices,
};
