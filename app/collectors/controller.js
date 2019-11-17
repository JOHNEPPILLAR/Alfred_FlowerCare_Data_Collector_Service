/**
 * Import external libraries
 */
const serviceHelper = require('alfred-helper');

/**
 * Import helper libraries
 */
const flowerCare = require('../collectors/flowercare/flowercare.js');

const timerInterval = 5 * 60 * 1000; // 5 minutes

exports.processFlowerCareDevices = async function fnProcessFlowerCareDevices() {
  try {
    await flowerCare.getFlowerCareDevices();
  } catch (err) {
    serviceHelper.log('error', err.message);
  }
  setTimeout(() => {
    fnProcessFlowerCareDevices();
  }, timerInterval);
};
