import { SerialPort } from 'serialport'
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
  serialPort: SerialPort<any>

  constructor(devPath: string) {
    this.serialPort = new SerialPort({
      path: devPath,
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
    try {
      await this.sendCommand(data)
      const responseBytes = await this.waitForResponse(RESPONSE_LENGTH_CHECK)
      const response = this.parseResponse(responseBytes)
      return response.activeChannels
    } finally {
      release()
    }
  }

  public async getInfo(channel: number): Promise<Response> {
    const lowChannels = (1 << (channel - 1)) & 0xff
    const highChannels = (1 << (channel - 1)) >> 8

    const data = [
      BYTE_HEADER,
      BYTE_LENGTH_4,
      EasyCommand.EASY_INFO,
      highChannels,
      lowChannels,
    ]
    const release = await mutex.acquire()
    try {
      await this.sendCommand(data)
      const responseBytes = await this.waitForResponse(RESPONSE_LENGTH_INFO)
      const response = this.parseResponse(responseBytes)
      return response
    } finally {
      release()
    }
  }

  public async sendControlCommand(
    channel: number,
    controlCommand: ControlCommand,
  ): Promise<Response> {
    const lowChannels = (1 << (channel - 1)) & 0xff
    const highChannels = (1 << (channel - 1)) >> 8

    const data = [
      BYTE_HEADER,
      BYTE_LENGTH_5,
      EasyCommand.EASY_SEND,
      highChannels,
      lowChannels,
      controlCommand,
    ]
    const release = await mutex.acquire()
    try {
      await this.sendCommand(data)
      const responseBytes = await this.waitForResponse(RESPONSE_LENGTH_INFO)
      const response = this.parseResponse(responseBytes)
      return response
    } finally {
      release()
    }
  }

  private waitForResponse(length: number): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup()
        reject(new Error('Timeout waiting for response'))
      }, 2000)

      const tryRead = () => {
        const buffer = this.serialPort.read(length)
        if (buffer) {
          cleanup()
          resolve(buffer)
        }
      }

      const cleanup = () => {
        clearTimeout(timeout)
        this.serialPort.removeListener('readable', tryRead)
      }

      this.serialPort.on('readable', tryRead)
      tryRead()
    })
  }

  private sendCommand(data: number[]): Promise<number> {
    const checksum = this.calculateChecksum(data)
    data.push(checksum)

    return new Promise((resolve, reject) => {
      this.serialPort.flush((error) => {
        if (error) reject(error)
        this.serialPort.write(data, (error: Error | null | undefined) => {
          if (error) reject(error)
          resolve(data.length)
        })
      })
    })
  }

  private readResponseBytes(length: number): string | Buffer | null {
    //Get the serial data from the serial port.
    const response = this.serialPort.read(length)
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
    const channels: number[] = []
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
