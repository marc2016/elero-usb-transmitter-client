import { UsbTransmitterClient } from "../src/UsbTransmitterClient"
import { ControlCommand, EasyCommand, InfoData } from "../src/domain/enums"
import * as fs from 'fs'

jest.setTimeout(200000)

const devPath = '/dev/ttyUSB0'
const client = new UsbTransmitterClient(devPath)

const aktiveChannelsForTest = [1, 2]

// Skip tests if hardware not present
const describeHardware = fs.existsSync(devPath) ? describe : describe.skip

describeHardware('Integration Tests (Hardware)', () => {

  test('checkChannels', async () => {
    await client.open()
    const channels = await client.checkChannels()
    expect(channels).toEqual(aktiveChannelsForTest)
    await client.close()
  })

  test('getInfo', async () => {
    await client.open()
    const response = await client.getInfo(1)
    console.log(response)
    expect(response.command).toEqual(EasyCommand.EASY_ACK)
    await client.close()
  })

  test('sendControlCommand', async () => {
    await client.open()
    const response = await client.sendControlCommand(1, ControlCommand.down)
    console.log(response)
    expect(response.status).toEqual(InfoData.INFO_MOVING_DOWN)
    await client.close()
  })
})
