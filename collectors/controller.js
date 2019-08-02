/**
 * Import external libraries
 */
const { fork } = require('child_process');

/**
 * Import helper libraries
 */
const serviceHelper = require('../lib/helper.js');

const timerInterval = 5 * 60 * 1000; // 5 minutes

exports.processFlowerCareDevices = function fnProcessFlowerCareDevices() {
  try {
    // Restart BLE adaptor
    serviceHelper.log('trace', 'Power-down bluetooth adapter');
    fork('hciconfig hci0 down');
    serviceHelper.log('trace', 'Power-up bluetooth adapter');
    fork('hciconfig hci0 up');

    serviceHelper.log('trace', 'Starting new client process');
    const childProcess = fork('./collectors/flowercare/flowercare.js');
    childProcess.on('message', (message) => {
      serviceHelper.log('trace', message);
    });

    childProcess.once('close', () => {
      serviceHelper.log('trace', 'Child process complete');
    });
  } catch (err) {
    serviceHelper.log('error', err.message);
  }
  setTimeout(() => {
    fnProcessFlowerCareDevices();
  }, timerInterval);
};
