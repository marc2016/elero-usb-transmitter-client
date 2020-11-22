import * as SerialPort from 'serialport'
import * as _ from 'lodash'
import {
  BYTE_HEADER,
  BYTE_LENGTH_2,
  RESPONSE_LENGTH_CHECK,
  RESPONSE_LENGTH_SEND,
  BYTE_LENGTH_5,
  RESPONSE_LENGTH_INFO,
  BYTE_LENGTH_4,
} from './domain/constants'
import { Response } from './model/Response'
import { ControlCommand, EasyCommand, InfoData } from './domain/enums'
import { Mutex } from 'async-mutex'

const DEFAULT_BAUDRATE = 38400
const DEFAULT_BYTESIZE = 8
const DEFAULT_PARITY = 'none'
const DEFAULT_STOPBITS = 1

const mutex = new Mutex()

export class UsbTransmitterClient {
  serialPort: SerialPort

  constructor(devPath: string) {
    this.serialPort = new SerialPort(devPath, {
      baudRate: DEFAULT_BAUDRATE,
      dataBits: DEFAULT_BYTESIZE,
      parity: DEFAULT_PARITY,
      stopBits: DEFAULT_STOPBITS,
      autoOpen: false,
    })
  }

  public open(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.serialPort.isOpen) {
        this.serialPort.open((error) => {
          if (error) reject(error)
          this.serialPort.flush((error) => {
            if (error) reject(error)
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
    const data = [BYTE_HEADER, BYTE_LENGTH_2, EasyCommand.EASY_CHECK]
    const release = await mutex.acquire()
    await this.sendCommand(data)
    return new Promise((resolve, reject) => {
      const that = this
      this.serialPort.once('readable', function () {
        const responseBytes = that.readResponseBytes(RESPONSE_LENGTH_CHECK)
        if (responseBytes == null) {
          reject('responseBytes are null.')
        }
        const response = that.parseResponse(responseBytes as Buffer)
        release()
        resolve(response.activeChannels)
      })
    })
  }

  public async getInfo(channel: number): Promise<Response> {
    let lowChannels = (1 << (channel - 1)) & 0xff
    let highChannels = (1 << (channel - 1)) >> 8

    const data = [
      BYTE_HEADER,
      BYTE_LENGTH_4,
      EasyCommand.EASY_INFO,
      highChannels,
      lowChannels,
    ]
    const release = await mutex.acquire()
    await this.sendCommand(data)
    return new Promise((resolve, reject) => {
      const that = this
      this.serialPort.once('readable', function () {
        const responseBytes = that.readResponseBytes(RESPONSE_LENGTH_INFO)
        if (responseBytes == null) {
          reject('responseBytes are null.')
        }
        const response = that.parseResponse(responseBytes as Buffer)
        release()
        return resolve(response)
      })
    })
  }

  public async sendControlCommand(
    channel: number,
    controlCommand: ControlCommand
  ): Promise<Response> {
    let lowChannels = (1 << (channel - 1)) & 0xff
    let highChannels = (1 << (channel - 1)) >> 8

    const data = [
      BYTE_HEADER,
      BYTE_LENGTH_5,
      EasyCommand.EASY_SEND,
      highChannels,
      lowChannels,
      controlCommand,
    ]
    const release = await mutex.acquire()
    await this.sendCommand(data)
    return new Promise((resolve, reject) => {
      const that = this
      this.serialPort.once('readable', function () {
        const responseBytes = that.readResponseBytes(RESPONSE_LENGTH_INFO)
        if (responseBytes == null) {
          reject('responseBytes are null.')
        }
        const response = that.parseResponse(responseBytes as Buffer)
        release()
        return resolve(response)
      })
    })
  }

  private sendCommand(data: number[]): Promise<number> {
    const checksum = this.calculateChecksum(data)
    data.push(checksum)

    return new Promise((resolve, reject) => {
      this.serialPort.flush((error) => {
        if (error) reject(error)
        this.serialPort.write(data, (error, bytesWritten: number) => {
          if (error) reject(error)
          resolve(bytesWritten)
        })
      })
    })
  }

  private readResponseBytes(length: number): string | Buffer | null {
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
      status: null,
      statusCode: -1,
    }
    if (bytes.length == RESPONSE_LENGTH_CHECK) {
      response.checksum = bytes[5]
      //Easy Ack (the answer on Easy Info)
    } else if (bytes.length == RESPONSE_LENGTH_SEND) {
      if (bytes[5] in InfoData) {
        response.status = bytes[5] as InfoData
      } else {
        response.status = InfoData.INFO_UNKNOWN
      }
      response.checksum = bytes[6]
    } else {
      response.status = InfoData.INFO_UNKNOWN
    }
    return response
  }
}
