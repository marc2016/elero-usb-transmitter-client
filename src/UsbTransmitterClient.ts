import * as SerialPort from 'serialport'
import * as _ from 'lodash'
import {
  BYTE_HEADER,
  BYTE_LENGTH_2,
  COMMAND_CHECK,
  RESPONSE_LENGTH_CHECK,
  RESPONSE_LENGTH_SEND,
  INFO,
  INFO_UNKNOWN,
} from './domain/constants'
import { Response } from './model/Response'

const DEFAULT_BAUDRATE = 38400
const DEFAULT_BYTESIZE = 8
const DEFAULT_PARITY = 'none'
const DEFAULT_STOPBITS = 1

export class UsbTransmitterClient {
  serialPort: SerialPort

  constructor(devPath: string) {
    this.serialPort = new SerialPort(devPath, {
      baudRate: DEFAULT_BAUDRATE,
      dataBits: DEFAULT_BYTESIZE,
      parity: DEFAULT_PARITY,
      stopBits: DEFAULT_STOPBITS,
    })
    this.serialPort.open()
  }

  public checkChannels(): number[] {
    const data = [BYTE_HEADER, BYTE_LENGTH_2, COMMAND_CHECK]
    this.sendCommand(data)
    const responseBytes = this.readResponseBytes(RESPONSE_LENGTH_CHECK, 0)
    const response = this.parseResponse(responseBytes as Buffer)
    return response.activeChannels
  }

  private sendCommand(data: number[]) {
    const checksum = this.calculateChecksum(data)
    data.push(checksum)
    const bytes = this.createSerialData(data)
    this.serialPort.write(bytes)
  }

  private readResponseBytes(
    length: number,
    channel: number
  ): string | Buffer | null {
    //Get the serial data from the serial port.
    var response = this.serialPort.read(length)
    return response
  }

  private calculateChecksum(data: number[]): number {
    //Calculate checksum.
    //All the sum of all bytes (Header to CS) must be 0x00.
    const sum = _.sum(data)
    const result = (256 - sum) % 256
    return result
  }

  private createSerialData(data: number[]): Buffer {
    const bytes = Buffer.from(data)
    return bytes
  }

  private getActiveChannels(byte: number, start: number): number[] {
    var channels: number[] = new Array()
    for (let i = 0; i < 9; i++) {
      if (((byte >> i) & 1) == 1) {
        const channel = i + start
        channels.push(channel)
      }
    }
    return channels
  }

  private parseResponse(bytes: Buffer): Response {
    const activeHighChannels = this.getActiveChannels(bytes[3], 9)
    const activeLowChannels = this.getActiveChannels(bytes[4], 1)
    const activeChannels = _.concat(activeLowChannels, activeHighChannels)
    const response: Response = {
      header: bytes[0],
      length: bytes[1],
      command: bytes[2],
      activeChannels: activeChannels,
      checksum: -1,
      status: '',
      statusCode: -1,
    }
    if (bytes.length == RESPONSE_LENGTH_CHECK) {
      response.checksum = bytes[5]
      //Easy Ack (the answer on Easy Info)
    } else if (bytes.length == RESPONSE_LENGTH_SEND) {
      if (bytes[5] in INFO) {
        const tmp = bytes[5]
        response.status = INFO[bytes[5]]
      } else {
        response.status = INFO_UNKNOWN
      }
      response.checksum = bytes[6]
    } else {
      response['status'] = INFO_UNKNOWN
    }
    return response
  }
  //   var resp_length = ser_resp.length();
  // 	//Common parts
  // 	response['header'] = ser_resp[0];
  // 	response['length'] = ser_resp[1];
  // 	response['command'] = ser_resp[2];
  // 	response['ch_h'] = this._get_upper_channel_bits(ser_resp[3]);
  // 	response['ch_l'] = this._get_lower_channel_bits(ser_resp[4]);
  // 	response['chs'] = new Set(response['ch_h'] + response['ch_l']);
  // }

  // private sendCommand(int_list, channel) {
  //   //Write out a command to the serial port.
  //   int_list.append(this._calculate_checksum(int_list))
  //   var bytes_data = this._create_serial_data(int_list)
  //   this._adapter.log.debug(
  //     "Elero - transmitter: '" +
  //       this._serial_number +
  //       "' ch: '" +
  //       channel +
  //       "' serial command: '" +
  //       bytes_data +
  //       "'."
  //   )
  //   if (!this._serial.isOpen()) {
  //     this._serial.open()
  //   }
  //   this._serial.write(bytes_data)
  // }
}
