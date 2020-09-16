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
  BYTE_LENGTH_5,
  COMMAND_INFO,
  RESPONSE_LENGTH_INFO,
  BYTE_LENGTH_4,
} from './domain/constants'
import { Response } from './model/Response'
import { promisify } from 'util'
import { resolve } from 'path'
import { reject } from 'lodash'

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
      autoOpen: false
    })
  }

  public open(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.serialPort.isOpen) {
        this.serialPort.open((error) => {
          if (error) reject(error);
          this.serialPort.flush((error) => {
            if (error) reject(error);
            resolve()
          })
        })
      }
    })
  }

  public close(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.serialPort.close((error) => {
        if (error) reject(error)
        resolve()
      })
    })
  }

  public async checkChannels(): Promise<number[]> {
    const data = [BYTE_HEADER, BYTE_LENGTH_2, COMMAND_CHECK]
    await this.sendCommand(data)
    return new Promise((resolve, reject) => {
      const that = this
      this.serialPort.once('readable', function () {
        const responseBytes = that.readResponseBytes(RESPONSE_LENGTH_CHECK, 0)
        const response = that.parseResponse(responseBytes as Buffer)
        resolve(response.activeChannels)
      })
    })
  }

  public async getInfo(channel: number): Promise<Response> {

    let lowChannels = (1 << (channel - 1)) & 0xFF
    let highChannels = 1 << (channel - 1) >> 8

    const data = [BYTE_HEADER, BYTE_LENGTH_4, COMMAND_INFO, highChannels, lowChannels]
    await this.sendCommand(data)
    return new Promise((resolve, reject) => {
      const that = this
      this.serialPort.once('readable', function () {
        const responseBytes = that.readResponseBytes(RESPONSE_LENGTH_INFO, 0)
        const response = that.parseResponse(responseBytes as Buffer)
        return resolve(response)
      })
    })
  }

  private sendCommand(data: number[]): Promise<number> {
    const checksum = this.calculateChecksum(data)
    data.push(checksum)

    return new Promise((resolve, reject) => {
      this.serialPort.write(data, (error, bytesWritten: number) => {
        if (error) reject(error)
        resolve(bytesWritten)
      })
    })
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
}
