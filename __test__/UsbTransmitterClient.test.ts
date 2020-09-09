import { UsbTransmitterClient } from "../src/UsbTransmitterClient"
import { assert } from "console"
import { close } from "fs"

jest.setTimeout(20000)

const client = new UsbTransmitterClient('/dev/ttyUSB0')

const aktiveChannelsForTest = [1, 2]

test('checkChannels', async () => {
  await client.open()
  const channels = await client.checkChannels()
  expect(channels).toEqual(aktiveChannelsForTest)
  await client.close()
})