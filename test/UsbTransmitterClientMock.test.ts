import { UsbTransmitterClient } from '../src/UsbTransmitterClient'
import { ControlCommand, EasyCommand, InfoData } from '../src/domain/enums'
import { SerialPort } from 'serialport'
import { BYTE_HEADER } from '../src/domain/constants'

// Mock entire serialport module
jest.mock('serialport')

function withChecksum(bytes: number[]): Buffer {
  const sum = bytes.reduce((a, b) => a + b, 0)
  return Buffer.from([...bytes, (256 - (sum % 256)) % 256])
}

function ackFrame(channel: number, status: InfoData): Buffer {
  const mask = 1 << (channel - 1)
  return withChecksum([
    BYTE_HEADER,
    0x05,
    EasyCommand.EASY_ACK,
    (mask >> 8) & 0xff,
    mask & 0xff,
    status,
  ])
}

describe('UsbTransmitterClient (Mocked)', () => {
  let client: UsbTransmitterClient
  let mockSerialPortInstance: any
  let handlers: Record<string, (...args: any[]) => void>
  // Called after each write; lets a test decide what the "stick" answers.
  let onWrite: (data: number[]) => void

  const emitData = (buffer: Buffer) => handlers['data'](buffer)

  beforeEach(() => {
    jest.clearAllMocks()
    handlers = {}
    onWrite = () => undefined

    mockSerialPortInstance = {
      isOpen: false,
      open: jest.fn((cb) => {
        mockSerialPortInstance.isOpen = true
        if (cb) cb(null)
      }),
      close: jest.fn((cb) => {
        mockSerialPortInstance.isOpen = false
        if (cb) cb(null)
        handlers['close']?.()
      }),
      write: jest.fn((data, cb) => {
        if (cb) cb(null)
      }),
      drain: jest.fn((cb) => {
        if (cb) cb(null)
        // Answer asynchronously, like real hardware.
        const calls = mockSerialPortInstance.write.mock.calls
        const written = calls[calls.length - 1][0]
        setImmediate(() => onWrite(written))
      }),
      flush: jest.fn((cb) => {
        if (cb) cb(null)
      }),
      on: jest.fn((event: string, cb: any) => {
        handlers[event] = cb
      }),
    }
    ;(SerialPort as unknown as jest.Mock).mockImplementation(
      () => mockSerialPortInstance,
    )

    client = new UsbTransmitterClient('/dev/ttyMOCKED', {
      responseTimeoutMs: 100,
    })
  })

  test('open() should open the serial port', async () => {
    await client.open()
    expect(mockSerialPortInstance.open).toHaveBeenCalled()
    expect(mockSerialPortInstance.flush).toHaveBeenCalled()
  })

  test('open() resolves when the port is already open', async () => {
    await client.open()
    await client.open()
    expect(mockSerialPortInstance.open).toHaveBeenCalledTimes(1)
  })

  test('open() rejects without flushing when opening fails', async () => {
    mockSerialPortInstance.open.mockImplementation((cb: any) =>
      cb(new Error('busy')),
    )
    await expect(client.open()).rejects.toThrow('busy')
    expect(mockSerialPortInstance.flush).not.toHaveBeenCalled()
  })

  test('close() should close the serial port', async () => {
    await client.open()
    await client.close()
    expect(mockSerialPortInstance.close).toHaveBeenCalled()
  })

  test('close() resolves when the port is not open', async () => {
    await expect(client.close()).resolves.toBeUndefined()
    expect(mockSerialPortInstance.close).not.toHaveBeenCalled()
  })

  test('commands reopen the port if it was closed', async () => {
    onWrite = () => emitData(ackFrame(1, InfoData.INFO_TOP_POSITION_STOP))
    const response = await client.getInfo(1)
    expect(mockSerialPortInstance.open).toHaveBeenCalled()
    expect(response.status).toBe(InfoData.INFO_TOP_POSITION_STOP)
  })

  test('checkChannels() sends correct command and parses response', async () => {
    await client.open()
    onWrite = () =>
      emitData(
        withChecksum([
          BYTE_HEADER,
          0x04,
          EasyCommand.EASY_CONFIRM,
          0x00,
          0x03, // channels 1 and 2
        ]),
      )

    const channels = await client.checkChannels()
    expect(channels).toEqual([1, 2])
    expect(mockSerialPortInstance.write).toHaveBeenCalledWith(
      [BYTE_HEADER, 0x02, EasyCommand.EASY_CHECK, 0x0a],
      expect.any(Function),
    )
  })

  test('sendControlCommand() sends correct bytes', async () => {
    await client.open()
    onWrite = () => emitData(ackFrame(1, InfoData.INFO_MOVING_DOWN))

    const response = await client.sendControlCommand(1, ControlCommand.down)

    expect(response.status).toBe(InfoData.INFO_MOVING_DOWN)
    expect(response.activeChannels).toEqual([1])
    expect(mockSerialPortInstance.write).toHaveBeenCalledWith(
      expect.arrayContaining([
        BYTE_HEADER,
        0x05,
        EasyCommand.EASY_SEND,
        0,
        1,
        ControlCommand.down,
      ]),
      expect.any(Function),
    )
  })

  test('assembles a response split over several chunks', async () => {
    await client.open()
    const frame = ackFrame(2, InfoData.INFO_MOVING_UP)
    onWrite = () => {
      emitData(frame.subarray(0, 2))
      setImmediate(() => emitData(frame.subarray(2, 5)))
      setTimeout(() => emitData(frame.subarray(5)), 10)
    }

    const response = await client.getInfo(2)
    expect(response.status).toBe(InfoData.INFO_MOVING_UP)
  })

  test('ignores a late response from a previous timed-out command', async () => {
    await client.open()

    // First command: the stick does not answer in time.
    await expect(client.getInfo(1)).rejects.toThrow(
      'Timeout waiting for response',
    )
    // ...then the late answer arrives.
    emitData(ackFrame(1, InfoData.INFO_BOTTOM_POSITION_STOP))

    onWrite = () => emitData(ackFrame(2, InfoData.INFO_TOP_POSITION_STOP))
    const response = await client.getInfo(2)
    expect(response.activeChannels).toEqual([2])
    expect(response.status).toBe(InfoData.INFO_TOP_POSITION_STOP)
  })

  test('skips garbage, corrupt frames and frames for other channels', async () => {
    await client.open()
    const corrupt = Buffer.from(ackFrame(1, InfoData.INFO_MOVING_DOWN))
    corrupt[6] ^= 0xff
    onWrite = () =>
      emitData(
        Buffer.concat([
          Buffer.from([0x00, 0x13, 0x37]),
          corrupt,
          ackFrame(2, InfoData.INFO_MOVING_UP),
          ackFrame(1, InfoData.INFO_MOVING_DOWN),
        ]),
      )

    const response = await client.sendControlCommand(1, ControlCommand.down)
    expect(response.activeChannels).toEqual([1])
    expect(response.status).toBe(InfoData.INFO_MOVING_DOWN)
  })

  test('rejects with timeout when the stick does not answer', async () => {
    await client.open()
    await expect(client.getInfo(1)).rejects.toThrow(
      'Timeout waiting for response',
    )
  })

  test('rejects when the write fails', async () => {
    await client.open()
    mockSerialPortInstance.write.mockImplementation((_d: any, cb: any) =>
      cb(new Error('Port is not open')),
    )
    await expect(
      client.sendControlCommand(1, ControlCommand.up),
    ).rejects.toThrow('Port is not open')
  })

  test('rejects a pending request when the port closes', async () => {
    await client.open()
    const pending = client.getInfo(1)
    setImmediate(() => mockSerialPortInstance.close())
    await expect(pending).rejects.toThrow('Serial port closed')
  })
})
