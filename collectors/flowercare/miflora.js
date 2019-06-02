/**
 * Import external libraries
 */
const noble = require('@abandonware/noble');
/**
 * Import helper libraries
 */
const MiFloraDevice = require('./miflora-device.js');
const serviceHelper = require('../../lib/helper.js');

const UUID_SERVICE_XIAOMI = 'fe95';

class MiFlora {
  constructor() {
    this.devices = {};
    noble.on('stateChange', (state) => {
      serviceHelper.log('trace', `Adapter changed to ${state}`);
      if (state !== 'poweredOn') {
        noble.stopScanning();
      }
    });
    noble.once('scanStart', () => {
      serviceHelper.log('trace', 'Discovery started');
    });
    noble.once('scanStop', () => {
      serviceHelper.log('trace', 'Discovery stopped and removing listeners');
      this.removeListeners();
    });
  }

  /**
   * Start the discovery process
   * @public
   * @param {object} options - Discovery options
   * @return {Promise} A Promise which resolves with an array of MiFloraDevice
   */
  discover() {
    return new Promise(async (resolve, reject) => {
      try {
        await this.ensurePowerOnState();
        await this.startScan();
        await this.stopScan();
        return resolve(Object.values(this.devices));
      } catch (error) {
        return reject(error);
      }
    });
  }

  /**
   * Returns a Promise which resolves when the adapter is ready
   * @private
   */
  ensurePowerOnState() {
    // eslint-disable-next-line consistent-return
    this.returnVal = new Promise(async (resolve) => {
      if (noble.state === 'poweredOn') return resolve();
      serviceHelper.log('trace', 'Waiting for adapter state change');
      // eslint-disable-next-line consistent-return
      noble.on('stateChange', (state) => {
        if (state === 'poweredOn') return resolve();
      });
    });
    return this.returnVal;
  }

  /**
   * @private
   */
  startScan() {
    return new Promise((resolve, reject) => {
      const duration = 30000; // 30 seconds

      serviceHelper.log('trace', `Starting discovery with ${duration}ms duration`);

      setTimeout(() => {
        serviceHelper.log('trace', 'Duration reached, stopping discovery');
        return resolve();
      }, duration);

      noble.on('discover', (peripheral) => {
        const deviceAddress = MiFloraDevice.normaliseAddress(peripheral.address);
        const exisitingDevice = this.devices[deviceAddress];
        if (!exisitingDevice) {
          const newDevice = MiFloraDevice.from(peripheral);
          if (newDevice) {
            this.devices[deviceAddress] = newDevice;
            serviceHelper.log('trace', `Discovered ${newDevice.type} @ ${newDevice.address}`);
          }
        }
      });

      noble.startScanning([UUID_SERVICE_XIAOMI], true, (err) => {
        if (err) {
          serviceHelper.log('error', err.message);
          reject(err);
        }
      });
    });
  }

  /**
   * @private
   */
  removeListeners() {
    this.returnVal = new Promise((resolve) => {
      noble.removeAllListeners('discover');
      noble.removeAllListeners('stateChange');
      resolve();
    });
    return this.returnVal;
  }

  /**
   * @private
   */
  stopScan() {
    this.returnVal = new Promise((resolve) => {
      noble.stopScanning(() => resolve());
    });
    return this.returnVal;
  }
}

module.exports = new MiFlora();
