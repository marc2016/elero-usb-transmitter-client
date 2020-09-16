import { UsbTransmitterClient } from "../src/UsbTransmitterClient"
import { assert } from "console"
import { close } from "fs"

jest.setTimeout(200000)

const client = new UsbTransmitterClient('/dev/ttyUSB0')

const aktiveChannelsForTest = [1, 2]

// test('checkChannels', async () => {
//   await client.open()
//   const channels = await client.checkChannels()
//   expect(channels).toEqual(aktiveChannelsForTest)
//   await client.close()
// })

test('getInfo', async () => {
  await client.open()
  const channels = await client.getInfo(1)
  console.log(channels)
  await client.close()
})
