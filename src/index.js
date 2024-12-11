 const bleno = require('@abandonware/bleno');

const SERVICE_UUID = '12345678-1234-5678-1234-56789ABCDEF0';
const CHARACTERISTIC_UUID = '12345678-1234-5678-1234-56789ABCDEF1';

class TextCharacteristic extends bleno.Characteristic {
  constructor() {
    super({
      uuid: CHARACTERISTIC_UUID,
      properties: ['notify', 'write', 'read'],
      value: null
    });
    
    this._value = Buffer.from('Initial message', 'utf-8');
    this._updateValueCallback = null;
  }

  onWriteRequest(data, offset, withoutResponse, callback) {
    if (offset) {
      console.log('Write request with offset, rejecting');
      callback(this.RESULT_ATTR_NOT_LONG);
      return;
    }

    this._value = data;
    const message = data.toString('utf-8');
    console.log(`[WRITE] Received message: ${message}`);

    if (this._updateValueCallback) {
      console.log('[NOTIFY] Notifying subscribers');
      this._updateValueCallback(this._value);
    }

    callback(this.RESULT_SUCCESS);
  }

  onReadRequest(offset, callback) {
    console.log(`[READ] Current value: ${this._value.toString('utf-8')}`);
    callback(this.RESULT_SUCCESS, this._value);
  }

  onSubscribe(maxValueSize, updateValueCallback) {
    console.log(`[SUBSCRIBE] Device subscribed. Max value size: ${maxValueSize}`);
    this._updateValueCallback = updateValueCallback;
  }

  onUnsubscribe() {
    console.log('[UNSUBSCRIBE] Device unsubscribed');
    this._updateValueCallback = null;
  }
}

class BLEServer {
  constructor() {
    this.textCharacteristic = new TextCharacteristic();

    bleno.on('stateChange', async (state) => {
      console.log(`[BLE STATE] Bluetooth state changed to: ${state}`);
      if (state === 'poweredOn') {
        console.log('[ADVERTISING] Starting advertisement');
        await bleno.startAdvertising('NodeBLEServer', [SERVICE_UUID]);
      } else {
        console.log('[ADVERTISING] Stopping advertisement');
        await bleno.stopAdvertising();
      }
    });

    bleno.on('advertisingStart', (error) => {
      if (error) {
        console.error(`[ADVERTISING] Failed to start: ${error}`);
        return;
      }
      
      console.log('[ADVERTISING] Successfully started');
      bleno.setServices([
        new bleno.PrimaryService({
          uuid: SERVICE_UUID,
          characteristics: [this.textCharacteristic]
        })
      ]);
    });
  }

  sendMessage(message) {
    console.log(`[SEND] Attempting to send message: ${message}`);
    const buffer = Buffer.from(message, 'utf-8');
    if (this.textCharacteristic._updateValueCallback) {
      console.log('[SEND] Message sent to subscribers');
      this.textCharacteristic._updateValueCallback(buffer);
    } else {
      console.log('[SEND] No subscribers, message not sent');
    }
  }
}

const bleServer = new BLEServer();

// Send message every 10 seconds
setInterval(() => {
  const message = `Server info: ${new Date().toISOString()} - System running \n
  The rapid advancement of technology has transformed the way we live, work, and communicate. From smartphones to artificial intelligence, innovations continue to shape our world, offering both opportunities and challenges`;
  bleServer.sendMessage(message);
}, 10000); 

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('[SHUTDOWN] Stopping BLE advertisement and exiting');
  bleno.stopAdvertising();
  bleno.disconnect();
  process.exit();
});


