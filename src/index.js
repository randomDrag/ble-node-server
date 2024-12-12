const bleno = require('@abandonware/bleno');
const fs = require('fs');
const path = require('path');

// Custom Service and Characteristic UUIDs
const SERVICE_UUID = '12345678-1234-5678-1234-56789abcdef0';
const CHARACTERISTIC_UUID = '12345678-1234-5678-1234-56789abcdef1';

 const SENSOR_SERVICE_UUID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const SENSOR_CHARACTERISTIC_UUID = 'b2c3d4e5-f6a1-890b-cdef-1234567890ab';

// Create a custom characteristic for file transfer
class FileTransferCharacteristic extends bleno.Characteristic {
  constructor(filePath) {
    super({
      uuid: CHARACTERISTIC_UUID,
      properties: ['read', 'notify', 'write'],
      value: null,
    });

    this._filePath = filePath;
    this._fileBuffer = null;
    this._chunks = [];
    this._currentChunkIndex = 0;
    this._updateValueCallback = null;
  }

  // Prepare the file for streaming
  loadFile() {
    if (!fs.existsSync(this._filePath)) {
      console.error('File not found:', this._filePath);
      return false;
    }

    try {
      this._fileBuffer = fs.readFileSync(this._filePath);
      console.log(`Loaded file (${this._fileBuffer.length} bytes):`, this._filePath);
      return true;
    } catch (error) {
      console.error('Error loading file:', error);
      return false;
    }
  }

  // Handler for read requests
  onReadRequest(offset, callback) {
    console.log('Read request received');
    callback(this.RESULT_SUCCESS, Buffer.from('File Transfer Service Ready'));
  }

  // Handler for subscribe notifications
  onSubscribe(maxValueSize, updateValueCallback) {
    console.log('Client subscribed to notifications');
  
    if (typeof updateValueCallback !== 'function') {
      console.error('Invalid updateValueCallback provided');
      return;
    }
    this._updateValueCallback = updateValueCallback;
  
    if (this.loadFile()) {
      if (!this._fileBuffer || this._fileBuffer.length === 0) {
        console.error('File buffer is empty or undefined');
        return;
      }
  
      // Split the file into chunks
      this._chunks = [];
  
      console.log('File Buffer Length:', this._fileBuffer.length);
      this._chunks.push(Buffer.from(`${this._fileBuffer.length}`)); // Add file length as the first "chunk"
  
      for (let i = 0; i < this._fileBuffer.length; i += maxValueSize - 1) {
        this._chunks.push(this._fileBuffer.subarray(i, i + maxValueSize - 1));
      }
  
      console.log(`File split into ${this._chunks.length} chunks`);
      this._currentChunkIndex = 0;
  
      this.sendNextChunk();
    } else {
      console.error('Failed to load the file');
    }
  }
  
  // Send the next chunk
  sendNextChunk() {
    if (!this._updateValueCallback || this._currentChunkIndex >= this._chunks.length) {
      console.log('All chunks sent or no client subscribed');
      this.resetStream();
      return;
    }

    const chunk = this._chunks[this._currentChunkIndex];
    console.log(`Sending chunk ${this._currentChunkIndex + 1}/${this._chunks.length}`);
    this._updateValueCallback(chunk);
    this._currentChunkIndex++;
  }

  // Handler for unsubscribe
  onUnsubscribe() {
    console.log('Client unsubscribed');
    this.resetStream();
  }

  // Reset the streaming state
  resetStream() {
    this._chunks = [];
    this._currentChunkIndex = 0;
    this._updateValueCallback = null;
    console.log('Stream reset');
  }

  // Handler for write requests to acknowledge receipt
  onWriteRequest(data, offset, withoutResponse, callback) {
    const message = data.toString();
    console.log('Write request received:', message);

    if (message === 'ACK') {
      console.log('Acknowledgment received for chunk', this._currentChunkIndex);
      this.sendNextChunk();
    }

    callback(this.RESULT_SUCCESS);
  }
}

// Create a custom service
class FileTransferService extends bleno.PrimaryService {
  constructor(characteristic) {
    super({
      uuid: SERVICE_UUID,
      characteristics: [characteristic],
    });
  }
}


// Simulate sensor data
const getSensorData = () => {
  const temperature = (20 + Math.random() * 10).toFixed(2);
  const humidity = (40 + Math.random() * 20).toFixed(2);
  return JSON.stringify({ temperature, humidity });
};

class SensorService extends bleno.PrimaryService {
  constructor(characteristic) {
    super({
      uuid: SENSOR_SERVICE_UUID,
      characteristics: [characteristic],
    });
  }
}

class SensorDataCharacteristic extends bleno.Characteristic {
  constructor() {
    super({
      uuid: SENSOR_CHARACTERISTIC_UUID,
      properties: ['notify'],
      value: null,
    });

    this._updateValueCallback = null;
  }

  onSubscribe(maxValueSize, updateValueCallback) {
    console.log('Client subscribed to sensor data');
    this._updateValueCallback = updateValueCallback;

    this._interval = setInterval(() => {
      if (this._updateValueCallback) {
        const sensorData = getSensorData();
        console.log('Sending sensor data:', sensorData);
        this._updateValueCallback(Buffer.from(sensorData));
      }
    }, 1000); // Send data every second
  }

  onUnsubscribe() {
    console.log('Client unsubscribed from sensor data');
    clearInterval(this._interval);
    this._updateValueCallback = null;
  }
}

// Set up Bleno
const setupBleno = (filePath) => {
  const fileTransferCharacteristic = new FileTransferCharacteristic(filePath);
  const fileTransferService = new FileTransferService(fileTransferCharacteristic);

   const sensorDataCharacteristic = new SensorDataCharacteristic();
  const sensorService = new SensorService(sensorDataCharacteristic);

  bleno.on('stateChange', async (state) => {
    console.log('Bleno state changed to:', state);

    if (state === 'poweredOn') {
      try {
        await bleno.startAdvertising('FileTransferPeripheral', [SERVICE_UUID , SENSOR_SERVICE_UUID]);
      } catch (error) {
        console.error('Advertising start error:', error);
      }
    } else {
      try {
        await bleno.stopAdvertising();
      } catch (error) {
        console.error('Stop advertising error:', error);
      }
    }
  });

  bleno.on('advertisingStart', (error) => {
    if (error) {
      console.error('Advertising start error:', error);
      return;
    }

    console.log('Advertising started');
    bleno.setServices([fileTransferService , sensorService]);
  });

  bleno.on('advertisingStop', () => {
    console.log('Advertising stopped');
  });

  bleno.on('error', (error) => {
    console.error('Bleno error:', error);
  });

  console.log('BLE File Transfer Server initialized');
};

// Provide the file path here
const filePath = path.resolve(__dirname, '../files/sample.pdf');
setupBleno(filePath);
