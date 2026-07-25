#!/usr/bin/env node
import { Command } from 'commander'
import * as inquirer from 'inquirer'
import { UsbTransmitterClient } from './UsbTransmitterClient'
import { ControlCommand } from './domain/enums'
import { SerialPort } from 'serialport'

const program = new Command()
let client: UsbTransmitterClient | null = null

program
  .version('1.2.1')
  .option('-p, --port <path>', 'Path to serial port')
  .parse(process.argv)

const options = program.opts()

async function main() {
  let portPath = options.port

  if (!portPath) {
    const ports = await SerialPort.list()
    const portChoices = ports.map((p) => ({
      name: `${p.path} ${p.manufacturer || ''}`,
      value: p.path,
    }))

    if (portChoices.length === 0) {
      console.error('No serial ports found. Please specify one with --port.')
      process.exit(1)
    }

    const answer = await inquirer.prompt([
      {
        type: 'list',
        name: 'port',
        message: 'Select Serial Port',
        choices: portChoices,
      },
    ])
    portPath = answer.port
  }

  client = new UsbTransmitterClient(portPath)

  try {
    await client.open()
    console.log(`Connected to ${portPath}`)
    await mainMenu()
  } catch (error) {
    console.error('Error connecting to device:', error)
    process.exit(1)
  }
}

async function mainMenu() {
  const answer = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: 'Main Menu',
      choices: [
        { name: 'Check Channels', value: 'check' },
        { name: 'Select Channel', value: 'select' },
        new inquirer.Separator(),
        { name: 'Exit', value: 'exit' },
      ],
    },
  ])

  switch (answer.action) {
    case 'check':
      await checkChannels()
      break
    case 'select':
      await selectChannel()
      break
    case 'exit':
      await client!.close()
      process.exit(0)
  }
}

async function checkChannels() {
  console.log('Checking channels...')
  try {
    const channels = await client!.checkChannels()
    console.log('Active Channels:', channels.join(', '))
  } catch (error) {
    console.error('Error checking channels:', error)
  }
  await mainMenu()
}

async function selectChannel() {
  const answer = await inquirer.prompt([
    {
      type: 'input',
      name: 'channel',
      message: 'Enter Channel Number (1-9):',
      validate: (input) => {
        const num = parseInt(input, 10)
        if (isNaN(num) || num < 1 || num > 9) {
          return 'Please enter a number between 1 and 9'
        }
        return true
      },
    },
  ])

  const channel = parseInt(answer.channel, 10)
  await channelMenu(channel)
}

async function channelMenu(channel: number) {
  const answer = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: `Channel ${channel} Actions`,
      choices: [
        { name: 'Get Info', value: 'info' },
        { name: 'Move Up', value: 'up' },
        { name: 'Move Down', value: 'down' },
        { name: 'Stop', value: 'stop' },
        new inquirer.Separator(),
        { name: 'Back to Main Menu', value: 'back' },
      ],
    },
  ])

  if (answer.action === 'back') {
    await mainMenu()
    return
  }

  try {
    if (answer.action === 'info') {
      const info = await client!.getInfo(channel)
      console.log('Channel Info:', info)
    } else {
      let cmd: ControlCommand
      switch (answer.action) {
        case 'up':
          cmd = ControlCommand.up
          break
        case 'down':
          cmd = ControlCommand.down
          break
        case 'stop':
          cmd = ControlCommand.stop
          break
        default:
          throw new Error('Unknown command')
      }
      console.log(`Sending ${answer.action} command to channel ${channel}...`)
      const response = await client!.sendControlCommand(channel, cmd)
      console.log('Response:', response)
    }
  } catch (error) {
    console.error('Error executing command:', error)
  }

  await channelMenu(channel)
}

main().catch((err) => {
  console.error('Unexpected error:', err)
  process.exit(1)
})
