/**
 * Import helper libraries
 */
const serviceHelper = require('../../lib/helper.js');

const UUID_SERVICE_XIAOMI = 'fe95';
const UUID_SERVICE_DATA = '0000120400001000800000805f9b34fb';
const UUID_CHARACTERISTIC_MODE = '00001a0000001000800000805f9b34fb';
const UUID_CHARACTERISTIC_DATA = '00001a0100001000800000805f9b34fb';
const UUID_CHARACTERISTIC_FIRMWARE = '00001a0200001000800000805f9b34fb';

const MODE_BUFFER_SERIAL = Buffer.from('b0ff', 'hex');
const MODE_BUFFER_REALTIME = {
  Enable: Buffer.from('a01f', 'hex'),
  Disable: Buffer.from('c01f', 'hex'),
};

const timeout = (timeoutValue, promiseFuncs) => {
  const promises = [new Promise(promiseFuncs)];
  if (timeoutValue > 0) {
    promises.push(
      new Promise((resolve, reject) => {
        setTimeout(() => reject(new Error('timeout')), timeoutValue);
      }),
    );
  }
  return Promise.race(promises);
};

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
    peripheral.on('connect', (error) => {
      if (error) {
        serviceHelper.log('trace', 'miflora-device', `Error while connecting to device: ${error}`);
      } else {
        serviceHelper.log('trace', 'miflora-device', `Connected to device ${this.address}`);
        this.isConnected = true;
      }
    });
    peripheral.on('disconnect', (error) => {
      if (error) {
        serviceHelper.log('trace', 'miflora-device', `Error while disconnecting to device: ${error}`);
      } else {
        serviceHelper.log('trace', 'miflora-device', `Disconnected from device ${this.address}`);
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
    return timeout(10000, (resolve, reject) => {
      if (this.peripheral.state === 'connected') return resolve();
      this.peripheral.once('connect', async () => {
        try {
          await this.resolveCharacteristics();
          return resolve();
        } catch (error) {
          return reject(error);
        }
      });
      serviceHelper.log('trace', 'miflora-device', 'Initiating connection');
      this.peripheral.connect();
    });
  }

  /**
   * Disconnects from the device
   * @public
   * @returns {Promise} Promise for disconnection process
   */
  disconnect() {
    return timeout(10000, (resolve, reject) => {
      if (this.peripheral.state === 'disconnected') {
        return resolve();
      }
      this.peripheral.once('disconnect', async () => {
        try {
          return resolve();
        } catch (error) {
          return reject(error);
        }
      });
      serviceHelper.log('trace', 'miflora-device', 'Closing connection');
      this.peripheral.disconnect();
    });
  }

  queryFirmwareInfo(plain = false) {
    return timeout(10000, async (resolve, reject) => {
      serviceHelper.log('trace', 'miflora-device', 'Querying firmware information');
      try {
        await this.connect();
        const data = await this.readCharacteristic(this.firmwareCharacteristic);
        const response = this.responseTemplate;
        response.firmwareInfo = {
          battery: data.readUInt8(0),
          firmware: data.toString('ascii', 2, data.length),
        };
        serviceHelper.log('trace', 'miflora-device', `Successfully queried firmware information: ${response.firmwareInfo}`);
        resolve(plain ? response.firmwareInfo : response);
      } catch (err) {
        reject(err);
      }
    });
  }

  querySensorValues(plain = false) {
    return timeout(10000, async (resolve, reject) => {
      serviceHelper.log('trace', 'miflora-device', 'Querying sensor information');
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
        serviceHelper.log('trace', 'miflora-device', `Successfully queried sensor information: ${response.sensorValues}`);
        return resolve(plain ? response.sensorValues : response);
      } catch (error) {
        return reject(error);
      }
    });
  }

  querySerial(plain = false) {
    return timeout(10000, async (resolve, reject) => {
      serviceHelper.log('trace', 'miflora-device', 'Querying serial number');
      try {
        await this.connect();
        await this.setDeviceMode(MODE_BUFFER_SERIAL);
        const data = await this.readCharacteristic(this.dataCharacteristic);
        const response = this.responseTemplate;
        response.serial = data.toString('hex');
        serviceHelper.log('trace', 'miflora-device', `Successfully queried serial number: ${response.serial}`);
        return resolve(plain ? response.serial : response);
      } catch (error) {
        return reject(error);
      }
    });
  }

  query() {
    return timeout(10000, async (resolve, reject) => {
      serviceHelper.log('trace', 'miflora-device', 'Querying multiple information');
      try {
        const result = this.responseTemplate;
        result.firmwareInfo = await this.queryFirmwareInfo(true);
        result.sensorValues = await this.querySensorValues(true);
        serviceHelper.log('trace', 'miflora-device', 'Successfully queried multiple information');
        return resolve(result);
      } catch (error) {
        return reject(error);
      }
    });
  }

  /**
   * @private
   * @param {ByteBuffer} buffer Bytes to write
   */
  setDeviceMode(buffer) {
    return timeout(10000, async (resolve, reject) => {
      try {
        serviceHelper.log('trace', 'miflora-device', 'Changing device mode');
        await this.writeCharacteristic(this.modeCharacteristic, buffer);
        const data = await this.readCharacteristic(this.modeCharacteristic);
        if (data.equals(buffer)) {
          serviceHelper.log('trace', 'miflora-device', 'Successfully changed device mode');
          return resolve(data);
        }
        return reject(new Error('Failed to change mode'));
      } catch (err) {
        return reject(err);
      }
    });
  }

  /**
   * @private
   */
  setRealtimeDataMode(enable) {
    return timeout(10000, async (resolve, reject) => {
      try {
        serviceHelper.log('trace', 'miflora-device', `${enable ? 'enabling' : 'disabling'} realtime data mode`);
        const buffer = enable ? MODE_BUFFER_REALTIME.Enable : MODE_BUFFER_REALTIME.Disable;
        return resolve(await this.setDeviceMode(buffer));
      } catch (err) {
        return reject(err);
      }
    });
  }

  resolveCharacteristics() {
    return timeout(10004, async (resolve, reject) => {
      try {
        serviceHelper.log('trace', 'miflora-device', 'Resolving characteristic');
        this.peripheral.discoverAllServicesAndCharacteristics((error, services, characteristics) => {
          if (error) return reject(error);
          serviceHelper.log('trace', 'miflora-device', `Successfully resolved characteristics ${services.length} ${characteristics.length}`);
          this.service = this.peripheral.services.find(entry => entry.uuid === UUID_SERVICE_DATA);
          this.firmwareCharacteristic = this.service.characteristics.find(entry => entry.uuid === UUID_CHARACTERISTIC_FIRMWARE);
          this.modeCharacteristic = this.service.characteristics.find(entry => entry.uuid === UUID_CHARACTERISTIC_MODE);
          this.dataCharacteristic = this.service.characteristics.find(entry => entry.uuid === UUID_CHARACTERISTIC_DATA);
          return resolve();
        });
      } catch (error) {
        return reject(error);
      }
    });
  }

  /**
   * @private
   */
  readCharacteristic(characteristic) {
    this.returnValue = timeout(10000, async (resolve, reject) => {
      try {
        characteristic.read((error, data) => {
          if (error) return reject(error);
          serviceHelper.log('trace', 'miflora-device', `Successfully read value ${data.toString('hex').toUpperCase()} from characteristic ${characteristic.uuid.toUpperCase()}`);
          return resolve(data);
        });
      } catch (error) {
        return reject(error);
      }
    });
    return this.returnValue;
  }

  /**
   * @private
   */
  writeCharacteristic(characteristic, data) {
    this.returnValue = timeout(10000, async (resolve, reject) => {
      try {
        characteristic.write(data, false, (error) => {
          if (error) return reject(error);
          serviceHelper.log('trace', 'miflora-device', `Successfully wrote value ${data.toString('hex').toUpperCase()} from characteristic ${characteristic.uuid.toUpperCase()}`);
          return resolve();
        });
      } catch (error) {
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
      const dataItem = peripheral.advertisement.serviceData.find(item => item.uuid === UUID_SERVICE_XIAOMI);
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
  }

  static normaliseAddress(address) {
    return address.replace(/-/g, ':').toLowerCase();
  }
}

module.exports = MiFloraDevice;
