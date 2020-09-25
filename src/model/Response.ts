import { EasyCommand, InfoData } from "../domain/enums";

export interface Response {
  header: number

  length: number

  command: EasyCommand

  activeChannels: number[]

  checksum: number

  status: InfoData | null

  statusCode: number
}
