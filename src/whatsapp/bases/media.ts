import { downloadMediaMessage } from '@whiskeysockets/baileys'
import { BOT_PASSWORD } from 'src/config/config'
import { extractJidFromMessage, getCaptionAttribute } from 'src/util/baileys'
import Sticker, { StickerTypes } from 'wa-sticker-formatter'
import {
    ExtractStickerMediaData,
    ExtractViewOnceMediaData,
    ValueMessageMedia,
    WhatsappMessage,
    WhatsappMessageQuoted,
} from '../interface'

export class MediaMessage {
    private message: WhatsappMessage

    constructor(message: WhatsappMessage) {
        this.message = JSON.parse(JSON.stringify(message))
    }

    static getMessageMedia(message: WhatsappMessage['message']): ValueMessageMedia {
        if (message?.imageMessage) {
            return { media: message.imageMessage, type: 'image', viewOnce: false }
        }
        if (message?.videoMessage) {
            return { media: message.videoMessage, type: 'video', viewOnce: false }
        }

        if (message?.viewOnceMessageV2?.message?.imageMessage) {
            return { media: message?.viewOnceMessageV2?.message?.imageMessage, type: 'image', viewOnce: true }
        }
        if (message?.viewOnceMessageV2?.message?.videoMessage) {
            return { media: message?.viewOnceMessageV2?.message?.videoMessage, type: 'video', viewOnce: true }
        }

        if (message?.viewOnceMessage?.message?.imageMessage) {
            return { media: message?.viewOnceMessage?.message?.imageMessage, type: 'image', viewOnce: true }
        }
        if (message?.viewOnceMessage?.message?.videoMessage) {
            return { media: message?.viewOnceMessage?.message?.videoMessage, type: 'video', viewOnce: true }
        }

        return null
    }

    async extractStickerMedia(pack: string, author?: string): Promise<ExtractStickerMediaData> {
        if (!this.shouldConvertSticker()) {
            return null
        }

        const targetJid = extractJidFromMessage(this.message)
        if (!targetJid) {
            return null
        }

        const media = await downloadMediaMessage(this.message, 'buffer', {})

        const sticker = new Sticker(media as Buffer, {
            quality: 50,
            type: StickerTypes.CROPPED,
            author,
            pack,
        })
        const buffer = await sticker.toBuffer()

        return { targetJid, message: { sticker: buffer } }
    }

    async extractViewOnceMedia(): Promise<ExtractViewOnceMediaData> {
        if (!this.shouldConvertViewOnceMedia()) {
            return null
        }

        const targetJid = extractJidFromMessage(this.message)
        if (!targetJid) {
            return null
        }

        const viewOnce = this.message?.message?.viewOnceMessage || this.message?.message?.viewOnceMessageV2

        for (const key in viewOnce.message) {
            const data = viewOnce.message[key]
            if (data?.viewOnce) {
                data.viewOnce = false
            }
        }
        this.message.message = viewOnce.message

        return { targetJid, message: { forward: this.message } }
    }

    private checkPassword(caption: string): boolean {
        if (!BOT_PASSWORD) return true

        return getCaptionAttribute(caption, 'password') === BOT_PASSWORD
    }

    private checkQuotedMessage() {
        const quoMessage = this.message?.message?.extendedTextMessage

        const media = MediaMessage.getMessageMedia(quoMessage?.contextInfo?.quotedMessage)
        if (!media) return

        const caption = quoMessage.text.toLowerCase().trim()
        const destination = getCaptionAttribute(caption, 'destination')

        const quoted: WhatsappMessageQuoted = { message: caption }
        switch (destination) {
            case 'sender':
                quoted.sendToJid = quoMessage.contextInfo.participant
                break
            case 'me':
                quoted.sendToJid = this.message.key?.participant
                break
        }

        this.message.message = quoMessage.contextInfo.quotedMessage
        this.message.quoted = quoted
    }

    private shouldConvertSticker(): boolean {
        this.checkQuotedMessage()

        const stickerMedia = MediaMessage.getMessageMedia(this.message.message)

        if (stickerMedia?.type !== 'image' || stickerMedia?.viewOnce) {
            return false
        }

        const baseCaption = this.message?.quoted?.message || stickerMedia?.media?.caption
        const caption = baseCaption?.toLowerCase()?.trim?.()
        if (!caption?.startsWith('#convert_sticker') && !caption?.startsWith('#sticker')) {
            return false
        }

        return this.checkPassword(caption)
    }

    private shouldConvertViewOnceMedia(): boolean {
        this.checkQuotedMessage()

        const viewOnceMedia = MediaMessage.getMessageMedia(this.message.message)

        if (!viewOnceMedia?.viewOnce) {
            return false
        }

        const baseCaption = this.message?.quoted?.message || viewOnceMedia?.media?.caption
        const caption = baseCaption?.toLowerCase()?.trim?.()
        if (!caption?.startsWith('#download_view_once')) {
            return false
        }

        return this.checkPassword(caption)
    }
}
