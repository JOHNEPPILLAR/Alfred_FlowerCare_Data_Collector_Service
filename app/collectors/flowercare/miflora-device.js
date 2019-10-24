/**
 * Import helper libraries
 */
const serviceHelper = require('alfred-helper');

const UUID_SERVICE_XIAOMI = 'fe95';
const UUID_SERVICE_DATA = '0000120400001000800000805f9b34fb';
const UUID_CHARACTERISTIC_MODE = '00001a0000001000800000805f9b34fb';
const UUID_CHARACTERISTIC_DATA = '00001a0100001000800000805f9b34fb';
const UUID_CHARACTERISTIC_FIRMWARE = '00001a0200001000800000805f9b34fb';
const MODE_BUFFER_REALTIME = {
  Enable: Buffer.from('a01f', 'hex'),
  Disable: Buffer.from('c01f', 'hex'),
};
const timeout = 60000; // 1 minute

/**
 * Represents a Mi Flora device
 * @public
 */
class MiFloraDevice {
  /**
   * @private
   * @param {Peripheral} peripheral
   */
  constructor(peripheral, type) {
    this.peripheral = peripheral;
    this.service = undefined;
    this.firmwareCharacteristic = undefined;
    this.modeCharacteristic = undefined;
    this.dataCharacteristic = undefined;
    this.name = peripheral.advertisement.localName;
    this.address = MiFloraDevice.normaliseAddress(peripheral.address);
    this.lastDiscovery = new Date().getTime();
    this.isConnected = false;
    this.type = type || 'unknown';
    this.responseTemplate = {
      address: this.address,
      type: this.type,
    };
    peripheral.once('connect', (error) => {
      if (error) {
        serviceHelper.log('error', `Error while connecting to device: ${error.message}`);
      } else {
        serviceHelper.log('trace', `Connected to device ${this.address}`);
        this.isConnected = true;
      }
    });
    peripheral.once('disconnect', (error) => {
      if (error) {
        serviceHelper.log('error', `Error while disconnecting to device: ${error.message}`);
      } else {
        serviceHelper.log('trace', `Disconnected from device ${this.address}`);
        this.isConnected = false;
      }
    });
  }

  /**
   * Connects to the device
   * @public
   * @returns {Promise} Promise for connection process
   */
  connect() {
    // eslint-disable-next-line consistent-return
    return new Promise(async (resolve, reject) => {
      const deviceTimeout = setTimeout(() => {
        reject(new Error('device connection timeout'));
      }, timeout);

      if (this.peripheral.state === 'connected') {
        clearTimeout(deviceTimeout);
        return resolve();
      }

      this.peripheral.once('connect', async () => {
        try {
          await this.resolveCharacteristics();
          clearTimeout(deviceTimeout);
          return resolve();
        } catch (error) {
          clearTimeout(deviceTimeout);
          serviceHelper.log('error', error.message);
          return reject(error);
        }
      });
      serviceHelper.log('trace', 'Initiating connection');
      this.peripheral.connect();
    });
  }

  /**
   * Disconnects from the device
   * @public
   * @returns {Promise} Promise for disconnection process
   */
  disconnect() {
    // eslint-disable-next-line consistent-return
    return new Promise(async (resolve, reject) => {
      const deviceTimeout = setTimeout(() => {
        reject(new Error('device disconnect timeout'));
      }, timeout);
      if (this.peripheral.state === 'disconnected') {
        clearTimeout(deviceTimeout);
        return resolve();
      }
      this.peripheral.once('disconnect', async () => {
        try {
          clearTimeout(deviceTimeout);
          return resolve();
        } catch (error) {
          serviceHelper.log('error', error.message);
          clearTimeout(deviceTimeout);
          return reject(error);
        }
      });
      serviceHelper.log('trace', 'Closing connection');
      this.peripheral.disconnect();
    });
  }

  queryFirmwareInfo(plain = false) {
    return new Promise(async (resolve, reject) => {
      const deviceTimeout = setTimeout(() => {
        reject(new Error('queryFirmwareInfo timeout'));
      }, timeout);
      serviceHelper.log('trace', 'Querying firmware information');
      try {
        await this.connect();
        const data = await this.readCharacteristic(this.firmwareCharacteristic);
        const response = this.responseTemplate;
        response.firmwareInfo = {
          battery: data.readUInt8(0),
          firmware: data.toString('ascii', 2, data.length),
        };
        serviceHelper.log(
          'trace',
          `Successfully queried firmware information: ${JSON.stringify(response.firmwareInfo)}`,
        );
        clearTimeout(deviceTimeout);
        resolve(plain ? response.firmwareInfo : response);
      } catch (error) {
        serviceHelper.log('error', error.message);
        clearTimeout(deviceTimeout);
        reject(error);
      }
    });
  }

  /**
   * @private
   */
  setRealtimeDataMode(enable) {
    return new Promise(async (resolve, reject) => {
      const deviceTimeout = setTimeout(() => {
        reject(new Error('setRealtimeDataMode timeout'));
      }, timeout);
      serviceHelper.log('trace', `${enable ? 'enabling' : 'disabling'} realtime data mode`);
      try {
        const buffer = enable ? MODE_BUFFER_REALTIME.Enable : MODE_BUFFER_REALTIME.Disable;
        clearTimeout(deviceTimeout);
        return resolve(await this.setDeviceMode(buffer));
      } catch (error) {
        serviceHelper.log('error', error.message);
        clearTimeout(deviceTimeout);
        return reject(error);
      }
    });
  }

  /**
   * @private
   * @param {ByteBuffer} buffer Bytes to write
   */
  setDeviceMode(buffer) {
    return new Promise(async (resolve, reject) => {
      const deviceTimeout = setTimeout(() => {
        reject(new Error('setDeviceMode timeout'));
      }, timeout);
      serviceHelper.log('trace', 'Changing device mode');
      try {
        await this.writeCharacteristic(this.modeCharacteristic, buffer);
        const data = await this.readCharacteristic(this.modeCharacteristic);
        if (data.equals(buffer)) {
          serviceHelper.log('trace', 'Successfully changed device mode');
          clearTimeout(deviceTimeout);
          return resolve(data);
        }
        clearTimeout(deviceTimeout);
        return reject(new Error('Failed to change mode'));
      } catch (error) {
        serviceHelper.log('error', error.message);
        clearTimeout(deviceTimeout);
        return reject(error);
      }
    });
  }

  querySensorValues(plain = false) {
    return new Promise(async (resolve, reject) => {
      const deviceTimeout = setTimeout(() => {
        reject(new Error('querySensorValues timeout'));
      }, timeout);
      serviceHelper.log('trace', 'Querying sensor information');
      try {
        await this.connect();
        await this.setRealtimeDataMode(true);
        const data = await this.readCharacteristic(this.dataCharacteristic);
        const response = this.responseTemplate;
        response.sensorValues = {
          temperature: data.readUInt16LE(0) / 10,
          lux: data.readUInt32LE(3),
          moisture: data.readUInt8(7),
          fertility: data.readUInt16LE(8),
        };
        serviceHelper.log(
          'trace',
          `Successfully queried sensor information: ${JSON.stringify(response.sensorValues)}`,
        );
        clearTimeout(deviceTimeout);
        return resolve(plain ? response.sensorValues : response);
      } catch (error) {
        serviceHelper.log('error', error.message);
        clearTimeout(deviceTimeout);
        return reject(error);
      }
    });
  }

  query() {
    return new Promise(async (resolve, reject) => {
      const deviceTimeout = setTimeout(() => {
        reject(new Error('query all values timeout'));
      }, timeout);
      serviceHelper.log('trace', 'Querying all values');
      try {
        const result = this.responseTemplate;
        result.firmwareInfo = await this.queryFirmwareInfo(true);
        result.sensorValues = await this.querySensorValues(true);
        serviceHelper.log('trace', 'Successfully queried all values');
        clearTimeout(deviceTimeout);
        return resolve(result);
      } catch (error) {
        serviceHelper.log('error', error.message);
        clearTimeout(deviceTimeout);
        return reject(error);
      }
    });
  }

  resolveCharacteristics() {
    // eslint-disable-next-line consistent-return
    return new Promise(async (resolve, reject) => {
      const deviceTimeout = setTimeout(() => {
        reject(new Error('resolveCharacteristics timeout'));
      }, timeout);
      serviceHelper.log('trace', 'Resolving characteristic');
      try {
        this.peripheral.discoverAllServicesAndCharacteristics(
          (error, services, characteristics) => {
            if (error) return reject(error);
            serviceHelper.log(
              'trace',
              `Successfully resolved characteristics ${services.length} ${characteristics.length}`,
            );
            this.service = this.peripheral.services.find(entry => entry.uuid === UUID_SERVICE_DATA);
            this.firmwareCharacteristic = this.service.characteristics.find(
              entry => entry.uuid === UUID_CHARACTERISTIC_FIRMWARE,
            );
            this.modeCharacteristic = this.service.characteristics.find(
              entry => entry.uuid === UUID_CHARACTERISTIC_MODE,
            );
            this.dataCharacteristic = this.service.characteristics.find(
              entry => entry.uuid === UUID_CHARACTERISTIC_DATA,
            );
            clearTimeout(deviceTimeout);
            return resolve();
          },
        );
      } catch (error) {
        serviceHelper.log('error', error.message);
        clearTimeout(deviceTimeout);
        return reject(error);
      }
    });
  }

  /**
   * @private
   */
  readCharacteristic(characteristic) {
    // eslint-disable-next-line consistent-return
    this.returnValue = new Promise(async (resolve, reject) => {
      const deviceTimeout = setTimeout(() => {
        reject(new Error('readCharacteristic timeout'));
      }, timeout);
      try {
        characteristic.read((error, data) => {
          if (error) {
            clearTimeout(deviceTimeout);
            return reject(error);
          }
          serviceHelper.log(
            'trace',
            `Successfully read value ${data
              .toString('hex')
              .toUpperCase()} from characteristic ${characteristic.uuid.toUpperCase()}`,
          );
          clearTimeout(deviceTimeout);
          return resolve(data);
        });
      } catch (error) {
        serviceHelper.log('error', error.message);
        clearTimeout(deviceTimeout);
        return reject(error);
      }
    });
    return this.returnValue;
  }

  /**
   * @private
   */
  writeCharacteristic(characteristic, data) {
    // eslint-disable-next-line consistent-return
    this.returnValue = new Promise(async (resolve, reject) => {
      const deviceTimeout = setTimeout(() => {
        reject(new Error('writeCharacteristic timeout'));
      }, timeout);
      try {
        characteristic.write(data, false, (error) => {
          if (error) {
            serviceHelper.log('error', error.message);
            clearTimeout(deviceTimeout);
            return reject(error);
          }
          serviceHelper.log(
            'trace',
            `Successfully wrote value ${data
              .toString('hex')
              .toUpperCase()} from characteristic ${characteristic.uuid.toUpperCase()}`,
          );
          clearTimeout(deviceTimeout);
          return resolve();
        });
      } catch (error) {
        serviceHelper.log('error', error.message);
        clearTimeout(deviceTimeout);
        return reject(error);
      }
    });
    return this.returnValue;
  }

  /**
   * Factory method to create an instance from given Peripheral.
   * @private
   * @static
   * @param {Peripheral} peripheral
   */
  static from(peripheral) {
    if (peripheral && peripheral.advertisement && peripheral.advertisement.serviceData) {
      const dataItem = peripheral.advertisement.serviceData.find(
        item => item.uuid === UUID_SERVICE_XIAOMI,
      );
      if (dataItem) {
        const productId = dataItem.data.readUInt16LE(2);
        switch (productId) {
          case 152:
            return new MiFloraDevice(peripheral, 'MiFloraMonitor');
          case 349:
            return new MiFloraDevice(peripheral, 'MiFloraPot');
          default:
        }
      }
    }
    return new Error('Unknown device');
  }

  static normaliseAddress(address) {
    return address.replace(/-/g, ':').toLowerCase();
  }
}

module.exports = MiFloraDevice;
