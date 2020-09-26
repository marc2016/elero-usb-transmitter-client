# elero-usb-transmitter-client

[![npm version](https://img.shields.io/npm/v/elero-usb-transmitter-client.svg?style=flat-square)](https://www.npmjs.com/package/elero-usb-transmitter-client)
[![build status](https://img.shields.io/travis/marc2016/elero-usb-transmitter-client/master.svg?style=flat-square)](https://travis-ci.org/github/marc2016/elero-usb-transmitter-client)

Elero USB Transmitter Client for node.js to send commands to Elero USB Stick and receive information. This libaray needs Elero Transmitter Stick (https://www.der-sonnenschutz-shop.de/elero-221250001-centero-transmitter-stick.html).

## Features

- send commands to control shutters
- get current state of shutters

## Installing

Using npm:

```bash
$ npm install elero-usb-transmitter-client
```

## Example

### Initialize

```js
import { UsbTransmitterClient } from 'elero-usb-transmitter-client'

const client = new UsbTransmitterClient('/dev/ttyUSB0')
```

Creats a new client object. You have to use the path to the device as a parameter. Type npx @serialport/list in command line to get a list of serial devices.

### Get information

```js
import { UsbTransmitterClient } from "../src/UsbTransmitterClient"

//open connection to device
await client.open()
//get info of channel 1
const response = await client.getInfo(1)
console.log(response)
//close connection if it is not needed anymore
await client.close()
```

### Writable properties of device

```js
import { UsbTransmitterClient } from "../src/UsbTransmitterClient"
import { ControlCommand } from "../src/domain/enums"

await client.open()
//move shutters on channel 1 down
const response = await client.sendControlCommand(1, ControlCommand.down)
console.log(response)
await client.close()
```

## License

[MIT](LICENSE)
