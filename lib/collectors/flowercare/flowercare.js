/**
 * Import external libraries
 */
const miflora = require('miflora');

function promiseTimeout(ms, promise) {
  let id;
  let timeout = new Promise((resolve, reject) => {
    id = setTimeout(() => {
      reject('Timed out in ' + ms + 'ms.');
    }, ms);
  });

  return Promise.race([promise, timeout]).then((result) => {
    clearTimeout(id);
    return result;
  });
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

async function _getFlowerCareData(device) {
  try {
    const deviceData = {};
    this.logger.trace(
      `${this._traceStack()} - Getting sensor data for device: ${
        device.address
      }`,
    );

    const connected = await device.connect();
    if (!device.isConnected) {
      this.logger.error(
        `${this._traceStack()} - Connecting to device: ${
          device.address
        } failed`,
      );
      return;
    }
    if (connected instanceof Error) {
      this.logger.error(
        `${this._traceStack()} - Not able to connect to device: ${
          device.address
        } - ${connected.message}`,
      );
      return;
    }

    this.logger.trace(
      `${this._traceStack()} - Read data from device: ${device.address}`,
    );

    const baseData = await device.query();
    if (baseData instanceof Error) {
      this.logger.error(
        `${this._traceStack()} - Not able to query device: ${
          device.address
        } - ${baseData.message}`,
      );
      return;
    }

    deviceData.address = baseData.address;
    deviceData.type = baseData.type;
    deviceData.battery = baseData.firmwareInfo.battery;
    deviceData.temperature = baseData.sensorValues.temperature;
    deviceData.lux = baseData.sensorValues.lux;
    deviceData.moisture = baseData.sensorValues.moisture;
    deviceData.fertility = baseData.sensorValues.fertility;

    this.logger.trace(
      `${this._traceStack()} - Disconnect device: ${baseData.address}`,
    );
    await saveDeviceData.call(this, deviceData); // Save the device data
    await device.disconnect();
  } catch (err) {
    this.logger.error(`${this._traceStack()} - ${err.message}`);
  }
}

async function _getFlowerCareDevices() {
  try {
    const zone = process.env.ZONE;
    const sql = `SELECT address FROM garden_sensor_plant WHERE zone in (${zone})`;
    const devicesToScan = [];

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
      devicesToScan.push(`${deviceID.address}`);
      return true;
    });

    this.logger.trace(
      `${this._traceStack()} - Starting device discovery for zone ${zone}`,
    );
    const devices = await miflora.discover();
    if (devices instanceof Error) {
      this.logger.error(`${this._traceStack()} - ${devices.message}`);
      return;
    }
    this.logger.trace(
      `${this._traceStack()} - Discovered ${devices.length} devices`,
    );

    devicesToScan.map(async (deviceID) => {
      const device = devices.find((entry) => entry.address === deviceID);
      if (device) {
        this.logger.info(`Found and processing device: ${deviceID}`);
        await _getFlowerCareData.call(this, device);
      } else {
        this.logger.trace(
          `${this._traceStack()} - Device ${deviceID} was not found`,
        );
      }
      return true;
    });

    const poolingInterval = 15 * 60 * 1000; // 15 minutes
    setTimeout(() => {
      _getFlowerCareDevices.call(this);
    }, poolingInterval); // Wait then run function again
  } catch (err) {
    this.logger.error(`${this._traceStack()} - ${err.message}`);
  }
}

module.exports = {
  _getFlowerCareDevices,
};
