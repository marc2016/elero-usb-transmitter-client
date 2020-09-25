import { Dictionary } from './types'

// Default serial connection details.
export const DEFAULT_BAUDRATE = 38400
export const DEFAULT_BYTESIZE = 8
export const DEFAULT_PARITY = 'none'
export const DEFAULT_STOPBITS = 1

// values to bit shift.
export const HEX_255: number = 0xff
export const BIT_8: number = 8

// Header for all command.
export const BYTE_HEADER: number = 0xaa
// command lengths
export const BYTE_LENGTH_2: number = 0x02
export const BYTE_LENGTH_4: number = 0x04
export const BYTE_LENGTH_5: number = 0x05

// required response lenth.
export const RESPONSE_LENGTH_CHECK: number = 6
// required response lenth.
export const RESPONSE_LENGTH_SEND: number = 7
// Required response lenth.
export const RESPONSE_LENGTH_INFO: number = 7
// for Serial error handling
export const NO_SERIAL_RESPONSE: string = ''

// Info to receive response.
export const INFO_UNKNOWN = 'unknown response'
export const INFO_NO_INFORMATION = 'no information'
export const INFO_TOP_POSITION_STOP = 'top position stop'
export const INFO_BOTTOM_POSITION_STOP = 'bottom position stop'
export const INFO_INTERMEDIATE_POSITION_STOP = 'intermediate position stop'
export const INFO_TILT_VENTILATION_POS_STOP = 'tilt ventilation position stop'
export const INFO_BLOCKING = 'blocking'
export const INFO_OVERHEATED = 'overheated'
export const INFO_TIMEOUT = 'timeout'
export const INFO_START_TO_MOVE_UP = 'start to move up'
export const INFO_START_TO_MOVE_DOWN = 'start to move down'
export const INFO_MOVING_UP = 'moving up'
export const INFO_MOVING_DOWN = 'moving down'
export const INFO_STOPPED_IN_UNDEFINED_POSITION =
  'stopped in undefined position'
export const INFO_TOP_POS_STOP_WICH_TILT_POS =
  'top position stop wich is tilt position'
export const INFO_BOTTOM_POS_STOP_WICH_INT_POS =
  'bottom position stop wich is intermediate position'
export const INFO_SWITCHING_DEVICE_SWITCHED_OFF =
  'switching device switched off'
export const INFO_SWITCHING_DEVICE_SWITCHED_ON = 'switching device switched on'

