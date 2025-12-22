
import { UsbTransmitterClient } from '../src/UsbTransmitterClient'
import { ControlCommand, EasyCommand, InfoData } from '../src/domain/enums'
import { SerialPort } from 'serialport'
import { BYTE_HEADER } from '../src/domain/constants'

// Mock entire serialport module
jest.mock('serialport')

describe('UsbTransmitterClient (Mocked)', () => {
    let client: UsbTransmitterClient
    let mockSerialPortInstance: any

    beforeEach(() => {
        // Reset mocks
        jest.clearAllMocks()

        // Setup mock instance
        mockSerialPortInstance = {
            isOpen: false,
            open: jest.fn((cb) => {
                mockSerialPortInstance.isOpen = true
                if (cb) cb(null)
            }),
            close: jest.fn((cb) => {
                mockSerialPortInstance.isOpen = false
                if (cb) cb(null)
            }),
            write: jest.fn((data, cb) => {
                if (cb) cb(null)
            }),
            flush: jest.fn((cb) => {
                if (cb) cb(null)
            }),
            once: jest.fn(),
            read: jest.fn(),
            pipe: jest.fn(),
            on: jest.fn(),
            removeListener: jest.fn()
        }

            // When new SerialPort() is called, return our mock instance
            ; (SerialPort as unknown as jest.Mock).mockImplementation(() => mockSerialPortInstance)

        client = new UsbTransmitterClient('/dev/ttyMOCKED')
    })

    test('open() should open the serial port', async () => {
        await client.open()
        expect(mockSerialPortInstance.open).toHaveBeenCalled()
        expect(mockSerialPortInstance.flush).toHaveBeenCalled()
    })

    test('close() should close the serial port', async () => {
        await client.close()
        expect(mockSerialPortInstance.close).toHaveBeenCalled()
    })

    test('checkChannels() calls correct command and parses response', async () => {
        await client.open()

        // Simulate "readable" event and data read
        mockSerialPortInstance.once.mockImplementation((event: string, cb: Function) => {
            if (event === 'readable') {
                // Trigger the callback immediately to simulate data ready
                cb()
            }
        })

        // Mock response for check channels (Head, Len, Cmd, Byte3...CS)
        // Response length check is 6 bytes.
        // Byte 3 is bitmap of active channels (1-8). let's say ch 1 and 2 are active (binary 00000011 = 3)
        const responseBuffer = Buffer.from([
            BYTE_HEADER, // 0xAA
            0x04, // Length
            EasyCommand.EASY_CHECK,
            0x00, // High channels (starts at 9)
            0x03, // Low channels (starts at 1, so 1 & 2)
            0x00 // Checksum (ignored for now in mock, or we calculate it if logic is strict)
        ])
        // Fix checksum if logic requires it: 256 - sum
        const sum = responseBuffer[0] + responseBuffer[1] + responseBuffer[2] + responseBuffer[3] + responseBuffer[4]
        responseBuffer[5] = (256 - (sum % 256)) % 256

        mockSerialPortInstance.read.mockReturnValue(responseBuffer)

        const channels = await client.checkChannels()
        expect(channels).toEqual(expect.arrayContaining([1, 2]))
        expect(mockSerialPortInstance.write).toHaveBeenCalledWith(
            expect.arrayContaining([BYTE_HEADER, 0x02, EasyCommand.EASY_CHECK]),
            expect.any(Function)
        )
    })

    test('sendControlCommand() sends correct bytes', async () => {
        await client.open()

        mockSerialPortInstance.once.mockImplementation((event: string, cb: Function) => {
            if (event === 'readable') cb()
        })

        // Response for Info (length 7)
        // 0: AA, 1: 05, 2: EASY_SEND, 3: high, 4: low, 5: status, 6: CS
        const responseBuffer = Buffer.from([
            BYTE_HEADER,
            0x05,
            EasyCommand.EASY_SEND,
            0x00,
            0x01, // Channel 1 bit mask
            InfoData.INFO_MOVING_DOWN,
            0x00
        ])
        const sum = responseBuffer.slice(0, 6).reduce((a, b) => a + b, 0)
        responseBuffer[6] = (256 - (sum % 256)) % 256

        mockSerialPortInstance.read.mockReturnValue(responseBuffer)

        const response = await client.sendControlCommand(1, ControlCommand.down)

        expect(response.status).toBe(InfoData.INFO_MOVING_DOWN)

        // Verify write arguments
        // Data: [AA, 05, EASY_SEND, high, low, cmd, CS]
        // Channel 1 -> low=1, high=0
        expect(mockSerialPortInstance.write).toHaveBeenCalledWith(
            expect.arrayContaining([
                BYTE_HEADER,
                0x05,
                EasyCommand.EASY_SEND,
                0,
                1,
                ControlCommand.down
            ]),
            expect.any(Function)
        )
    })
    test('getInfo() should handle fragmented packets (reproduction fix)', async () => {
        await client.open()

        let readableCallback: Function | null = null;
        mockSerialPortInstance.on.mockImplementation((event: string, cb: Function) => {
            if (event === 'readable') {
                readableCallback = cb
            }
        })

        let readCallCount = 0
        mockSerialPortInstance.read.mockImplementation((len: number) => {
            readCallCount++
            if (readCallCount === 1) {
                return null // Not enough data yet
            }
            // Return dummy response buffer for getInfo call
            const responseBuffer = Buffer.from([
                BYTE_HEADER,
                0x05,
                EasyCommand.EASY_SEND,
                0x00,
                0x01,
                InfoData.INFO_MOVING_DOWN,
                0x00
            ])
            const sum = responseBuffer.slice(0, 6).reduce((a, b) => a + b, 0)
            responseBuffer[6] = (256 - (sum % 256)) % 256
            return responseBuffer
        })

        const infoPromise = client.getInfo(1)

        // Wait a tick to ensure tryRead() ran once and failed
        await new Promise(r => process.nextTick(r))

        // Now trigger readable event again (simulation of second packet arriving)
        if (readableCallback) {
            (readableCallback as Function)()
        }

        const response = await infoPromise
        expect(response.status).toBe(InfoData.INFO_MOVING_DOWN)
        expect(readCallCount).toBeGreaterThanOrEqual(2)
    })
})
