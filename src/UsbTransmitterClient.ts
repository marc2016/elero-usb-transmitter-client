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
  DEFAULT_BAUDRATE,
  DEFAULT_BYTESIZE,
  DEFAULT_PARITY,
  DEFAULT_STOPBITS,
} from './domain/constants'
import { Response } from './model/Response'
import { ControlCommand, EasyCommand, InfoData } from './domain/enums'
import { Mutex } from 'async-mutex'

const DEFAULT_RESPONSE_TIMEOUT_MS = 2000
// Largest frame the stick sends is 7 bytes (length byte 5); anything far
// beyond that means we are not aligned on a real header byte.
const MAX_FRAME_LENGTH_BYTE = 16

const mutex = new Mutex()

export interface UsbTransmitterClientOptions {
  /** Time to wait for a response from the stick. Default: 2000 ms. */
  responseTimeoutMs?: number
}

interface PendingResponse {
  length: number
  channelHigh?: number
  channelLow?: number
  resolve: (frame: Buffer) => void
  reject: (error: Error) => void
}

export class UsbTransmitterClient {
  serialPort: SerialPort<any>

  private readonly responseTimeoutMs: number
  private rxBuffer: Buffer = Buffer.alloc(0)
  private pending: PendingResponse | null = null

  constructor(devPath: string, options: UsbTransmitterClientOptions = {}) {
    this.responseTimeoutMs =
      options.responseTimeoutMs ?? DEFAULT_RESPONSE_TIMEOUT_MS
    this.serialPort = new SerialPort({
      path: devPath,
      baudRate: DEFAULT_BAUDRATE,
      dataBits: DEFAULT_BYTESIZE,
      parity: DEFAULT_PARITY,
      stopBits: DEFAULT_STOPBITS,
      autoOpen: false,
    })

    this.serialPort.on('data', (chunk: Buffer) => this.onData(chunk))
    // Without an 'error' listener an asynchronous port error would be thrown
    // as an uncaught exception. Errors also surface via the open/write callbacks.
    this.serialPort.on('error', () => undefined)
    this.serialPort.on('close', () => {
      this.rxBuffer = Buffer.alloc(0)
      this.rejectPending(new Error('Serial port closed'))
    })
  }

  public open(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.serialPort.isOpen) {
        resolve()
        return
      }
      this.serialPort.open((error) => {
        if (error) {
          reject(error)
          return
        }
        this.rxBuffer = Buffer.alloc(0)
        this.serialPort.flush((flushError) => {
          if (flushError) {
            reject(flushError)
            return
          }
          resolve()
        })
      })
    })
  }

  public close(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.serialPort.isOpen) {
        resolve()
        return
      }
      this.serialPort.close((error) => {
        if (error) {
          reject(error)
          return
        }
        resolve()
      })
    })
  }

  public async checkChannels(): Promise<number[]> {
    const data = [BYTE_HEADER, BYTE_LENGTH_2, EasyCommand.EASY_CHECK]
    const release = await mutex.acquire()
    try {
      await this.ensureOpen()
      const responseBytes = await this.request(data, RESPONSE_LENGTH_CHECK)
      const response = this.parseResponse(responseBytes)
      return response.activeChannels
    } finally {
      release()
    }
  }

  public async getInfo(channel: number): Promise<Response> {
    const { high, low } = this.channelMask(channel)
    const data = [BYTE_HEADER, BYTE_LENGTH_4, EasyCommand.EASY_INFO, high, low]
    const release = await mutex.acquire()
    try {
      await this.ensureOpen()
      const responseBytes = await this.request(
        data,
        RESPONSE_LENGTH_INFO,
        high,
        low,
      )
      return this.parseResponse(responseBytes)
    } finally {
      release()
    }
  }

  public async sendControlCommand(
    channel: number,
    controlCommand: ControlCommand,
  ): Promise<Response> {
    const { high, low } = this.channelMask(channel)
    const data = [
      BYTE_HEADER,
      BYTE_LENGTH_5,
      EasyCommand.EASY_SEND,
      high,
      low,
      controlCommand,
    ]
    const release = await mutex.acquire()
    try {
      await this.ensureOpen()
      const responseBytes = await this.request(
        data,
        RESPONSE_LENGTH_SEND,
        high,
        low,
      )
      return this.parseResponse(responseBytes)
    } finally {
      release()
    }
  }

  private channelMask(channel: number): { high: number; low: number } {
    const mask = 1 << (channel - 1)
    return { high: (mask >> 8) & 0xff, low: mask & 0xff }
  }

  private async ensureOpen(): Promise<void> {
    if (!this.serialPort.isOpen) {
      await this.open()
    }
  }

  /**
   * Sends a command and resolves with the first valid response frame of the
   * expected length (and channel, if given). Bytes left over from earlier
   * commands, e.g. a response that arrived after a timeout, are discarded.
   */
  private async request(
    data: number[],
    length: number,
    channelHigh?: number,
    channelLow?: number,
  ): Promise<Buffer> {
    this.rxBuffer = Buffer.alloc(0)
    const response = this.waitForResponse(length, channelHigh, channelLow)
    try {
      await this.sendCommand(data)
    } catch (error) {
      this.rejectPending(error as Error)
    }
    return response
  }

  private waitForResponse(
    length: number,
    channelHigh?: number,
    channelLow?: number,
  ): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.rejectPending(new Error('Timeout waiting for response'))
      }, this.responseTimeoutMs)

      this.pending = {
        length,
        channelHigh,
        channelLow,
        resolve: (frame) => {
          clearTimeout(timeout)
          this.pending = null
          resolve(frame)
        },
        reject: (error) => {
          clearTimeout(timeout)
          this.pending = null
          reject(error)
        },
      }
      this.processBuffer()
    })
  }

  private rejectPending(error: Error): void {
    if (this.pending) {
      this.pending.reject(error)
    }
  }

  private onData(chunk: Buffer): void {
    this.rxBuffer = Buffer.concat([this.rxBuffer, chunk])
    this.processBuffer()
  }

  private processBuffer(): void {
    while (this.pending) {
      const frame = this.extractFrame()
      if (!frame) return
      if (this.matchesPending(frame, this.pending)) {
        this.pending.resolve(frame)
        return
      }
      // Valid frame, but not the answer we are waiting for: drop it.
    }
  }

  private matchesPending(frame: Buffer, pending: PendingResponse): boolean {
    if (frame.length !== pending.length) return false
    if (pending.channelHigh !== undefined && frame[3] !== pending.channelHigh)
      return false
    if (pending.channelLow !== undefined && frame[4] !== pending.channelLow)
      return false
    return true
  }

  /**
   * Takes the next complete frame with a valid checksum out of the receive
   * buffer. Leading garbage and corrupt frames are skipped.
   */
  private extractFrame(): Buffer | null {
    for (;;) {
      const start = this.rxBuffer.indexOf(BYTE_HEADER)
      if (start === -1) {
        this.rxBuffer = Buffer.alloc(0)
        return null
      }
      if (start > 0) this.rxBuffer = this.rxBuffer.subarray(start)
      if (this.rxBuffer.length < 2) return null

      const lengthByte = this.rxBuffer[1]
      if (lengthByte < 2 || lengthByte > MAX_FRAME_LENGTH_BYTE) {
        this.rxBuffer = this.rxBuffer.subarray(1)
        continue
      }
      const frameLength = lengthByte + 2
      if (this.rxBuffer.length < frameLength) return null

      const frame = this.rxBuffer.subarray(0, frameLength)
      if (_.sum(Array.from(frame)) % 256 !== 0) {
        this.rxBuffer = this.rxBuffer.subarray(1)
        continue
      }
      this.rxBuffer = this.rxBuffer.subarray(frameLength)
      return Buffer.from(frame)
    }
  }

  private sendCommand(data: number[]): Promise<void> {
    const frame = [...data, this.calculateChecksum(data)]

    return new Promise((resolve, reject) => {
      this.serialPort.flush((flushError) => {
        if (flushError) {
          reject(flushError)
          return
        }
        this.serialPort.write(frame, (writeError: Error | null | undefined) => {
          if (writeError) {
            reject(writeError)
            return
          }
          this.serialPort.drain((drainError) => {
            if (drainError) {
              reject(drainError)
              return
            }
            resolve()
          })
        })
      })
    })
  }

  private calculateChecksum(data: number[]): number {
    //Calculate checksum.
    //All the sum of all bytes (Header to CS) must be 0x00.
    const sum = _.sum(data)
    const result = (256 - (sum % 256)) % 256
    return result
  }

  private getActiveChannels(byte: number, start: number): number[] {
    const channels: number[] = []
    for (let i = 0; i < 8; i++) {
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
