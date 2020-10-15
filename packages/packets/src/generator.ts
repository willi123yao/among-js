import ByteBuffer from 'bytebuffer'
import {
  GameDataType,
  PayloadType,
  assertJoinGameRequestPayloadPacket,
  DataGameDataPacket,
  GameDataPacket,
  GameDataPayloadPacket,
  GameDataToPayloadPacket,
  PayloadPacket,
  RPCGameDataPacket,
  SceneChangeGameDataPacket,
  prettyGameDataType,
  prettyPayloadType,
  prettyRPCFlag,
  RPCFlag
} from '@among-js/data'
import { pack } from '@among-js/util'
import { gameOptionsLength, writeGameOptions } from './game-options'

const generateDataGameDataPacket = (packet: DataGameDataPacket): ByteBuffer => {
  const packedNetId = pack(packet.netId)

  const buffer = new ByteBuffer(3 + packedNetId.length + 11, true)
  buffer.writeInt16(11)
  buffer.writeByte(packet.type)

  buffer.append(packedNetId)
  buffer.writeUint16(packet.sequence)
  packet.position.write(buffer)
  packet.velocity.write(buffer)

  return buffer
}

const generateSceneChangeGameDataPacket = (
  packet: SceneChangeGameDataPacket
): ByteBuffer => {
  const packedPlayerId = pack(packet.playerId)
  const size = packedPlayerId.length + 1 + packet.location.length

  const buffer = new ByteBuffer(3 + size, true)
  buffer.writeInt16(size)
  buffer.writeByte(packet.type)

  buffer.append(packedPlayerId)
  buffer.writeByte(packet.location.length)
  buffer.writeString(packet.location)

  return buffer
}

const generateRPCGameDataPacket = (packet: RPCGameDataPacket): ByteBuffer => {
  switch (packet.flag) {
    case RPCFlag.SyncSettings: {
      const packedNetId = pack(packet.netId)
      const buffer = new ByteBuffer(
        3 + packedNetId.length + 1 + gameOptionsLength,
        true
      )

      buffer.writeInt16(packedNetId.length + 1 + gameOptionsLength)
      buffer.writeByte(packet.type)

      buffer.append(packedNetId)
      buffer.writeByte(packet.flag)

      writeGameOptions(packet.gameOptions, buffer)
      return buffer
    }

    case RPCFlag.CheckName: {
      const packedNetId = pack(packet.netId)
      const buffer = new ByteBuffer(
        3 + packedNetId.length + 2 + packet.name.length,
        true
      )

      buffer.writeInt16(packedNetId.length + 2 + packet.name.length)
      buffer.writeByte(packet.type)

      buffer.append(packedNetId)
      buffer.writeByte(packet.flag)

      buffer.writeByte(packet.name.length)
      buffer.writeString(packet.name)

      return buffer
    }

    case RPCFlag.CheckColor: {
      const packedNetId = pack(packet.netId)
      const buffer = new ByteBuffer(3 + packedNetId.length + 2, true)

      buffer.writeInt16(packedNetId.length + 2)
      buffer.writeByte(packet.type)

      buffer.append(packedNetId)
      buffer.writeByte(packet.flag)

      buffer.writeByte(packet.color)
      return buffer
    }

    default: {
      console.warn(
        `Generated data-only packet of type ${prettyRPCFlag(packet.flag)}`
      )

      const packedNetId = pack(packet.netId)
      const buffer = new ByteBuffer(
        3 + packedNetId.length + 1 + packet.data.capacity(),
        true
      )
      buffer.writeInt16(11)
      buffer.writeByte(packet.type)

      buffer.append(packedNetId)
      buffer.writeByte(packet.flag)
      buffer.append(packet.data.buffer)

      return buffer
    }
  }
}

const genericGameDataPacketSwitch = (part: GameDataPacket): ByteBuffer => {
  switch (part.type) {
    case GameDataType.Data: {
      return generateDataGameDataPacket(part)
    }

    case GameDataType.RPC: {
      return generateRPCGameDataPacket(part)
    }

    case GameDataType.SceneChange: {
      return generateSceneChangeGameDataPacket(part)
    }

    default: {
      console.warn(
        `Game data packet of type ${prettyGameDataType(
          part.type
        )} wasn't able to be generated`
      )
      return new ByteBuffer(0)
    }
  }
}

const generateGameDataPayloadPacket = (
  packet: GameDataPayloadPacket
): ByteBuffer => {
  const serializedParts: ByteBuffer[] = []

  for (const part of packet.parts) {
    serializedParts.push(genericGameDataPacketSwitch(part))
  }

  const size = serializedParts.reduce((acc, bb) => acc + bb.capacity(), 0)
  const buffer = new ByteBuffer(7 + size, true)

  buffer.writeInt16(4 + size)
  buffer.writeByte(packet.type)
  buffer.writeInt32(packet.code)

  for (const bb of serializedParts) {
    buffer.append(bb.buffer)
  }
  return buffer
}

const generateGameDataToPayloadPacket = (
  packet: GameDataToPayloadPacket
): ByteBuffer => {
  const serializedParts: ByteBuffer[] = []

  for (const part of packet.parts) {
    serializedParts.push(genericGameDataPacketSwitch(part))
  }

  const packedRecipient = pack(packet.recipient)
  const size = serializedParts.reduce((acc, bb) => acc + bb.capacity(), 0)
  const buffer = new ByteBuffer(7 + packedRecipient.length + size, true)

  buffer.writeInt16(4 + packedRecipient.length + size)
  buffer.writeByte(packet.type)
  buffer.writeInt32(packet.code)
  buffer.append(packedRecipient)

  for (const bb of serializedParts) {
    buffer.append(bb.buffer)
  }
  return buffer
}

export const generatePayloads = (packets: PayloadPacket[]): ByteBuffer => {
  const serializedPackets: ByteBuffer[] = []

  for (const packet of packets) {
    switch (packet.type) {
      case PayloadType.GameData: {
        serializedPackets.push(generateGameDataPayloadPacket(packet))
        break
      }

      case PayloadType.GameDataTo: {
        serializedPackets.push(generateGameDataToPayloadPacket(packet))
        break
      }

      case PayloadType.JoinGame: {
        assertJoinGameRequestPayloadPacket(packet)

        const bb = new ByteBuffer(8, true)
        bb.writeInt16(5)
        bb.writeByte(packet.type)
        bb.writeInt32(packet.code)
        bb.writeByte(7)
        serializedPackets.push(bb)

        break
      }

      default: {
        console.warn(
          `Packet of type ${prettyPayloadType(
            packet.type
          )} wasn't able to be generated`
        )
      }
    }
  }

  const buffer = new ByteBuffer(
    serializedPackets.reduce((acc, bb) => acc + bb.capacity(), 0),
    true
  )
  for (const bb of serializedPackets) {
    buffer.append(bb.buffer)
  }
  return buffer
}
