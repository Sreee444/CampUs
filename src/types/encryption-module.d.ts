declare module '../../utils/encryption' {
  export function encryptMessage(message: unknown): string;
  export function decryptMessage(encryptedMessage: unknown): string;
}

declare module '../../../utils/encryption' {
  export function encryptMessage(message: unknown): string;
  export function decryptMessage(encryptedMessage: unknown): string;
}

declare module '*utils/encryption' {
  export function encryptMessage(message: unknown): string;
  export function decryptMessage(encryptedMessage: unknown): string;
}
