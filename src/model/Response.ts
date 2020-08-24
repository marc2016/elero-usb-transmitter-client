export interface Response {
  header: number

  length: number

  command: number

  activeChannels: number[]

  checksum: number

  status: string

  statusCode: number
}
