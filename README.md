# elero-usb-transmitter-client

[![npm version](https://img.shields.io/npm/v/elero-usb-transmitter-client.svg?style=flat-square)](https://www.npmjs.com/package/elero-usb-transmitter-client)
[![Node.js CI](https://github.com/marc2016/elero-usb-transmitter-client/actions/workflows/nodejs.yml/badge.svg)](https://github.com/marc2016/elero-usb-transmitter-client/actions/workflows/nodejs.yml)


Elero USB Transmitter Client for node.js to send commands to Elero USB Stick and receive information. This libaray needs Elero Transmitter Stick (https://www.der-sonnenschutz-shop.de/elero-221250001-centero-transmitter-stick.html).

## Features

- send commands to control shutters
- get current state of shutters

## Installing

Using npm:

```bash
$ npm install elero-usb-transmitter-client
```

## CLI Usage

You can use the interactive CLI to control the transmitter directly.

### Installation

**Globally (if published to npm):**
```bash
npm install -g elero-usb-transmitter-client
elero-cli
```

**Via npx (if published to npm):**
```bash
npx elero-usb-transmitter-client
```

**From Source (Development):**
1. Clone the repository
2. Install dependencies: `npm install`
3. Build the project: `npm run build`
4. Link command: `npm link`
5. Run: `elero-cli`

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

## Status Values

The `status` property in the response object (from `getInfo` or `sendControlCommand`) returns one of the following values (defined in `InfoData` enum):

| Value | Description |
|---|---|
| `-1` | Unknown |
| `0x00` | No Information |
| `0x01` | Top Position (Stop) |
| `0x02` | Bottom Position (Stop) |
| `0x03` | Intermediate Position (Stop) |
| `0x04` | Tilt / Ventilation Position (Stop) |
| `0x05` | Blocking |
| `0x06` | Overheated |
| `0x07` | Timeout |
| `0x08` | Start to Move Up |
| `0x09` | Start to Move Down |
| `0x0a` | Moving Up |
| `0x0b` | Moving Down |
| `0x0d` | Stopped in Undefined Position |
| `0x0e` | Top Position (Stop) with Tilt Position |
| `0x0f` | Bottom Position (Stop) with Intermediate Position |
| `0x10` | Switching Device Switched Off |
| `0x11` | Switching Device Switched On |

## Changelog

### 1.2.0

- Major update of dependencies (TypeScript 5.x, Jest 29.x, ESLint 9.x)
- Switched to ESLint flat config (`eslint.config.mjs`)
- Moved to `prettier` 3.x

### 1.1.4

- Added `prepublishOnly` script to ensure fresh build before publish
- Explicitly added `dist` to `files` list in `package.json`

### 1.1.3

- Moved `commander` and `inquirer` to `dependencies` (fix runtime error)

### 1.1.2

- Fix CLI entry point name in `package.json`

### 1.1.1

- Fixed `responseBytes are null` error by handling fragmented serial packets
- Added detailed unit tests with mocks

### 1.1.0

- Added interactive CLI (`elero-cli`)
- Added `inquirer` and `commander` dependencies

### 1.0.6

- Updated `serialport` dependency
- Fixed errors in response handling

### 1.0.5

- Improved mutex handling (release added)

### 1.0.4

- Fixed promise rejection logic
- Added null checks for response bytes

### 1.0.0

- Initial release with `getInfo`, `sendControlCommand`, and `checkChannels`
- Implemented `UsbTransmitterClient`


## License

[MIT](LICENSE)
