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

async function _getFlowerCareDevices() {
  try {
    const zone = process.env.ZONE;
    const sql = `SELECT address FROM garden_sensor_plant WHERE zone in (${zone})`;
    const validDevices = [];

    let noDevicesFoundMax = 0;
    let foundDevices = 0;

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

    const devicesInZone = results.rows.length;
    results.rows.map((deviceID) => {
      validDevices.push(`${deviceID.address}`);
      return true;
    });

    noble.on('stateChange', async (state) => {
      if (state === 'poweredOn') {
        this.logger.trace(
          `${this._traceStack()} - Starting device discovery for zone ${zone}`,
        );
        await noble.startScanningAsync(['fe95'], false);

        setTimeout(async () => {
          this.logger.trace(`${this._traceStack()} - Timout device discovery`);
          this.logger.info(
            `${this._traceStack()} - Found ${foundDevices} out of ${devicesInZone} devices`,
          );
          if (foundDevices === 0) {
            const message = `👾 No devices found on ${process.env.SERVER_NAME}`;
            this.logger.error(message);
            noDevicesFoundMax += 1;
            if (noDevicesFoundMax === 5) {
              this._sendPushNotification.call(this, message);
              noDevicesFoundMax = 0; // Reset counter
            }
          }
          foundDevices = 0; // Reset counter
          await noble.stopScanningAsync();
        }, 3 * 60 * 1000); // 3 minutes
      } else {
        this.logger.trace(`${this._traceStack()} - Stopping scan`);
        await noble.stopScanningAsync();
      }
    });

    noble.on('discover', async (peripheral) => {
      const deviceAddress = peripheral.address.replace(
        new RegExp('-', 'g'),
        ':',
      );

      const validDevice = await validDevices.find(
        (entry) => entry === deviceAddress,
      );
      if (!validDevice) {
        this.logger.trace(
          `${this._traceStack()} - Device (${deviceAddress}) not in valid zone`,
        );
        return;
      }

      this.logger.debug(
        `${this._traceStack()} - Found and connecting to peripheral: ${deviceAddress}`,
      );
      await peripheral.connectAsync();
      foundDevices += 1;

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
      await saveDeviceData.call(this, sensorJSON); // Save the device data
    });

    const poolingInterval = 15 * 60 * 1000; // 15 minutes
    setInterval(async () => {
      await noble.startScanningAsync(['fe95'], false);
    }, poolingInterval); // Wait then scan for devices again
  } catch (err) {
    this.logger.error(`${this._traceStack()} - ${err.message}`);
  }
}

module.exports = {
  _getFlowerCareDevices,
};
