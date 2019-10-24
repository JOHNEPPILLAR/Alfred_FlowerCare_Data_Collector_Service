/**
 * Import external libraries
 */
const { fork, exec } = require('child_process');

/**
 * Import helper libraries
 */
const serviceHelper = require('alfred-helper');

const timerInterval = 5 * 60 * 1000; // 5 minutes

exports.processFlowerCareDevices = async function fnProcessFlowerCareDevices() {
  try {
    // Restart BLE adaptor
    serviceHelper.log('trace', 'Power-down bluetooth adapter');
    await exec('hciconfig hci0 down', (err, stdout, stderr) => {
      if (err) serviceHelper.log('error', 'node couldn\'t execute the hciconfig hci0 down command');
      serviceHelper.log('trace', `stdout: ${stdout}`);
      serviceHelper.log('trace', `stderr: ${stderr}`);
    });

    serviceHelper.log('trace', 'Power-up bluetooth adapter');
    await exec('hciconfig hci0 up', (err, stdout, stderr) => {
      if (err) serviceHelper.log('error', 'node couldn\'t execute the hciconfig hci0 up command');
      serviceHelper.log('trace', `stdout: ${stdout}`);
      serviceHelper.log('trace', `stderr: ${stderr}`);
    });

    serviceHelper.log('trace', 'Starting new client process');
    const childProcess = fork('./app/collectors/flowercare/flowercare.js');
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
